import { useState, useEffect } from 'react'

import { Track } from '../contexts/AudioContext'

interface LyricsData {
  plainLyrics?: string
  syncedLyrics?: string
}

export const useLyrics = (track: Track | null) => {
  const [lyrics, setLyrics] = useState<LyricsData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // 노래가 바뀌면 즉시 이전 가사를 지우고 시작
    setLyrics(null)
    setError(null)
    setIsLoading(false)

    if (!track || (!track.artist && !track.title)) {
      return
    }

    let localPlain = ''
    if (track.lyrics) {
      let lyricsStr = ''
      if (typeof track.lyrics === 'string') {
        lyricsStr = track.lyrics
      } else if (typeof track.lyrics === 'object' && track.lyrics !== null) {
        // @ts-ignore
        lyricsStr = track.lyrics.text || track.lyrics.syncText?.map((l:any)=> {
          const m = Math.floor(l.timestamp / 60000)
          const s = ((l.timestamp % 60000) / 1000).toFixed(2).padStart(5, '0')
          return `[${m.toString().padStart(2, '0')}:${s}]${l.text}`
        }).join('\n') || ''
      }
      if (!lyricsStr) lyricsStr = String(track.lyrics)

      const isSynced = lyricsStr.match(/^\[\d{2}:\d{2}/m)
      if (isSynced) {
        setLyrics({ syncedLyrics: lyricsStr, plainLyrics: lyricsStr })
        return
      } else {
        localPlain = lyricsStr
      }
    }

    let isMounted = true
    const abortController = new AbortController()

    const fetchLyrics = async () => {
      setIsLoading(true)
      try {
        const query = new URLSearchParams()
        if (track.artist) query.append('artist_name', track.artist)
        if (track.title) query.append('track_name', track.title)
        
        // Timeout 8초 설정 (API 응답 지연 방지)
        const timeoutId = setTimeout(() => abortController.abort(), 8000)
        const response = await fetch(`https://lrclib.net/api/get?${query.toString()}`, {
          signal: abortController.signal
        })
        clearTimeout(timeoutId)
        
        if (response.ok) {
          const data = await response.json()
          const result = { plainLyrics: data.plainLyrics || localPlain, syncedLyrics: data.syncedLyrics }
          if (isMounted) setLyrics(result)
        } else {
          if (localPlain) {
            if (isMounted) setLyrics({ plainLyrics: localPlain })
          } else {
            if (isMounted) setError('Lyrics not found')
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError' && isMounted) {
          if (localPlain) {
            setLyrics({ plainLyrics: localPlain })
          } else {
            setError('Failed to fetch lyrics')
          }
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    fetchLyrics()

    return () => {
      isMounted = false
      abortController.abort()
    }
  }, [track])

  return { lyrics, isLoading, error }
}
