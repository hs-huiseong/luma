import React, { useEffect, useMemo, useState } from 'react'
import {
  FlatList,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import * as DocumentPicker from 'expo-document-picker'

type Track = {
  id: string
  title: string
  uri: string
  mimeType?: string
  size?: number
}

const formatTime = (seconds?: number) => {
  if (!seconds || Number.isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${mins}:${secs}`
}

const titleFromName = (name: string) => name.replace(/\.[^.]+$/, '') || name

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const currentTrack = currentIndex >= 0 ? tracks[currentIndex] : null
  const player = useAudioPlayer(null, { updateInterval: 500 })
  const status = useAudioPlayerStatus(player)

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix'
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!currentTrack) return
    player.replace(currentTrack.uri)
    player.setActiveForLockScreen(true, {
      title: currentTrack.title,
      artist: 'Luma'
    })
    player.play()
  }, [currentTrack?.id])

  const currentPosition = status.currentTime || 0
  const currentDuration = status.duration || 0
  const progress = currentDuration > 0 ? Math.min(currentPosition / currentDuration, 1) : 0
  const subtitle = useMemo(() => {
    if (tracks.length === 0) return '음악 파일을 추가해서 바로 재생하세요.'
    return `${tracks.length}곡 대기 중`
  }, [tracks.length])

  const pickFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      multiple: true,
      copyToCacheDirectory: true
    })

    if (result.canceled) return

    const picked = result.assets.map(asset => ({
      id: asset.uri,
      title: titleFromName(asset.name),
      uri: asset.uri,
      mimeType: asset.mimeType,
      size: asset.size
    }))

    setTracks(prev => {
      const next = [...prev]
      picked.forEach(track => {
        if (!next.some(item => item.id === track.id)) next.push(track)
      })
      return next
    })
    if (currentIndex === -1 && picked.length > 0) setCurrentIndex(tracks.length)
  }

  const togglePlay = () => {
    if (!currentTrack && tracks.length > 0) {
      setCurrentIndex(0)
      return
    }
    if (!currentTrack) return
    if (status.playing) player.pause()
    else player.play()
  }

  const playAt = (index: number) => {
    if (index < 0 || index >= tracks.length) return
    setCurrentIndex(index)
  }

  const playNext = () => {
    if (tracks.length === 0) return
    setCurrentIndex(index => {
      if (index < 0) return 0
      return index + 1 >= tracks.length ? 0 : index + 1
    })
  }

  const playPrev = () => {
    if (tracks.length === 0) return
    setCurrentIndex(index => {
      if (index <= 0) return tracks.length - 1
      return index - 1
    })
  }

  const clearQueue = () => {
    player.pause()
    setTracks([])
    setCurrentIndex(-1)
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>Luma</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <Pressable style={styles.addButton} onPress={pickFiles}>
          <Text style={styles.addButtonText}>추가</Text>
        </Pressable>
      </View>

      <View style={styles.nowPlaying}>
        <View style={styles.cover}>
          <Text style={styles.coverText}>{currentTrack ? currentTrack.title.slice(0, 1).toUpperCase() : 'L'}</Text>
        </View>
        <View style={styles.trackInfo}>
          <Text style={styles.nowTitle} numberOfLines={1}>
            {currentTrack?.title || '재생 중인 파일 없음'}
          </Text>
          <Text style={styles.nowMeta} numberOfLines={1}>
            {currentTrack ? currentTrack.mimeType || '로컬 오디오' : '파일을 추가하면 여기에 표시됩니다.'}
          </Text>
        </View>
      </View>

      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.time}>{formatTime(currentPosition)}</Text>
          <Text style={styles.time}>{formatTime(currentDuration)}</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable style={styles.controlButton} onPress={playPrev}>
          <Text style={styles.controlText}>이전</Text>
        </Pressable>
        <Pressable style={styles.playButton} onPress={togglePlay}>
          <Text style={styles.playButtonText}>{status.playing ? '일시정지' : '재생'}</Text>
        </Pressable>
        <Pressable style={styles.controlButton} onPress={playNext}>
          <Text style={styles.controlText}>다음</Text>
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>대기열</Text>
        {tracks.length > 0 && (
          <Pressable onPress={clearQueue}>
            <Text style={styles.clearText}>비우기</Text>
          </Pressable>
        )}
      </View>

      {tracks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>음악 파일을 추가하세요.</Text>
          <Text style={styles.emptyText}>휴대폰에 있는 오디오 파일을 선택해서 바로 재생할 수 있습니다.</Text>
          <Pressable style={styles.emptyButton} onPress={pickFiles}>
            <Text style={styles.emptyButtonText}>파일 선택</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => {
            const active = index === currentIndex
            return (
              <Pressable style={[styles.row, active && styles.activeRow]} onPress={() => playAt(index)}>
                <Text style={[styles.rowIndex, active && styles.activeText]}>{index + 1}</Text>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, active && styles.activeTitle]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {item.mimeType || '오디오 파일'}
                  </Text>
                </View>
              </Pressable>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#090910',
    paddingHorizontal: 18
  },
  header: {
    paddingTop: 18,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  brand: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900'
  },
  subtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    marginTop: 4
  },
  addButton: {
    backgroundColor: '#a78bfa',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 9
  },
  addButtonText: {
    color: '#151020',
    fontWeight: '800'
  },
  nowPlaying: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  cover: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: 'rgba(167,139,250,0.18)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  coverText: {
    color: '#d8b4fe',
    fontSize: 34,
    fontWeight: '900'
  },
  trackInfo: {
    flex: 1,
    minWidth: 0
  },
  nowTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800'
  },
  nowMeta: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    marginTop: 5
  },
  progressWrap: {
    marginTop: 18
  },
  progressTrack: {
    height: 5,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#a78bfa'
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 7
  },
  time: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 11
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 18,
    marginBottom: 26
  },
  controlButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)'
  },
  controlText: {
    color: 'rgba(255,255,255,0.76)',
    fontWeight: '700'
  },
  playButton: {
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 24,
    backgroundColor: '#fff'
  },
  playButtonText: {
    color: '#111018',
    fontWeight: '900'
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800'
  },
  clearText: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 12,
    fontWeight: '700'
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 52,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)'
  },
  emptyTitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 18,
    fontWeight: '800'
  },
  emptyText: {
    color: 'rgba(255,255,255,0.42)',
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 8,
    marginBottom: 18
  },
  emptyButton: {
    backgroundColor: '#a78bfa',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  emptyButtonText: {
    color: '#151020',
    fontWeight: '800'
  },
  list: {
    paddingBottom: 30
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10
  },
  activeRow: {
    backgroundColor: 'rgba(139,92,246,0.14)'
  },
  rowIndex: {
    width: 24,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.36)',
    fontSize: 12
  },
  rowBody: {
    flex: 1,
    minWidth: 0
  },
  rowTitle: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 14,
    fontWeight: '700'
  },
  rowMeta: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    marginTop: 3
  },
  activeText: {
    color: '#a78bfa'
  },
  activeTitle: {
    color: '#fff'
  }
})
