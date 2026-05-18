import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import { Howl, Howler } from 'howler'

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

export type EqPreset = 'flat' | 'bass' | 'vocal' | 'bright' | 'rock' | 'electronic' | 'custom'

export interface EqBand {
  label: string
  frequency: number
  gain: number
}

interface AudioContextType {
  // 라이브러리 (추가된 전체 곡)
  library: Track[]
  addToLibrary: (tracks: Track[]) => void
  removeFromLibrary: (trackId: string) => void
  clearLibrary: () => void

  // 재생 대기열
  queue: Track[]
  addToQueue: (track: Track) => void
  addNextToQueue: (track: Track) => void
  removeFromQueue: (trackId: string) => void
  removeQueueAt: (idx: number) => void
  moveQueueItem: (fromIdx: number, toIdx: number) => void
  clearQueue: (keepCurrent?: boolean) => void

  // 재생 상태
  currentTrack: Track | null
  currentIndex: number
  isPlaying: boolean
  repeatMode: 'off' | 'all' | 'one'
  isShuffle: boolean

  // 재생 제어
  playSingle: (track: Track) => void        // 그 곡 하나만 재생 (대기열 무관)
  playTracks: (tracks: Track[], startIndex?: number) => void
  playFromQueue: (idx: number) => void      // 대기열에서 특정 인덱스 재생
  playNext: () => void
  playPrev: () => void
  pause: () => void
  resume: () => void
  seek: (pos: number) => void
  toggleRepeatMode: () => void
  toggleShuffle: () => void

  // 오디오 상태
  duration: number
  currentTime: number
  volume: number
  setVolume: (v: number) => void
  eqBands: EqBand[]
  eqPreset: EqPreset
  eqEnabled: boolean
  eqPreamp: number
  setEqBand: (idx: number, gain: number) => void
  setEqPreset: (preset: EqPreset) => void
  setEqEnabled: (enabled: boolean) => void
  setEqPreamp: (gain: number) => void
  resetEq: () => void

  // 기타
  recentlyPlayed: Track[]
  favorites: Track[]
  toggleFavorite: (track: Track) => void
}

const AudioContext = createContext<AudioContextType | null>(null)

const STORAGE_KEY = 'luma-music-state'
const STATS_KEY = 'luma-music-stats'
const SETTINGS_KEY = 'luma-settings'
const OLD_STORAGE_KEY = 'sanseong-music-state'
const OLD_STATS_KEY = 'sanseong-music-stats'

const EQ_BAND_DEFS = [
  { label: '31', frequency: 31 },
  { label: '62', frequency: 62 },
  { label: '125', frequency: 125 },
  { label: '250', frequency: 250 },
  { label: '500', frequency: 500 },
  { label: '1k', frequency: 1000 },
  { label: '2k', frequency: 2000 },
  { label: '4k', frequency: 4000 },
  { label: '8k', frequency: 8000 },
  { label: '16k', frequency: 16000 }
]

const EQ_PRESETS: Record<EqPreset, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [6, 5, 4, 2, 0, -1, -1, -2, -2, -2],
  vocal: [-3, -2, -1, 0, 2, 4, 4, 2, 1, 0],
  bright: [-2, -2, -1, 0, 0, 1, 3, 5, 6, 6],
  rock: [4, 3, 2, 0, -1, 1, 3, 4, 4, 3],
  electronic: [5, 4, 2, 0, -2, 0, 2, 3, 4, 5],
  custom: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
}

const cleanAlbumTitle = (album?: string): string | undefined => {
  const value = album?.trim()
  if (!value) return undefined

  const normalized = value.toLowerCase()
  return [
    'no album',
    'no album title',
    'no album title detected',
    'unknown album',
    'untitled album'
  ].includes(normalized) ? undefined : value
}

const isDiscordRpcEnabled = (): boolean => {
  try {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    return settings.discordRpc ?? true
  } catch {
    return true
  }
}

