import { useEffect, useState } from 'react'

import { Track } from '../contexts/AudioContext'

interface LyricsData {
  plainLyrics?: string
  syncedLyrics?: string
}

const normalizeEmbeddedLyrics = (lyrics: Track['lyrics']): string => {
  if (!lyrics) return ''

  if (typeof lyrics === 'string') return lyrics.trim()

  if (typeof lyrics === 'object' && lyrics !== null) {
    const lyricObject = lyrics as {
      text?: string
      syncText?: Array<{ timestamp: number; text: string }>
    }

    if (lyricObject.text) return lyricObject.text.trim()

    if (Array.isArray(lyricObject.syncText)) {
      return lyricObject.syncText
        .map(line => {
          const minutes = Math.floor(line.timestamp / 60000)
          const seconds = ((line.timestamp % 60000) / 1000).toFixed(2).padStart(5, '0')
          return `[${minutes.toString().padStart(2, '0')}:${seconds}]${line.text}`
        })
        .join('\n')
        .trim()
    }
  }

  return String(lyrics).trim()
}

export const useLyrics = (track: Track | null) => {
  const [lyrics, setLyrics] = useState<LyricsData | null>(null)
  const [isLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLyrics(null)
    setError(null)

    const embeddedLyrics = normalizeEmbeddedLyrics(track?.lyrics)
    if (!embeddedLyrics) {
      setError('Embedded lyrics not found')
      return
    }

    const isSynced = /^\[\d{2}:\d{2}/m.test(embeddedLyrics)
    setLyrics(isSynced
      ? { syncedLyrics: embeddedLyrics, plainLyrics: embeddedLyrics }
      : { plainLyrics: embeddedLyrics })
  }, [track?.id, track?.lyrics])

  return { lyrics, isLoading, error }
}
