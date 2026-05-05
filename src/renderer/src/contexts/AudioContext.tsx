import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react'
import { Howl } from 'howler'

export interface Track {
  id: string
  title: string
  artist: string
  album?: string
  url: string
  cover?: string
  addedAt?: number
  lyrics?: string
  duration?: number
  needsTranscoding?: boolean
  format?: {
    container?: string
    codec?: string
    bitrate?: number
    sampleRate?: number
    lossless?: boolean
  }
  playCount?: number
}

interface AudioContextType {
  currentTrack: Track | null
  queue: Track[]
  recentlyPlayed: Track[]
  currentIndex: number
  isPlaying: boolean
  repeatMode: 'off' | 'all' | 'one'
  isShuffle: boolean
  play: (track: Track) => void
  playQueue: (tracks: Track[], startIndex?: number) => void
  addTracksToQueue: (tracks: Track[]) => void
  playNext: () => void
  playPrev: () => void
  pause: () => void
  resume: () => void
  seek: (pos: number) => void
  toggleRepeatMode: () => void
  toggleShuffle: () => void
  duration: number
  currentTime: number
  volume: number
  setVolume: (v: number) => void
  removeTrack: (trackId: string, e?: React.MouseEvent) => void
  clearQueue: () => void
  favorites: Track[]
  toggleFavorite: (track: Track) => void
}

const AudioContext = createContext<AudioContextType | null>(null)