const loadEqSettings = (): { preset: EqPreset; gains: number[]; enabled: boolean; preamp: number } => {
  try {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    const preset = settings.eq?.preset
    const gains = Array.isArray(settings.eq?.gains) ? settings.eq.gains : EQ_PRESETS.flat
    const preamp = Number(settings.eq?.preamp) || 0
    return {
      preset: preset && preset in EQ_PRESETS ? preset : 'flat',
      gains: EQ_BAND_DEFS.map((_, idx) => Number(gains[idx]) || 0),
      enabled: settings.eq?.enabled ?? true,
      preamp: Math.max(-12, Math.min(12, preamp))
    }
  } catch {
    return { preset: 'flat', gains: EQ_PRESETS.flat, enabled: true, preamp: 0 }
  }
}

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [library, setLibrary] = useState<Track[]>([])
  const [queue, setQueue] = useState<Track[]>([])
  const [queueBeforeShuffle, setQueueBeforeShuffle] = useState<Track[] | null>(null)
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([])
  const [favorites, setFavorites] = useState<Track[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)   // queue 내 인덱스
  const [isPlayingFromQueue, setIsPlayingFromQueue] = useState(false) // 대기열 재생 중인지
  const [singleTrack, setSingleTrack] = useState<Track | null>(null)  // 단독 재생 트랙

  // currentTrack: 단독 재생 중이면 singleTrack, 아니면 queue[currentIndex]
  const currentTrack = isPlayingFromQueue
    ? (currentIndex >= 0 ? queue[currentIndex] : null)
    : singleTrack

  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off')
  const [isShuffle, setIsShuffle] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [playCounts, setPlayCounts] = useState<Record<string, number>>({})

  const [howl, setHowl] = useState<Howl | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.5)
  const [eqPreset, setEqPresetState] = useState<EqPreset>(() => loadEqSettings().preset)
  const [eqEnabled, setEqEnabled] = useState<boolean>(() => loadEqSettings().enabled)
  const [eqPreamp, setEqPreampState] = useState<number>(() => loadEqSettings().preamp)
  const [eqBands, setEqBands] = useState<EqBand[]>(() => {
    const { gains } = loadEqSettings()
    return EQ_BAND_DEFS.map((band, idx) => ({ ...band, gain: gains[idx] || 0 }))
  })

  const queueRef = useRef(queue)
  const currentIndexRef = useRef(currentIndex)
  const repeatModeRef = useRef(repeatMode)
  const howlRef = useRef<Howl | null>(null)
  const isPlayingFromQueueRef = useRef(isPlayingFromQueue)
  const currentTrackRef = useRef<Track | null>(currentTrack)
  const currentTimeRef = useRef(currentTime)
  const durationRef = useRef(duration)
  const mediaSourceNodesRef = useRef<WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>>(new WeakMap())
  const eqChainRef = useRef<{ source: AudioNode; filters: BiquadFilterNode[]; preamp: GainNode } | null>(null)

  useEffect(() => { queueRef.current = queue }, [queue])
  useEffect(() => { currentIndexRef.current = currentIndex }, [currentIndex])
  useEffect(() => { repeatModeRef.current = repeatMode }, [repeatMode])
  useEffect(() => { isPlayingFromQueueRef.current = isPlayingFromQueue }, [isPlayingFromQueue])
  useEffect(() => { currentTrackRef.current = currentTrack }, [currentTrack])
  useEffect(() => { currentTimeRef.current = currentTime }, [currentTime])
  useEffect(() => { durationRef.current = duration }, [duration])

  const disconnectEqChain = () => {
    const chain = eqChainRef.current
    if (!chain) return
    try { chain.source.disconnect() } catch {}
    chain.filters.forEach(filter => {
      try { filter.disconnect() } catch {}
    })
    try { chain.preamp.disconnect() } catch {}
    eqChainRef.current = null
  }

  const applyEqToHowl = (activeHowl: Howl | null, bands: EqBand[], enabled: boolean, preampGain: number) => {
    if (!activeHowl) return
    const ctx = Howler.ctx
    if (!ctx) return

    const sound = (activeHowl as any)._sounds?.find((s: any) => s?._node)
    const node = sound?._node
    if (!node) return

    disconnectEqChain()

    let source: AudioNode | null = null
    if (node instanceof HTMLMediaElement) {
      try {
        source = mediaSourceNodesRef.current.get(node) || ctx.createMediaElementSource(node)
      } catch (err) {
        console.warn('[EQ] Failed to attach media element:', err)
        return
      }
      mediaSourceNodesRef.current.set(node, source as MediaElementAudioSourceNode)
    } else if (node.connect) {
      source = node as AudioNode
    }

    if (!source) return

    const preamp = ctx.createGain()
    preamp.gain.value = enabled ? Math.pow(10, preampGain / 20) : 1
    const filters = enabled ? bands.map(band => {
      const filter = ctx.createBiquadFilter()
      filter.type = 'peaking'
      filter.frequency.value = band.frequency
      filter.Q.value = 1
      filter.gain.value = band.gain
      return filter
    }) : []

    try {
      source.disconnect()
    } catch {}

    if (filters.length > 0) {
      source.connect(filters[0])
      filters.forEach((filter, idx) => {
        const next = filters[idx + 1]
        if (next) filter.connect(next)
      })
      filters[filters.length - 1].connect(preamp)
    } else {
      source.connect(preamp)
    }
    preamp.connect(ctx.destination)
    eqChainRef.current = { source, filters, preamp }
  }

  // ──────────────────────────────────────────────
  // Load state
  // ──────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      // Migration
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

          // 라이브러리 복원 (기존 queuePaths를 libraryPaths로 마이그레이션)
          const libPaths = (state.libraryPaths || state.queuePaths || []).filter((p: string) => !p.startsWith('http'))
          const recentPaths = (state.recentPaths || []).filter((p: string) => !p.startsWith('http'))
          const favPaths = (state.favoritesPaths || []).filter((p: string) => !p.startsWith('http'))
          const queuePaths = (state.queuePaths2 || []).filter((p: string) => !p.startsWith('http'))
          const savedIndex = typeof state.currentIndex === 'number' ? state.currentIndex : -1

          if (libPaths.length > 0) {
            const restoredLib = await window.api.getTracksByPaths(libPaths)
            setLibrary(restoredLib)
          }
          if (recentPaths.length > 0) {
            const restoredRecent = await window.api.getTracksByPaths(recentPaths)
            setRecentlyPlayed(restoredRecent)
          }
          if (favPaths.length > 0) {
            const restoredFavs = await window.api.getTracksByPaths(favPaths)
            setFavorites(restoredFavs)
          }
          if (queuePaths.length > 0) {
            const restoredQueue = await window.api.getTracksByPaths(queuePaths)
            setQueue(restoredQueue)
            if (savedIndex >= 0 && savedIndex < restoredQueue.length) {
              setCurrentIndex(savedIndex)
              setIsPlayingFromQueue(true)
              _prepareHowl(restoredQueue[savedIndex], false)
            }
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

  // ──────────────────────────────────────────────
  // Save state
  // ──────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded) return
    const state = {
      libraryPaths: library.map(t => t.id),
      queuePaths2: queue.map(t => t.id),
      currentIndex,
      recentPaths: recentlyPlayed.map(t => t.id),
      favoritesPaths: favorites.map(t => t.id),
      volume,
      repeatMode,
      isShuffle
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    localStorage.setItem(STATS_KEY, JSON.stringify(playCounts))
  }, [library, queue, currentIndex, recentlyPlayed, favorites, volume, repeatMode, isShuffle, isLoaded, playCounts])

  // ──────────────────────────────────────────────
  // Howl 헬퍼
  // ──────────────────────────────────────────────
  const _prepareHowl = async (track: Track, autoPlay: boolean = false) => {
    setRecentlyPlayed(prev => {
      const filtered = prev.filter(t => t.id !== track.id)
      return [track, ...filtered].slice(0, 30)
    })

    if (howlRef.current) {
      disconnectEqChain()
      howlRef.current.off()
      howlRef.current.stop()
      howlRef.current.unload()
      howlRef.current = null
    }
    setHowl(null)

    let finalUrl = track.url

    if (track.needsTranscoding) {
      try {
        const port = await window.api.getTranscodePort()
        if (port) finalUrl = `http://127.0.0.1:${port}/stream?path=${encodeURIComponent(track.id)}`
      } catch (e) {
        console.error('Failed to get transcode port', e)
      }
    }

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
        applyEqToHowl(newHowl, eqBands, eqEnabled, eqPreamp)
      },
      onload: () => {
        const d = newHowl.duration()
        setDuration(d === Infinity || d === 0 ? track.duration || 0 : d)
        applyEqToHowl(newHowl, eqBands, eqEnabled, eqPreamp)
      },
      onpause: () => setIsPlaying(false),
      onstop: () => setIsPlaying(false),
      onend: () => handleTrackEnd(),
      onloaderror: (_id, err) => {
        console.warn('onloaderror:', err)
        if (!track.needsTranscoding) { track.needsTranscoding = true; _prepareHowl(track, autoPlay) }
      },
      onplayerror: (_id, err) => {
        console.warn('onplayerror:', err)
        if (!track.needsTranscoding) { track.needsTranscoding = true; _prepareHowl(track, autoPlay) }
      }
    })
    howlRef.current = newHowl
    setHowl(newHowl)
    if (autoPlay) newHowl.play()
  }

  const handleTrackEnd = () => {
    setIsPlaying(false)
    setCurrentTime(0)

    if (!isPlayingFromQueueRef.current) {
      // 단독 재생: repeatOne이면 반복, 아니면 종료
      if (repeatModeRef.current === 'one' && singleTrackRef.current) {
        _prepareHowl(singleTrackRef.current, true)
      }
      return
    }

    // 대기열 재생 중
    if (currentIndexRef.current >= 0) {
      const id = queueRef.current[currentIndexRef.current]?.id
      if (id) setPlayCounts(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }))
    }

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

  // singleTrack ref (handleTrackEnd에서 참조용)
  const singleTrackRef = useRef<Track | null>(null)
  useEffect(() => { singleTrackRef.current = singleTrack }, [singleTrack])

  // Audio Sync
  useEffect(() => {
    if (howl) {
      const interval = setInterval(() => {
        if (isPlaying) setCurrentTime(howl.seek() as number)
      }, 100)
      return () => clearInterval(interval)
    }
    return undefined
  }, [howl, isPlaying])

  // ──────────────────────────────────────────────
  // 라이브러리 관리
  // ──────────────────────────────────────────────
  const addToLibrary = (tracks: Track[]) => {
    if (tracks.length === 0) return
    setLibrary(prev => {
      const deduped = tracks.filter(t => !prev.find(p => p.id === t.id))
      return deduped.length === 0 ? prev : [...prev, ...deduped]
    })
  }

  const removeFromLibrary = (trackId: string) => {
    setLibrary(prev => prev.filter(t => t.id !== trackId))
    setRecentlyPlayed(prev => prev.filter(t => t.id !== trackId))
    setFavorites(prev => prev.filter(t => t.id !== trackId))
    // 대기열에도 있으면 같이 제거
    setQueue(prev => {
      const idx = prev.findIndex(t => t.id === trackId)
      if (idx === -1) return prev
      const next = prev.filter(t => t.id !== trackId)
      if (isPlayingFromQueueRef.current && idx === currentIndexRef.current) {
        if (next.length === 0) {
          _stopAll()
        } else {
          const ni = idx >= next.length ? 0 : idx
          setCurrentIndex(ni)
          _prepareHowl(next[ni], true)
        }
      } else if (isPlayingFromQueueRef.current && idx < currentIndexRef.current) {
        setCurrentIndex(ci => ci - 1)
      }
      return next
    })
    // 단독 재생 중인 곡이면 중지
    if (!isPlayingFromQueueRef.current && singleTrackRef.current?.id === trackId) {
      _stopAll()
      setSingleTrack(null)
    }
  }

  const clearLibrary = () => {
    setLibrary([])
    setQueue([])
    setRecentlyPlayed([])
    setFavorites([])
    _stopAll()
  }

  // ──────────────────────────────────────────────
  // 대기열 관리
  // ──────────────────────────────────────────────
  const addToQueue = (track: Track) => {
    setQueue(prev => {
      const base = !isPlayingFromQueueRef.current && singleTrackRef.current
        ? [singleTrackRef.current, ...prev]
        : prev
      return [...base, track]
    })
    if (!isPlayingFromQueueRef.current && singleTrackRef.current) {
      setIsPlayingFromQueue(true)
      setCurrentIndex(0)
    }
  }

  const addNextToQueue = (track: Track) => {
    setQueue(prev => {
      const base = !isPlayingFromQueueRef.current && singleTrackRef.current
        ? [singleTrackRef.current, ...prev]
        : prev

      const insertAt = isPlayingFromQueueRef.current && currentIndexRef.current >= 0
        ? currentIndexRef.current + 1
        : base.length
      return [...base.slice(0, insertAt), track, ...base.slice(insertAt)]
    })
    if (!isPlayingFromQueueRef.current && singleTrackRef.current) {
      setIsPlayingFromQueue(true)
      setCurrentIndex(0)
    }
  }

  const removeFromQueue = (trackId: string) => {
    const idx = queueRef.current.findIndex(t => t.id === trackId)
    removeQueueAt(idx)
  }

  const removeQueueAt = (idx: number) => {
    if (idx < 0 || idx >= queueRef.current.length) return
    setQueue(prev => {
      const next = prev.filter((_, i) => i !== idx)
      const removedCurrent = isPlayingFromQueueRef.current && idx === currentIndexRef.current

      if (removedCurrent) {
        if (next.length === 0) {
          _stopAll()
          setIsPlayingFromQueue(false)
        } else {
          const ni = idx >= next.length ? 0 : idx
          setCurrentIndex(ni)
          _prepareHowl(next[ni], isPlaying)
        }
      } else if (isPlayingFromQueueRef.current && idx < currentIndexRef.current) {
        setCurrentIndex(ci => ci - 1)
      }

      return next
    })
    setQueueBeforeShuffle(null)
    setIsShuffle(false)
  }

  const moveQueueItem = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= queueRef.current.length || toIdx >= queueRef.current.length) return

    setQueue(prev => {
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)

      const current = currentIndexRef.current
      if (current === fromIdx) {
        setCurrentIndex(toIdx)
      } else if (fromIdx < current && toIdx >= current) {
        setCurrentIndex(current - 1)
      } else if (fromIdx > current && toIdx <= current) {
        setCurrentIndex(current + 1)
      }

      return next
    })
    setQueueBeforeShuffle(null)
    setIsShuffle(false)
  }

  const clearQueue = (keepCurrent: boolean = false) => {
    if (keepCurrent && currentTrack) {
      setQueue([currentTrack])
      setCurrentIndex(0)
      setIsPlayingFromQueue(true)
      setSingleTrack(null)
      setQueueBeforeShuffle(null)
      setIsShuffle(false)
      return
    }

    setQueue([])
    setQueueBeforeShuffle(null)
    setIsShuffle(false)
    if (isPlayingFromQueueRef.current) {
      _stopAll()
      setIsPlayingFromQueue(false)
    }
  }

  // ──────────────────────────────────────────────
  // 재생 제어
  // ──────────────────────────────────────────────
  const _stopAll = () => {
    if (howlRef.current) {
      disconnectEqChain()
      howlRef.current.off()
      howlRef.current.stop()
      howlRef.current.unload()
      howlRef.current = null
    }
    setHowl(null)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setCurrentIndex(-1)
  }

  // 그 곡 하나만 단독 재생
  const playSingle = (track: Track) => {
    playTracks([track], 0)
  }

  const playTracks = (tracks: Track[], startIndex: number = 0) => {
    if (tracks.length === 0 || startIndex < 0 || startIndex >= tracks.length) return
    const nextQueue = [...tracks]
    setQueue(nextQueue)
    setQueueBeforeShuffle(null)
    setIsShuffle(false)
    setIsPlayingFromQueue(true)
    setSingleTrack(null)
    setCurrentIndex(startIndex)
    _prepareHowl(nextQueue[startIndex], true)
  }

  // 대기열에서 특정 인덱스 재생
  const playFromQueue = (idx: number) => {
    if (idx < 0 || idx >= queueRef.current.length) return
    setIsPlayingFromQueue(true)
    setSingleTrack(null)
    setCurrentIndex(idx)
    _prepareHowl(queueRef.current[idx], true)
  }

  const playNext = () => {
    if (!isPlayingFromQueueRef.current) return
    let nextIdx = currentIndex + 1
    if (nextIdx >= queue.length) {
      if (repeatMode === 'all') nextIdx = 0
      else return
    }
    setCurrentIndex(nextIdx)
    _prepareHowl(queue[nextIdx], true)
  }

  const playPrev = () => {
    if (!isPlayingFromQueueRef.current) {
      if (howlRef.current) seek(0)
      return
    }
    if (currentIndex - 1 >= 0) {
      setCurrentIndex(currentIndex - 1)
      _prepareHowl(queue[currentIndex - 1], true)
    } else if (howlRef.current) {
      seek(0)
    }
  }

  const toggleRepeatMode = () => setRepeatMode(p => (p === 'off' ? 'all' : p === 'all' ? 'one' : 'off'))

  const toggleShuffle = () => {
    if (!isShuffle) {
      const current = currentTrack
      const base = queue.length > 0 ? queue : (current ? [current] : [])
      if (base.length === 0) return
      setQueueBeforeShuffle(base)
      const shuffled = [...base.filter(t => t.id !== current?.id)].sort(() => Math.random() - 0.5)
      setQueue(current ? [current, ...shuffled] : shuffled)
      setCurrentIndex(current ? 0 : currentIndex)
      if (current && !isPlayingFromQueue) {
        setIsPlayingFromQueue(true)
        setSingleTrack(null)
      }
      setIsShuffle(true)
    } else {
      if (queueBeforeShuffle) {
        const current = currentTrack
        const restoredIndex = current ? queueBeforeShuffle.findIndex(t => t.id === current.id) : currentIndex
        setQueue(queueBeforeShuffle)
        setCurrentIndex(restoredIndex >= 0 ? restoredIndex : 0)
      }
      setQueueBeforeShuffle(null)
      setIsShuffle(false)
    }
  }

  const pause = () => { setIsPlaying(false); howlRef.current?.pause() }
  const resume = () => {
    if (!howlRef.current && currentTrack) _prepareHowl(currentTrack, true)
    else { setIsPlaying(true); howlRef.current?.play() }
  }
  const seek = (pos: number) => { setCurrentTime(pos); howlRef.current?.seek(pos) }

  const toggleFavorite = (track: Track) => {
    setFavorites(prev => {
      const exists = prev.some(t => t.id === track.id)
      if (exists) return prev.filter(t => t.id !== track.id)
      return [track, ...prev]
    })
  }

  const setEqBand = (idx: number, gain: number) => {
    setEqPresetState('custom')
    setEqBands(prev => prev.map((band, i) => (
      i === idx ? { ...band, gain: Math.max(-12, Math.min(12, gain)) } : band
    )))
  }

  const setEqPreset = (preset: EqPreset) => {
    const gains = EQ_PRESETS[preset]
    setEqPresetState(preset)
    setEqBands(EQ_BAND_DEFS.map((band, idx) => ({ ...band, gain: gains[idx] || 0 })))
  }

  const setEqPreamp = (gain: number) => {
    setEqPresetState('custom')
    setEqPreampState(Math.max(-12, Math.min(12, gain)))
  }

  const resetEq = () => setEqPreset('flat')

  useEffect(() => { if (howlRef.current) howlRef.current.volume(volume) }, [volume, howl])

  useEffect(() => {
    applyEqToHowl(howlRef.current, eqBands, eqEnabled, eqPreamp)
  }, [howl, eqBands, eqEnabled, eqPreamp])

  useEffect(() => {
    try {
      const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        ...settings,
        eq: {
          preset: eqPreset,
          gains: eqBands.map(band => band.gain),
          enabled: eqEnabled,
          preamp: eqPreamp
        }
      }))
    } catch {}
  }, [eqPreset, eqBands, eqEnabled, eqPreamp])

  useEffect(() => {
    window.api?.discordSetEnabled?.(isDiscordRpcEnabled())
  }, [])

  // Windows media controls use the browser Media Session metadata.
  useEffect(() => {
    const album = cleanAlbumTitle(currentTrack?.album)

    document.title = currentTrack
      ? `${currentTrack.title} - ${currentTrack.artist}${album ? ` (${album})` : ''}`
      : 'Luma'

    if (!('mediaSession' in navigator)) return

    if (!currentTrack) {
      navigator.mediaSession.metadata = null
      navigator.mediaSession.playbackState = 'none'
      return
    }

    const artwork = currentTrack.cover
      ? [{
          src: currentTrack.cover,
          sizes: '512x512',
          type: currentTrack.cover.startsWith('data:')
            ? currentTrack.cover.slice(5, currentTrack.cover.indexOf(';'))
            : 'image/png'
        }]
      : []

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title || 'Unknown Title',
      artist: currentTrack.artist || 'Unknown Artist',
      album: album || '',
      artwork
    })
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
  }, [currentTrack?.id, currentTrack?.title, currentTrack?.artist, currentTrack?.album, currentTrack?.cover, isPlaying])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return

    navigator.mediaSession.setActionHandler('play', resume)
    navigator.mediaSession.setActionHandler('pause', pause)
    navigator.mediaSession.setActionHandler('previoustrack', playPrev)
    navigator.mediaSession.setActionHandler('nexttrack', playNext)
    navigator.mediaSession.setActionHandler('seekbackward', details => {
      seek(Math.max(0, currentTime - (details.seekOffset || 10)))
    })
    navigator.mediaSession.setActionHandler('seekforward', details => {
      seek(Math.min(duration || currentTime, currentTime + (details.seekOffset || 10)))
    })
    navigator.mediaSession.setActionHandler('seekto', details => {
      if (typeof details.seekTime === 'number') seek(details.seekTime)
    })

    return () => {
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
      navigator.mediaSession.setActionHandler('previoustrack', null)
      navigator.mediaSession.setActionHandler('nexttrack', null)
      navigator.mediaSession.setActionHandler('seekbackward', null)
      navigator.mediaSession.setActionHandler('seekforward', null)
      navigator.mediaSession.setActionHandler('seekto', null)
    }
  }, [currentTrack?.id, currentTime, duration, playNext, playPrev, pause, resume, seek])

  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack || !duration || !Number.isFinite(duration)) return

    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: 1,
        position: Math.min(Math.max(currentTime, 0), duration)
      })
    } catch (err) {
      console.warn('[MediaSession] Failed to update position state:', err)
    }
  }, [currentTrack?.id, currentTime, duration])

  // Discord RPC
  useEffect(() => {
    if (!currentTrack || !isDiscordRpcEnabled()) {
      window.api?.discordClearPresence?.()
      return
    }
    const effectiveDuration = duration || currentTrack.duration || 0
    window.api?.discordUpdatePresence?.({
      title: currentTrack.title, artist: currentTrack.artist,
      album: currentTrack.album, cover: currentTrack.cover,
      isPlaying, currentTime, duration: effectiveDuration
    })
  }, [currentTrack?.id, isPlaying, duration])

  useEffect(() => {
    if (!currentTrack || !isPlaying || !isDiscordRpcEnabled()) return
    const interval = setInterval(() => {
      const track = currentTrackRef.current
      if (!track || !isDiscordRpcEnabled()) return
      const effectiveDuration = durationRef.current || track.duration || 0
      window.api?.discordUpdatePresence?.({
        title: track.title, artist: track.artist,
        album: track.album, cover: track.cover,
        isPlaying: true,
        currentTime: currentTimeRef.current,
        duration: effectiveDuration
      })
    }, 5000)
    return () => clearInterval(interval)
  }, [currentTrack?.id, isPlaying])

  return (
    <AudioContext.Provider value={{
      library, addToLibrary, removeFromLibrary, clearLibrary,
      queue, addToQueue, addNextToQueue, removeFromQueue, removeQueueAt, moveQueueItem, clearQueue,
      currentTrack, currentIndex, isPlaying, repeatMode, isShuffle,
      playSingle, playTracks, playFromQueue, playNext, playPrev,
      pause, resume, seek, toggleRepeatMode, toggleShuffle,
      duration, currentTime, volume, setVolume,
      eqBands, eqPreset, eqEnabled, eqPreamp,
      setEqBand, setEqPreset, setEqEnabled, setEqPreamp, resetEq,
      recentlyPlayed, favorites, toggleFavorite
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