const STORAGE_KEY = 'luma-music-state'
const STATS_KEY = 'luma-music-stats'
const OLD_STORAGE_KEY = 'sanseong-music-state'
const OLD_STATS_KEY = 'sanseong-music-stats'

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [queue, setQueue] = useState<Track[]>([])
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([])
  const [favorites, setFavorites] = useState<Track[]>([])
  const [originalQueue, setOriginalQueue] = useState<Track[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const currentTrack = currentIndex >= 0 ? queue[currentIndex] : null
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off')
  const [isShuffle, setIsShuffle] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [playCounts, setPlayCounts] = useState<Record<string, number>>({})

  const [howl, setHowl] = useState<Howl | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.5)

  const queueRef = useRef(queue)
  const currentIndexRef = useRef(currentIndex)
  const repeatModeRef = useRef(repeatMode)
  const howlRef = useRef<Howl | null>(null)     // 항상 최신 Howl 인스턴스 참조
  
  useEffect(() => { queueRef.current = queue }, [queue])
  useEffect(() => { currentIndexRef.current = currentIndex }, [currentIndex])
  useEffect(() => { repeatModeRef.current = repeatMode }, [repeatMode])

  // Load state and stats
  useEffect(() => {
    const init = async () => {
      // Migration logic
      if (!localStorage.getItem(STORAGE_KEY) && localStorage.getItem(OLD_STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, localStorage.getItem(OLD_STORAGE_KEY)!)
        localStorage.removeItem(OLD_STORAGE_KEY)
      }
      if (!localStorage.getItem(STATS_KEY) && localStorage.getItem(OLD_STATS_KEY)) {
        localStorage.setItem(STATS_KEY, localStorage.getItem(OLD_STATS_KEY)!)
        localStorage.removeItem(OLD_STATS_KEY)
      }

      const savedState = localStorage.getItem(STORAGE_KEY)
      const savedStats = localStorage.getItem(STATS_KEY)
      
      if (savedStats) {
        try { setPlayCounts(JSON.parse(savedStats)) } catch(e) {}
      }

      if (savedState) {
        try {
          const state = JSON.parse(savedState)
          const paths = (state.queuePaths || []).filter(p => !p.startsWith('http'))
          const recentPaths = (state.recentPaths || []).filter(p => !p.startsWith('http'))
          const favPaths = (state.favoritesPaths || []).filter(p => !p.startsWith('http'))
          
          let restoredQueue: Track[] = []
          if (paths.length > 0) {
            restoredQueue = await window.api.getTracksByPaths(paths)
          }
          if (recentPaths.length > 0) {
            const restoredRecent = await window.api.getTracksByPaths(recentPaths)
            setRecentlyPlayed(restoredRecent)
          }
          if (favPaths.length > 0) {
            const restoredFavs = await window.api.getTracksByPaths(favPaths)
            setFavorites(restoredFavs)
          }
          
          setQueue(restoredQueue)
          setOriginalQueue(restoredQueue)

          const targetIdx = state.currentIndex ?? -1
          if (targetIdx >= 0 && targetIdx < restoredQueue.length) {
            setCurrentIndex(targetIdx)
            _prepareHowl(restoredQueue[targetIdx], false)
          }

          if (state.volume !== undefined) setVolume(state.volume)
          if (state.repeatMode) setRepeatMode(state.repeatMode)
          if (state.isShuffle !== undefined) setIsShuffle(state.isShuffle)
        } catch (e) {
          console.error('[AudioProvider] Init Error:', e)
        }
      }
      setIsLoaded(true)
    }
    init()
  }, [])


  // Save state
  useEffect(() => {
    if (!isLoaded) return
    const state = {
      queuePaths: queue.map(t => t.id),
      recentPaths: recentlyPlayed.map(t => t.id),
      favoritesPaths: favorites.map(t => t.id),
      currentIndex,
      volume,
      repeatMode,
      isShuffle
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    localStorage.setItem(STATS_KEY, JSON.stringify(playCounts))
  }, [queue, recentlyPlayed, favorites, currentIndex, volume, repeatMode, isShuffle, isLoaded, playCounts])


  const incrementPlayCount = (trackId: string) => {
    setPlayCounts(prev => ({
      ...prev,
      [trackId]: (prev[trackId] || 0) + 1
    }))
  }

  const _prepareHowl = async (track: Track, autoPlay: boolean = false) => {
    setRecentlyPlayed(prev => {
      const filtered = prev.filter(t => t.id !== track.id)
      return [track, ...filtered].slice(0, 30) // 최대 30개 기록
    })

    // 이전 오디오 인스턴스 즉시 정지 및 해제
    if (howlRef.current) {
      howlRef.current.off() // 이벤트 핸들러 제거
      howlRef.current.stop()
      howlRef.current.unload()
      howlRef.current = null
    }
    setHowl(null)

    let finalUrl = track.url

    if (track.needsTranscoding) {
      try {
        const port = await window.api.getTranscodePort()
        if (port) {
          finalUrl = `http://127.0.0.1:${port}/stream?path=${encodeURIComponent(track.id)}`
        }
      } catch (e) {
        console.error('Failed to get transcode port', e)
      }
    }

    // 로딩 완료 시점에 다른 track이 이미 ref에 있으면 중단
    if (howlRef.current !== null) return

    const newHowl = new Howl({
      src: [finalUrl],
      html5: true,
      preload: true,
      format: track.needsTranscoding ? ['wav'] : ['flac', 'mp3', 'wav', 'm4a', 'alac', 'mp4', 'aac', 'ogg', 'webm'],
      volume,
      onplay: () => {
        setIsPlaying(true)
        const d = newHowl.duration()
        setDuration(d === Infinity || d === 0 ? track.duration || 0 : d)
      },
      onload: () => {
        const d = newHowl.duration()
        setDuration(d === Infinity || d === 0 ? track.duration || 0 : d)
      },
      onpause: () => setIsPlaying(false),
      onstop: () => setIsPlaying(false),
      onend: () => handleTrackEnd(),
      onloaderror: (id, err) => {
        console.warn('Howler onloaderror:', err, 'falling back to transcoding...')
        if (!track.needsTranscoding) {
          track.needsTranscoding = true
          _prepareHowl(track, autoPlay)
        }
      },
      onplayerror: (id, err) => {
        console.warn('Howler onplayerror:', err, 'falling back to transcoding...')
        if (!track.needsTranscoding) {
          track.needsTranscoding = true
          _prepareHowl(track, autoPlay)
        }
      }
    })
    howlRef.current = newHowl
    setHowl(newHowl)
    if (autoPlay) newHowl.play()
  }

  const handleTrackEnd = () => {
    setIsPlaying(false)
    setCurrentTime(0)
    if (currentIndexRef.current >= 0) incrementPlayCount(queueRef.current[currentIndexRef.current].id)

    if (repeatModeRef.current === 'one') {
      _prepareHowl(queueRef.current[currentIndexRef.current], true)
    } else {
      const nextIdx = currentIndexRef.current + 1
      if (nextIdx < queueRef.current.length) {
        setCurrentIndex(nextIdx)
        _prepareHowl(queueRef.current[nextIdx], true)
      } else if (repeatModeRef.current === 'all' && queueRef.current.length > 0) {
        setCurrentIndex(0)
        _prepareHowl(queueRef.current[0], true)
      } else {
        setIsPlaying(false)
        setCurrentTime(0)
      }
    }
  }

  // Audio Sync Effect
  useEffect(() => {
    if (howl) {
      const interval = setInterval(() => {
        if (isPlaying) setCurrentTime(howl.seek() as number)
      }, 100)
      return () => clearInterval(interval)
    }
  }, [howl, isPlaying])

  const playQueue = (tracks: Track[], startIndex: number = 0) => {
    if (tracks.length === 0) return
    setQueue(tracks)
    if (!isShuffle) setOriginalQueue([...tracks])
    setCurrentIndex(startIndex)
    _prepareHowl(tracks[startIndex], true)
  }

  // 기존 큐에 새 로컬 트랙 추가 (중복 제거, 현재 재생 곡 유지)
  const addTracksToQueue = (newTracks: Track[]) => {
    if (newTracks.length === 0) return

    setQueue(prev => {
      const currentTrackId = currentIndexRef.current >= 0 ? prev[currentIndexRef.current]?.id : null
      const deduped = newTracks.filter(t => !prev.find(p => p.id === t.id))
      if (deduped.length === 0) return prev

      const updated = [...prev, ...deduped]
      setOriginalQueue(updated)

      if (currentTrackId) {
        const newIdx = updated.findIndex(t => t.id === currentTrackId)
        if (newIdx !== -1) setCurrentIndex(newIdx)
      } else if (currentIndexRef.current === -1 && deduped.length > 0) {
        setCurrentIndex(0)
        _prepareHowl(deduped[0], true)
      }
      return updated
    })
  }

  const play = (track: Track) => {
    // If track is not in current queue, prepend it
    const existingIdx = queue.findIndex(t => t.id === track.id)
    if (existingIdx !== -1) {
      setCurrentIndex(existingIdx)
      _prepareHowl(queue[existingIdx], true)
    } else {
      const newQueue = [track, ...queue]
      setQueue(newQueue)
      setOriginalQueue([track, ...originalQueue])
      setCurrentIndex(0)
      _prepareHowl(track, true)
    }
  }

  const playNext = () => {
    let nextIdx = currentIndex + 1
    if (nextIdx >= queue.length) {
      if (repeatMode === 'all') nextIdx = 0
      else return
    }
    setCurrentIndex(nextIdx)
    _prepareHowl(queue[nextIdx], true)
  }
  const playPrev = () => {
    if (currentIndex - 1 >= 0) {
      setCurrentIndex(currentIndex - 1)
      _prepareHowl(queue[currentIndex - 1], true)
    } else if (howlRef.current) seek(0)
  }
  const toggleRepeatMode = () => setRepeatMode(p => (p === 'off' ? 'all' : p === 'all' ? 'one' : 'off'))
  const toggleShuffle = () => {
    if (!isShuffle) {
      const current = currentTrack
      const shuffled = [...queue.filter(t => t.id !== current?.id)].sort(() => Math.random() - 0.5)
      setQueue(current ? [current, ...shuffled] : shuffled)
      setCurrentIndex(0)
      setIsShuffle(true)
    } else {
      const originalIdx = originalQueue.findIndex(t => t.id === currentTrack?.id)
      setQueue([...originalQueue])
      setCurrentIndex(originalIdx !== -1 ? originalIdx : 0)
      setIsShuffle(false)
    }
  }
  const removeTrack = (trackId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }
    const targetIdx = queue.findIndex(t => t.id === trackId)
    if (targetIdx === -1) return

    const isCurrentTrack = targetIdx === currentIndex

    const newQueue = queue.filter(t => t.id !== trackId)
    const newOriginalQueue = originalQueue.filter(t => t.id !== trackId)
    
    setQueue(newQueue)
    setOriginalQueue(newOriginalQueue)

    if (isCurrentTrack) {
      if (newQueue.length === 0) {
        if (howlRef.current) {
          howlRef.current.off()
          howlRef.current.stop()
          howlRef.current.unload()
          howlRef.current = null
          setHowl(null)
        }
        setIsPlaying(false)
        setCurrentIndex(-1)
      } else {
        const nextIdx = targetIdx >= newQueue.length ? 0 : targetIdx
        setCurrentIndex(nextIdx)
        _prepareHowl(newQueue[nextIdx], true)
      }
    } else if (targetIdx < currentIndex) {
      setCurrentIndex(prev => prev - 1)
    }
  }

  const pause = () => { setIsPlaying(false); howlRef.current?.pause() }
  const resume = () => {
    if (!howlRef.current && currentTrack) _prepareHowl(currentTrack, true)
    else { setIsPlaying(true); howlRef.current?.play() }
  }
  const seek = (pos: number) => { setCurrentTime(pos); howlRef.current?.seek(pos) }

  // 재생목록 전체 삭제
  const clearQueue = () => {
    if (howlRef.current) {
      howlRef.current.off()
      howlRef.current.stop()
      howlRef.current.unload()
      howlRef.current = null
    }
    setHowl(null)
    setQueue([])
    setOriginalQueue([])
    setCurrentIndex(-1)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
  }

  const toggleFavorite = (track: Track) => {
    setFavorites(prev => {
      const exists = prev.some(t => t.id === track.id)
      if (exists) return prev.filter(t => t.id !== track.id)
      return [track, ...prev]
    })
  }

  useEffect(() => { if (howlRef.current) howlRef.current.volume(volume) }, [volume, howl])

  // Discord RPC - 재생/일시정지 즉시 반영
  useEffect(() => {
    if (!currentTrack) {
      // @ts-ignore
      window.api?.discordClearPresence?.()
      return
    }
    // @ts-ignore
    window.api?.discordUpdatePresence?.({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album,
      cover: currentTrack.cover,
      isPlaying,
      currentTime,
      duration,
      format: currentTrack.format
    })
  }, [currentTrack?.id, isPlaying])

  // Discord RPC - 5초마다 주기적 업데이트 (현재 재생 위치 동기화)
  useEffect(() => {
    if (!currentTrack || !isPlaying) return
    const interval = setInterval(() => {
      // @ts-ignore
      window.api?.discordUpdatePresence?.({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album,
        cover: currentTrack.cover,
        isPlaying,
        currentTime,
        duration,
        format: currentTrack.format
      })
    }, 5000)
    return () => clearInterval(interval)
  }, [currentTrack?.id, isPlaying, currentTime, duration])

  return (
    <AudioContext.Provider value={{
      currentTrack,
      queue,
      recentlyPlayed,
      currentIndex,
      isPlaying,
      repeatMode,
      isShuffle,
      play,
      playQueue,
      addTracksToQueue,
      playNext,
      playPrev,
      pause,
      resume,
      seek,
      toggleRepeatMode,
      toggleShuffle,
      duration,
      currentTime,
      volume,
      setVolume,
      removeTrack,
      clearQueue,
      favorites,
      toggleFavorite
    }}>
      {children}
    </AudioContext.Provider>
  )
}

export const useAudio = () => {
  const context = useContext(AudioContext)
  if (!context) throw new Error('useAudio must be used within an AudioProvider')
  return context
}
