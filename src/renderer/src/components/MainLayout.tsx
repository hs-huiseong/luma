import { useState, useEffect, useRef, useMemo } from 'react'
import { FastAverageColor } from 'fast-average-color'
import { Track, useAudio } from '../contexts/AudioContext'
import { useLyrics } from '../hooks/useLyrics'
import Sidebar from './Sidebar'
import NowPlayingPanel, { NowPlayingTab } from './NowPlayingPanel'
import SettingsModal from './SettingsModal'
import logoUrl from '../../../assets/logo.png'
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1,
  Volume2, Plus, FileAudio, Trash2, Heart, ChevronRight, Clock,
  MoreHorizontal, ListPlus, Info, FolderOpen, X, BarChart2,
  Disc, User, Folder, ListMusic, Check
} from 'lucide-react'

interface LrcLine { time: number; text: string }
interface Playlist { id: string; name: string; trackIds: string[] }
interface LibraryGroup { key: string; title: string; subtitle: string; tracks: Track[]; cover?: string }

const PLAYLISTS_KEY = 'luma-playlists'

const safeDecodePath = (path: string) => {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

const parseLRC = (s: string): LrcLine[] => {
  if (!s) return []
  return s.split('\n').map(l => {
    const m = l.match(/^\[(\d{2}):(\d{2}\.\d{2})\](.*)/)
    return m ? { time: parseInt(m[1]) * 60 + parseFloat(m[2]), text: m[3].trim() } : null
  }).filter(Boolean) as LrcLine[]
}

const fmtTime = (s: number) => {
  if (!s || isNaN(s)) return '0:00'
  return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`
}

const unknownLabel = (kind: 'album' | 'artist' | 'folder') => {
  if (kind === 'album') return '앨범 정보 없음'
  if (kind === 'artist') return '아티스트 정보 없음'
  return '폴더 정보 없음'
}

const folderNameOf = (track: Track) => {
  const cleanPath = safeDecodePath(track.id.replace(/^file:\/\//, '')).replace(/\\/g, '/')
  const parts = cleanPath.split('/').filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 2] : unknownLabel('folder')
}

const groupTracks = (tracks: Track[], kind: 'album' | 'artist' | 'folder'): LibraryGroup[] => {
  const map = new Map<string, Track[]>()
  tracks.forEach(track => {
    const raw = kind === 'album' ? track.album : kind === 'artist' ? track.artist : folderNameOf(track)
    const key = raw?.trim() || unknownLabel(kind)
    map.set(key, [...(map.get(key) || []), track])
  })
  return [...map.entries()]
    .map(([key, items]) => ({
      key,
      title: key,
      subtitle: `${items.length}곡`,
      tracks: items,
      cover: items.find(track => track.cover)?.cover
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'ko'))
}

export default function MainLayout() {
  const {
    currentTrack, playNext, playPrev, isPlaying, pause, resume, duration, currentTime, seek,
    volume, setVolume, queue, currentIndex,
    eqBands, eqPreset, eqEnabled, eqPreamp,
    setEqBand, setEqPreset, setEqEnabled, setEqPreamp, resetEq,
    library, addToLibrary, removeFromLibrary, clearLibrary,
    addToQueue, addNextToQueue, removeQueueAt, moveQueueItem, clearQueue,
    playSingle, playTracks, playFromQueue,
    recentlyPlayed, favorites, toggleFavorite,
    repeatMode, isShuffle, toggleRepeatMode, toggleShuffle
  } = useAudio()

  const [activeNav, setActiveNav] = useState('홈')
  const [searchQuery, setSearchQuery] = useState('')
  const [view, setView] = useState<'home'|'detail'>('home')
  const [selectedGroup, setSelectedGroup] = useState<{ kind: 'album' | 'artist' | 'folder'; key: string } | null>(null)
  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PLAYLISTS_KEY) || '[]')
      return Array.isArray(saved) ? saved : []
    } catch {
      return []
    }
  })
  const [playlistName, setPlaylistName] = useState('')
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false)
  const [playlistTargetTracks, setPlaylistTargetTracks] = useState<Track[]>([])
  const [newPlaylistSeedTracks, setNewPlaylistSeedTracks] = useState<Track[]>([])
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([])
  const { lyrics } = useLyrics(currentTrack)
  const [parsedLrc, setParsedLrc] = useState<LrcLine[]>([])
  const lyricsRef = useRef<HTMLDivElement>(null)
  const lyricsFullscreenRef = useRef<HTMLDivElement>(null)
  const [showLyricsFullscreen, setShowLyricsFullscreen] = useState(false)
  const [rgb, setRgb] = useState('60,20,120')

  useEffect(() => {
    if (lyrics?.syncedLyrics) {
      setParsedLrc(parseLRC(lyrics.syncedLyrics))
    } else if (lyrics?.plainLyrics) {
      setParsedLrc(lyrics.plainLyrics.split('\n').map(l => ({ time: -1, text: l })))
    } else {
      setParsedLrc([])
    }
  }, [lyrics])

  const activeIdx = parsedLrc.findIndex((ln, i) => {
    if (ln.time === -1) return false
    const nx = parsedLrc[i+1]
    return nx && nx.time !== -1 ? currentTime >= ln.time && currentTime < nx.time : currentTime >= ln.time
  })

  useEffect(() => {
    const scrollActiveLine = (container: HTMLDivElement | null) => {
      if (!container) return
      const activeEl = container.querySelector(`p[data-idx="${activeIdx}"]`) as HTMLElement
      if (activeEl) {
        const offsetTop = activeEl.offsetTop
        const containerHalf = container.clientHeight / 2
        const elHalf = activeEl.clientHeight / 2
        container.scrollTo({ top: offsetTop - containerHalf + elHalf, behavior: 'smooth' })
      }
    }
    if (activeIdx >= 0) {
      scrollActiveLine(lyricsRef.current)
      scrollActiveLine(lyricsFullscreenRef.current)
    }
  }, [activeIdx, showLyricsFullscreen])

  useEffect(() => {
    if (!showLyricsFullscreen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowLyricsFullscreen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showLyricsFullscreen])

  useEffect(() => {
    if (!currentTrack?.cover) { setRgb('60,20,120'); return }
    new FastAverageColor().getColorAsync(currentTrack.cover, { crossOrigin:'anonymous', algorithm:'dominant' })
      .then(c => setRgb(`${c.value[0]},${c.value[1]},${c.value[2]}`))
      .catch(() => setRgb('60,20,120'))
  }, [currentTrack?.cover])

  const addFiles = async () => {
    // @ts-ignore
    const tracks = await window.api.selectFiles()
    if (tracks?.length) addToLibrary(tracks)
  }

  useEffect(() => {
    localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists))
  }, [playlists])

  useEffect(() => {
    const validIds = new Set(library.map(track => track.id))
    setPlaylists(prev => prev.map(playlist => ({
      ...playlist,
      trackIds: playlist.trackIds.filter(id => validIds.has(id))
    })))
    setSelectedTrackIds(prev => prev.filter(id => validIds.has(id)))
  }, [library])

  const [showSettings, setShowSettings] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [panelTab, setPanelTab] = useState<NowPlayingTab>('queue')
  const [modalPropertyTrack, setModalPropertyTrack] = useState<Track | null>(null)
  const [showEqModal, setShowEqModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'all' } | { type: 'track'; track: Track } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const pct = duration > 0 ? (currentTime/duration)*100 : 0
  const recent = useMemo(() => recentlyPlayed.slice(0,5), [recentlyPlayed])
  const isFavoritesView = activeNav === '즐겨찾기'
  const selectedPlaylistId = activeNav.startsWith('playlist:') ? activeNav.slice('playlist:'.length) : null
  const selectedPlaylist = playlists.find(playlist => playlist.id === selectedPlaylistId)
  const albumGroups = useMemo(() => groupTracks(library, 'album'), [library])
  const artistGroups = useMemo(() => groupTracks(library, 'artist'), [library])
  const folderGroups = useMemo(() => groupTracks(library, 'folder'), [library])
  const activeGroups = activeNav === '앨범' ? albumGroups : activeNav === '아티스트' ? artistGroups : activeNav === '폴더' ? folderGroups : []
  const selectedGroupData = selectedGroup ? activeGroups.find(group => group.key === selectedGroup.key) : null
  const playlistTracks = useMemo(() => {
    if (!selectedPlaylist) return []
    const byId = new Map(library.map(track => [track.id, track]))
    return selectedPlaylist.trackIds.map(id => byId.get(id)).filter(Boolean) as Track[]
  }, [library, selectedPlaylist])
  const baseTracks = isFavoritesView
    ? favorites
    : selectedPlaylist
      ? playlistTracks
      : selectedGroupData
        ? selectedGroupData.tracks
        : library
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const displayTracks = useMemo(() => {
    if (!normalizedQuery) return baseTracks
    return baseTracks.filter(track => {
      const haystack = [
        track.title,
        track.artist,
        track.album,
        track.format?.container,
        folderNameOf(track)
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [baseTracks, normalizedQuery])
  const selectedVisibleTracks = displayTracks.filter(track => selectedTrackIds.includes(track.id))
  const allVisibleSelected = displayTracks.length > 0 && displayTracks.every(track => selectedTrackIds.includes(track.id))
  const isSearching = normalizedQuery.length > 0
  const isGroupOverview = !isSearching && ['앨범', '아티스트', '폴더'].includes(activeNav) && !selectedGroupData
  const isPlaylistOverview = !isSearching && activeNav === '재생목록'
  const pageTitle = isSearching
    ? `"${searchQuery.trim()}" 검색 결과`
    : isFavoritesView
      ? '즐겨찾기'
      : selectedPlaylist
        ? selectedPlaylist.name
        : selectedGroupData
          ? selectedGroupData.title
          : activeNav === '곡' || activeNav === '홈'
            ? '전체 곡'
            : activeNav
  const homeTitle = isSearching ? '검색' : selectedPlaylist ? '재생목록' : activeNav
  const headerSummary = isSearching
    ? `${displayTracks.length}곡`
    : isGroupOverview
      ? `${activeGroups.length}개`
      : isPlaylistOverview
        ? `${playlists.length}개`
        : `${displayTracks.length}곡`

  useEffect(() => {
    setSelectedTrackIds([])
  }, [activeNav, selectedGroup?.key, normalizedQuery])

  const createPlaylist = () => {
    const name = playlistName.trim()
    if (!name) return
    const playlist = { id: `${Date.now()}`, name, trackIds: [...new Set(newPlaylistSeedTracks.map(track => track.id))] }
    setPlaylists(prev => [...prev, playlist])
    setPlaylistName('')
    setShowCreatePlaylist(false)
    setNewPlaylistSeedTracks([])
    clearSelection()
    setActiveNav(`playlist:${playlist.id}`)
    setSelectedGroup(null)
  }

  const closeCreatePlaylist = () => {
    setShowCreatePlaylist(false)
    setPlaylistName('')
    setNewPlaylistSeedTracks([])
  }

  const addTracksToPlaylist = (playlistId: string, tracks: Track[]) => {
    setPlaylists(prev => prev.map(playlist => {
      if (playlist.id !== playlistId) return playlist
      const ids = new Set(playlist.trackIds)
      tracks.forEach(track => ids.add(track.id))
      return { ...playlist, trackIds: [...ids] }
    }))
  }

  const removeTrackFromPlaylist = (playlistId: string, trackId: string) => {
    setPlaylists(prev => prev.map(playlist => playlist.id === playlistId
      ? { ...playlist, trackIds: playlist.trackIds.filter(id => id !== trackId) }
      : playlist
    ))
  }

  const deletePlaylist = (playlistId: string) => {
    setPlaylists(prev => prev.filter(playlist => playlist.id !== playlistId))
    setActiveNav('재생목록')
  }

  const toggleTrackSelection = (trackId: string) => {
    setSelectedTrackIds(prev => prev.includes(trackId) ? prev.filter(id => id !== trackId) : [...prev, trackId])
  }

  const toggleVisibleSelection = () => {
    const visibleIds = displayTracks.map(track => track.id)
    setSelectedTrackIds(prev => {
      if (visibleIds.length > 0 && visibleIds.every(id => prev.includes(id))) {
        return prev.filter(id => !visibleIds.includes(id))
      }
      return [...new Set([...prev, ...visibleIds])]
    })
  }

  const clearSelection = () => setSelectedTrackIds([])

  const removeSelectedTracks = () => {
    if (selectedVisibleTracks.length === 0) return
    if (selectedPlaylist) {
      setPlaylists(prev => prev.map(playlist => playlist.id === selectedPlaylist.id
        ? { ...playlist, trackIds: playlist.trackIds.filter(id => !selectedTrackIds.includes(id)) }
        : playlist
      ))
    } else if (isFavoritesView) {
      selectedVisibleTracks.forEach(track => toggleFavorite(track))
    } else {
      selectedVisibleTracks.forEach(track => removeFromLibrary(track.id))
    }
    clearSelection()
  }

  // 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null)
      }
    }
    if (openMenuId) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openMenuId])

  const handlePanelTabChange = (nextTab: NowPlayingTab) => {
    setPanelTab(nextTab)
  }

  const showInFolder = (track: Track) => {
    if (!track.id.startsWith('http')) window.api?.showItemInFolder?.(track.id)
  }

  const eqSliderBackground = (value: number) => {
    const pct = ((value + 12) / 24) * 100
    return `linear-gradient(90deg, #a78bfa ${pct}%, rgba(255,255,255,0.18) ${pct}%)`
  }

  const confirmDelete = () => {
    if (!deleteConfirm) return
    if (deleteConfirm.type === 'all') {
      clearLibrary()
    } else {
      removeFromLibrary(deleteConfirm.track.id)
    }
    setDeleteConfirm(null)
  }

  return (
    <div style={{ position:'relative', display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden', backgroundColor:'#0a0a0f', color:'#e8e8f0', fontFamily:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif" }}>
      
      {/* Album Art Background */}
      <div style={{
        position: 'absolute', top: -60, left: -60, right: -60, bottom: -60,
        backgroundImage: currentTrack?.cover ? `url(${currentTrack.cover})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'blur(80px) brightness(0.3) saturate(1.2)',
        zIndex: 0,
        opacity: currentTrack?.cover ? 1 : 0,
        transition: 'background-image 0.8s ease, opacity 0.8s ease'
      }} />

      <div style={{ display:'flex', flex:1, overflow:'hidden', zIndex: 1 }}>
        <Sidebar
          activeNav={activeNav}
          setActiveNav={nav => { setActiveNav(nav); setSelectedGroup(null); setView('home') }}
          searchQuery={searchQuery}
          onSearchChange={query => { setSearchQuery(query); setView('home') }}
          onAddFiles={addFiles}
          onOpenSettings={() => setShowSettings(true)}
          onOpenInfo={() => setShowInfo(true)}
          playlists={playlists}
          onCreatePlaylist={() => { setNewPlaylistSeedTracks([]); setShowCreatePlaylist(true); setActiveNav('재생목록'); setSelectedGroup(null); setView('home') }}
        />

        {/* Main */}
        <main style={{ flex:1, overflowY:'auto', position:'relative' }}>
          {view==='detail' && currentTrack ? (
            /* Detail View */
            <div style={{ padding:'40px 60px', minHeight:'100%', display:'flex', flexDirection:'column' }}>
              <div style={{ display:'flex', gap:60, alignItems:'center' }}>
                {/* Left: Album Art */}
                <div style={{ flexShrink:0, width:340 }}>
                  <div style={{ width:340, height:340, borderRadius:16, overflow:'hidden', marginBottom:16, boxShadow:`0 20px 40px rgba(0,0,0,0.4)` }}>
                    {currentTrack.cover
                      ? <img src={currentTrack.cover} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      : <div style={{ width:'100%', height:'100%', background:'rgba(255,255,255,0.05)', display:'flex', alignItems:'center', justifyContent:'center' }}><FileAudio size={64} style={{ color:'rgba(255,255,255,0.15)' }} /></div>}
                  </div>
                  <div style={{ display:'flex', gap:16, alignItems:'center', paddingLeft:4 }}>
                    <button 
                      onClick={() => toggleFavorite(currentTrack)}
                      style={{ background:'none', border:'none', cursor:'pointer', padding:0, color: favorites.some(f => f.id === currentTrack.id) ? '#e94f8a' : 'rgba(255,255,255,0.3)', transition:'color 0.15s' }}>
                      <Heart size={20} fill={favorites.some(f => f.id === currentTrack.id) ? '#e94f8a' : 'none'} />
                    </button>
                    <button
                      onClick={() => setModalPropertyTrack(currentTrack)}
                      style={{ display:'flex', alignItems:'center', gap:5, background:'none', border:'none', cursor:'pointer', padding:0, color:'rgba(255,255,255,0.5)', fontSize:13, fontFamily:'inherit' }}
                    >
                      <Info size={18} />
                      속성
                    </button>
                  </div>
                </div>

                {/* Right: Info */}
                <div style={{ flex:1, minWidth:0 }}>
                  <h1 style={{ fontSize:48, fontWeight:800, color:'#fff', lineHeight:1.1, marginBottom:16, letterSpacing:'-0.03em' }}>{currentTrack.title}</h1>
                  <div style={{ fontSize:22, color:'#e94f8a', fontWeight:600, marginBottom:10 }}>{currentTrack.artist}</div>
                  <div style={{ fontSize:15, color:'rgba(255,255,255,0.6)', marginBottom:36 }}>{currentTrack.album || '앨범 정보 없음'}</div>
                  <div style={{ display:'flex', gap:12 }}>
                    <button onClick={isPlaying ? pause : resume} style={{ background:'#e94f8a', border:'none', borderRadius:8, display:'flex', alignItems:'center', gap:8, padding:'14px 32px', fontSize:15, fontWeight:600, color:'#fff', cursor:'pointer', transition:'opacity 0.2s' }}>
                      {isPlaying ? <Pause size={16} fill="white" /> : <Play size={16} fill="white" />}
                      {isPlaying ? '일시정지' : '재생'}
                    </button>
                    <button onClick={toggleShuffle} style={{ display:'flex', alignItems:'center', gap:8, padding:'14px 28px', fontSize:15, fontWeight:500, borderRadius:8, border:'1px solid rgba(255,255,255,0.15)', background:'transparent', color:'rgba(255,255,255,0.9)', cursor:'pointer', transition:'background 0.2s' }}>
                      <Shuffle size={16} /> 셔플
                    </button>
                  </div>
                </div>
              </div>

              {/* Lyrics */}
              <div style={{ marginTop: 60, flex: 1, paddingRight:20 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
                  <div style={{ fontSize:16, fontWeight:700, color:'#fff' }}>가사</div>
                  <button
                    onClick={() => setShowLyricsFullscreen(true)}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.5)', fontSize:13, display:'flex', alignItems:'center', gap:4 }}
                  >
                    더보기 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                </div>
                <div ref={lyricsRef} style={{ position:'relative', display:'flex', flexDirection:'column', gap:'16px', maxHeight:280, overflowY:'auto', paddingBottom:100, paddingRight:20 }}>
                  {parsedLrc.length > 0 ? parsedLrc.map((ln, i) => {
                    const isActive = i === activeIdx
                    return (
                      <p key={i} data-idx={i} onClick={() => ln.time !== -1 && seek(ln.time)} 
                        style={{ 
                          fontSize: isActive ? 18 : 15, 
                          lineHeight:1.6, 
                          cursor: ln.time !== -1 ? 'pointer' : 'default', 
                          transition:'all 0.4s cubic-bezier(0.25, 1, 0.5, 1)', 
                          color: isActive ? '#fff' : 'rgba(255,255,255,0.4)', 
                          fontWeight: isActive ? 700 : 500,
                          textShadow: isActive ? '0 0 20px rgba(255,255,255,0.4)' : 'none',
                          transform: isActive ? 'translateX(10px)' : 'translateX(0)',
                          margin: 0 
                        }}>
                        {ln.text || '\u00a0'}
                      </p>
                    )
                  }) : <p style={{ fontSize:15, color:'rgba(255,255,255,0.3)' }}>가사가 없습니다.</p>}
                </div>

              </div>
            </div>
          ) : (
            /* Home View */
            <div style={{ padding:'36px 40px' }}>
              <h1 style={{ fontSize:30, fontWeight:800, color:'#fff', marginBottom:32, letterSpacing:'0' }}>{homeTitle}</h1>

              {isSearching && (
                <div style={{ marginBottom:22, color:'rgba(255,255,255,0.4)', fontSize:12 }}>
                  제목, 아티스트, 앨범, 파일 형식에서 검색했습니다.
                </div>
              )}

              {/* Recent */}
              {!isSearching && activeNav === '홈' && recent.length > 0 && (
                <section style={{ marginBottom:40 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:18 }}>
                    <span style={{ fontSize:18, fontWeight:700, color:'#fff' }}>최근 재생</span>
                    <ChevronRight size={17} style={{ color:'rgba(255,255,255,0.4)' }} />
                  </div>
                  <div style={{ display:'flex', gap:18 }}>
                    {recent.map(track => {
                      const isActive = currentTrack?.id === track.id
                      return (
                        <div key={track.id} style={{ width:150, cursor:'pointer' }}
                          onDoubleClick={() => { playSingle(track); setView('detail') }}>
                          <div style={{ position:'relative', marginBottom:12 }}>
                            <div style={{ width:150, height:150, borderRadius:14, overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(255,255,255,0.06)', boxShadow: isActive ? `0 8px 32px rgba(${rgb},0.6)` : '0 4px 16px rgba(0,0,0,0.4)', border: `2px solid ${isActive ? `rgba(${rgb},0.6)` : 'transparent'}`, transition:'all 0.2s' }}>
                              {track.cover ? <img src={track.cover} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <FileAudio size={36} style={{ color:'rgba(255,255,255,0.15)' }} />}
                            </div>
                            {isActive && isPlaying && (
                              <div style={{ position:'absolute', top:8, right:8, background:'rgba(0,0,0,0.7)', borderRadius:6, padding:'3px 5px', display:'flex', gap:2, alignItems:'flex-end' }}>
                                <div className="eq-bar-1" style={{ width:3, borderRadius:2, background:'#a78bfa' }} />
                                <div className="eq-bar-2" style={{ width:3, borderRadius:2, background:'#a78bfa' }} />
                                <div className="eq-bar-3" style={{ width:3, borderRadius:2, background:'#a78bfa' }} />
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{track.title}</div>
                          <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{track.artist}</div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Track Table */}
              <section>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                  <div>
                    <span style={{ fontSize:18, fontWeight:700, color:'#fff' }}>{pageTitle}</span>
                    <div style={{ marginTop:5, fontSize:12, color:'rgba(255,255,255,0.36)' }}>
                      {headerSummary}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={addFiles} className="gradient-btn" style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 18px', fontSize:12 }}>
                      <Plus size={14} /> 음악 추가
                    </button>
                    {displayTracks.length > 0 && (
                      <button onClick={() => playTracks(displayTracks, 0)} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:20, fontSize:12, fontWeight:600, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.85)', cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' }}>
                        <Play size={13} fill="currentColor" /> 전체 재생
                      </button>
                    )}
                    {selectedPlaylist && (
                      <button onClick={() => deletePlaylist(selectedPlaylist.id)} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:20, fontSize:12, fontWeight:600, border:'1px solid rgba(239,68,68,0.25)', background:'rgba(239,68,68,0.1)', color:'#fca5a5', cursor:'pointer', fontFamily:'inherit' }}>
                        <Trash2 size={13} /> 재생목록 삭제
                      </button>
                    )}
                    {activeNav === '재생목록' && (
                      <button onClick={() => { setNewPlaylistSeedTracks([]); setShowCreatePlaylist(true) }} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:20, fontSize:12, fontWeight:600, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.85)', cursor:'pointer', fontFamily:'inherit' }}>
                        <Plus size={13} /> 새 재생목록
                      </button>
                    )}
                    {!isFavoritesView && !selectedPlaylist && library.length > 0 && !isGroupOverview && !isPlaylistOverview && (
                      <button title="전체 삭제" onClick={() => setDeleteConfirm({ type: 'all' })} style={{ display:'flex', alignItems:'center', justifyContent:'center', width:32, height:32, borderRadius:16, border:'1px solid rgba(255,255,255,0.1)', background:'transparent', color:'rgba(255,255,255,0.35)', cursor:'pointer', transition:'all 0.15s' }}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {selectedVisibleTracks.length > 0 && (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'8px 10px 8px 13px', marginBottom:12, borderRadius:8, background:'rgba(12,12,20,0.72)', border:'1px solid rgba(255,255,255,0.08)', boxShadow:'0 10px 34px rgba(0,0,0,0.22)', backdropFilter:'blur(14px)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:9, minWidth:0 }}>
                      <div style={{ width:18, height:18, borderRadius:9, background:'rgba(167,139,250,0.18)', color:'#c4b5fd', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <Check size={12} strokeWidth={3} />
                      </div>
                      <div style={{ fontSize:12, fontWeight:800, color:'rgba(255,255,255,0.82)', whiteSpace:'nowrap' }}>{selectedVisibleTracks.length}곡 선택</div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
                      <button onClick={() => selectedVisibleTracks.forEach(track => addToQueue(track))} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 10px', borderRadius:7, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.045)', color:'rgba(255,255,255,0.78)', fontSize:12, fontWeight:700, fontFamily:'inherit', cursor:'pointer' }}>
                        <ListPlus size={14} /> 대기열
                      </button>
                      <button onClick={() => setPlaylistTargetTracks(selectedVisibleTracks)} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 10px', borderRadius:7, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.045)', color:'rgba(255,255,255,0.78)', fontSize:12, fontWeight:700, fontFamily:'inherit', cursor:'pointer' }}>
                        <ListMusic size={14} /> 재생목록
                      </button>
                      <button onClick={removeSelectedTracks} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 10px', borderRadius:7, border:'1px solid rgba(239,68,68,0.18)', background:'rgba(239,68,68,0.075)', color:'#fca5a5', fontSize:12, fontWeight:800, fontFamily:'inherit', cursor:'pointer' }}>
                        <Trash2 size={14} /> {selectedPlaylist ? '목록에서 제거' : isFavoritesView ? '즐겨찾기 제거' : '삭제'}
                      </button>
                      <button onClick={clearSelection} title="선택 해제" style={{ width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:7, border:'none', background:'transparent', color:'rgba(255,255,255,0.42)', fontFamily:'inherit', cursor:'pointer' }}>
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                )}

                {isGroupOverview ? (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(170px, 1fr))', gap:16 }}>
                    {activeGroups.map(group => {
                      const Icon = activeNav === '앨범' ? Disc : activeNav === '아티스트' ? User : Folder
                      return (
                        <button
                          key={group.key}
                          onClick={() => setSelectedGroup({ kind: activeNav === '앨범' ? 'album' : activeNav === '아티스트' ? 'artist' : 'folder', key: group.key })}
                          style={{ textAlign:'left', border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.045)', borderRadius:10, padding:12, cursor:'pointer', color:'#fff', fontFamily:'inherit' }}
                        >
                          <div style={{ height:130, borderRadius:8, overflow:'hidden', background:'rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:11 }}>
                            {group.cover ? <img src={group.cover} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <Icon size={38} style={{ color:'rgba(255,255,255,0.22)' }} />}
                          </div>
                          <div style={{ fontSize:14, fontWeight:800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{group.title}</div>
                          <div style={{ marginTop:4, fontSize:12, color:'rgba(255,255,255,0.42)' }}>{group.subtitle}</div>
                        </button>
                      )
                    })}
                  </div>
                ) : isPlaylistOverview ? (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(190px, 1fr))', gap:16 }}>
                    <button
                      onClick={() => { setNewPlaylistSeedTracks([]); setShowCreatePlaylist(true) }}
                      style={{ minHeight:170, border:'1px dashed rgba(255,255,255,0.16)', background:'rgba(255,255,255,0.03)', borderRadius:10, color:'rgba(255,255,255,0.65)', cursor:'pointer', fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10 }}
                    >
                      <Plus size={24} />
                      <span style={{ fontSize:13, fontWeight:800 }}>새 재생목록</span>
                    </button>
                    {playlists.map(playlist => {
                      const tracks = playlist.trackIds.map(id => library.find(track => track.id === id)).filter(Boolean) as Track[]
                      const cover = tracks.find(track => track.cover)?.cover
                      return (
                        <button
                          key={playlist.id}
                          onClick={() => setActiveNav(`playlist:${playlist.id}`)}
                          style={{ textAlign:'left', border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.045)', borderRadius:10, padding:12, cursor:'pointer', color:'#fff', fontFamily:'inherit' }}
                        >
                          <div style={{ height:130, borderRadius:8, overflow:'hidden', background:'rgba(139,92,246,0.12)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:11 }}>
                            {cover ? <img src={cover} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <ListMusic size={38} style={{ color:'rgba(255,255,255,0.24)' }} />}
                          </div>
                          <div style={{ fontSize:14, fontWeight:800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{playlist.name}</div>
                          <div style={{ marginTop:4, fontSize:12, color:'rgba(255,255,255,0.42)' }}>{tracks.length}곡</div>
                        </button>
                      )
                    })}
                  </div>
                ) : displayTracks.length === 0 ? (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'72px 20px', borderRadius:10, border:'1px dashed rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.025)', color:'rgba(255,255,255,0.16)' }}>
                    {isFavoritesView ? <Heart size={64} strokeWidth={1} style={{ marginBottom:16 }} /> : <FileAudio size={64} strokeWidth={1} style={{ marginBottom:16 }} />}
                    <p style={{ fontSize:17, fontWeight:800, color:'rgba(255,255,255,0.55)', margin:'0 0 8px' }}>{isSearching ? '검색 결과가 없습니다.' : isFavoritesView ? '즐겨찾기가 없습니다.' : selectedPlaylist ? '재생목록이 비어 있습니다.' : '음악을 추가해보세요.'}</p>
                    <p style={{ fontSize:12, color:'rgba(255,255,255,0.34)', margin:'0 0 18px' }}>{isSearching ? '다른 키워드로 다시 검색해보세요.' : '로컬 음악 파일을 열어서 바로 재생할 수 있습니다.'}</p>
                    {!isSearching && !isFavoritesView && !selectedPlaylist && (
                      <button onClick={addFiles} className="gradient-btn" style={{ display:'flex', alignItems:'center', gap:7, padding:'10px 18px', fontSize:13 }}>
                        <Plus size={15} /> 음악 추가
                      </button>
                    )}
                  </div>
                ) : (
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
                        <th style={{ padding:'8px 4px 8px 10px', textAlign:'center', width:34 }}>
                          <button
                            type="button"
                            className={`row-select-btn${allVisibleSelected ? ' selected' : ''}`}
                            onClick={toggleVisibleSelection}
                            title={allVisibleSelected ? '전체 선택 해제' : '전체 선택'}
                          >
                            {allVisibleSelected && <Check size={11} strokeWidth={3} />}
                          </button>
                        </th>
                        <th style={{ padding:'8px 12px', textAlign:'center', fontSize:11, fontWeight:500, letterSpacing:'0.06em', color:'rgba(255,255,255,0.3)', width:44 }}>#</th>
                        <th style={{ padding:'8px 12px', textAlign:'left', fontSize:11, fontWeight:500, letterSpacing:'0.06em', color:'rgba(255,255,255,0.3)' }}>제목</th>
                        <th style={{ padding:'8px 12px', textAlign:'left', fontSize:11, fontWeight:500, letterSpacing:'0.06em', color:'rgba(255,255,255,0.3)' }}>아티스트</th>
                        <th style={{ padding:'8px 12px', textAlign:'left', fontSize:11, fontWeight:500, letterSpacing:'0.06em', color:'rgba(255,255,255,0.3)' }}>앨범</th>
                        <th style={{ padding:'8px 12px', textAlign:'right', fontSize:11, fontWeight:500, letterSpacing:'0.06em', color:'rgba(255,255,255,0.3)', width:52 }}><Clock size={13} style={{ display:'inline' }} /></th>
                        <th style={{ width:50 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayTracks.map((track, idx) => {
                        const isActive = currentTrack?.id === track.id
                        const isFav = favorites.some(f => f.id === track.id)
                        const isSelected = selectedTrackIds.includes(track.id)
                        return (
                          <tr key={track.id} className={`track-row${isActive?' active':''}`}
                            onDoubleClick={() => {
                              playTracks(displayTracks, idx)
                            }}
                            style={{ borderLeft: isActive ? '3px solid #a78bfa' : '3px solid transparent', background: isSelected ? 'rgba(139,92,246,0.075)' : undefined }}>
                            <td style={{ padding:'11px 4px 11px 10px', textAlign:'center', width:34 }}>
                              <button
                                type="button"
                                className={`row-select-btn${isSelected ? ' selected' : ''}`}
                                onClick={e => { e.stopPropagation(); toggleTrackSelection(track.id) }}
                                onDoubleClick={e => e.stopPropagation()}
                                title={isSelected ? '선택 해제' : '선택'}
                              >
                                {isSelected && <Check size={11} strokeWidth={3} />}
                              </button>
                            </td>
                            <td style={{ padding:'11px 12px', textAlign:'center', width:44 }}>
                              {isActive && isPlaying
                                ? <div style={{ display:'flex', gap:2, alignItems:'flex-end', justifyContent:'center', height:13 }}>
                                    <div className="eq-bar-1" style={{ width:3, borderRadius:2, background:'#a78bfa' }} />
                                    <div className="eq-bar-2" style={{ width:3, borderRadius:2, background:'#a78bfa' }} />
                                    <div className="eq-bar-3" style={{ width:3, borderRadius:2, background:'#a78bfa' }} />
                                  </div>
                                : <span style={{ fontSize:13, color: isActive?'#a78bfa':'rgba(255,255,255,0.4)' }}>{idx+1}</span>
                              }
                            </td>
                            <td style={{ padding:'11px 12px' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                                <div style={{ width:38, height:38, borderRadius:8, overflow:'hidden', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(255,255,255,0.06)' }}>
                                  {track.cover ? <img src={track.cover} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <FileAudio size={16} style={{ color:'rgba(255,255,255,0.2)' }} />}
                                </div>
                                <div style={{ minWidth:0 }}>
                                  <div style={{ fontSize:13, fontWeight:500, color: isActive?'#a78bfa':'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{track.title}</div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding:'11px 12px', fontSize:13, color:'rgba(255,255,255,0.5)' }}>{track.artist}</td>
                            <td style={{ padding:'11px 12px', fontSize:13, color:'rgba(255,255,255,0.35)' }}>{track.album}</td>
                            <td style={{ padding:'11px 12px', textAlign:'right', fontSize:13, color:'rgba(255,255,255,0.4)', width:52, fontVariantNumeric:'tabular-nums' }}>{track.duration ? fmtTime(track.duration) : '—'}</td>
                            <td style={{ padding:'11px 6px', textAlign:'right', width:60 }}>
                              <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4 }}>
                                <button onClick={e => { e.stopPropagation(); toggleFavorite(track) }} style={{ background:'none', border:'none', cursor:'pointer', padding:4, color: isFav ? '#e94f8a' : 'rgba(255,255,255,0.2)', transition:'color 0.15s' }}>
                                  <Heart size={16} fill={isFav ? '#e94f8a' : 'none'} />
                                </button>
                                {/* 옵션 버튼 */}
                                <div style={{ position:'relative' }} ref={openMenuId === track.id ? menuRef : undefined}>
                                  <button
                                    className="option-btn"
                                    onClick={e => { e.stopPropagation(); setOpenMenuId(prev => prev === track.id ? null : track.id) }}
                                    style={{ background:'none', border:'none', cursor:'pointer', padding:4, color:'rgba(255,255,255,0.35)', opacity:0, transition:'opacity 0.15s' }}
                                  >
                                    <MoreHorizontal size={16} />
                                  </button>
                                  {openMenuId === track.id && (
                                    <div style={{
                                      position:'absolute', right:0, top:'calc(100% + 4px)',
                                      background:'rgba(18,18,30,0.98)', border:'1px solid rgba(255,255,255,0.1)',
                                      borderRadius:10, padding:'4px 0', zIndex:999,
                                      minWidth:170, boxShadow:'0 8px 32px rgba(0,0,0,0.6)',
                                      backdropFilter:'blur(12px)'
                                    }}>
                                      <button
                                        onClick={e => { e.stopPropagation(); addNextToQueue(track); setOpenMenuId(null) }}
                                        style={{
                                          display:'flex', alignItems:'center', gap:10,
                                          width:'100%', padding:'9px 14px', background:'none', border:'none',
                                          color:'rgba(255,255,255,0.85)', fontSize:13, cursor:'pointer',
                                          fontFamily:'inherit', textAlign:'left', transition:'background 0.1s'
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background='rgba(255,255,255,0.08)')}
                                        onMouseLeave={e => (e.currentTarget.style.background='none')}
                                      >
                                        <ListPlus size={15} style={{ color:'#a78bfa' }} />
                                        다음에 재생
                                      </button>
                                      <button
                                        onClick={e => { e.stopPropagation(); addToQueue(track); setOpenMenuId(null) }}
                                        style={{
                                          display:'flex', alignItems:'center', gap:10,
                                          width:'100%', padding:'9px 14px', background:'none', border:'none',
                                          color:'rgba(255,255,255,0.85)', fontSize:13, cursor:'pointer',
                                          fontFamily:'inherit', textAlign:'left', transition:'background 0.1s'
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background='rgba(255,255,255,0.08)')}
                                        onMouseLeave={e => (e.currentTarget.style.background='none')}
                                      >
                                        <ListPlus size={15} style={{ color:'#a78bfa' }} />
                                        대기열에 추가
                                      </button>
                                      <button
                                        onClick={e => {
                                          e.stopPropagation()
                                          setPlaylistTargetTracks([track])
                                          setOpenMenuId(null)
                                        }}
                                        style={{
                                          display:'flex', alignItems:'center', gap:10,
                                          width:'100%', padding:'9px 14px', background:'none', border:'none',
                                          color:'rgba(255,255,255,0.85)', fontSize:13, cursor:'pointer',
                                          fontFamily:'inherit', textAlign:'left', transition:'background 0.1s'
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background='rgba(255,255,255,0.08)')}
                                        onMouseLeave={e => (e.currentTarget.style.background='none')}
                                      >
                                        <ListMusic size={15} style={{ color:'#a78bfa' }} />
                                        재생목록에 추가
                                      </button>
                                      <button
                                        onClick={e => {
                                          e.stopPropagation()
                                          setModalPropertyTrack(track)
                                          setOpenMenuId(null)
                                        }}
                                        style={{
                                          display:'flex', alignItems:'center', gap:10,
                                          width:'100%', padding:'9px 14px', background:'none', border:'none',
                                          color:'rgba(255,255,255,0.85)', fontSize:13, cursor:'pointer',
                                          fontFamily:'inherit', textAlign:'left', transition:'background 0.1s'
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background='rgba(255,255,255,0.08)')}
                                        onMouseLeave={e => (e.currentTarget.style.background='none')}
                                      >
                                        <Info size={15} style={{ color:'#a78bfa' }} />
                                        속성
                                      </button>
                                      <button
                                        onClick={e => {
                                          e.stopPropagation()
                                          if (isFavoritesView) {
                                            toggleFavorite(track)
                                          } else if (selectedPlaylist) {
                                            removeTrackFromPlaylist(selectedPlaylist.id, track.id)
                                          } else {
                                            setDeleteConfirm({ type: 'track', track })
                                          }
                                          setOpenMenuId(null)
                                        }}
                                        style={{
                                          display:'flex', alignItems:'center', gap:10,
                                          width:'100%', padding:'9px 14px', background:'none', border:'none',
                                          color:'rgba(255,100,100,0.85)', fontSize:13, cursor:'pointer',
                                          fontFamily:'inherit', textAlign:'left', transition:'background 0.1s'
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background='rgba(255,80,80,0.08)')}
                                        onMouseLeave={e => (e.currentTarget.style.background='none')}
                                      >
                                        <Trash2 size={15} style={{ color:'#f87171' }} />
                                        {isFavoritesView ? '즐겨찾기 제거' : selectedPlaylist ? '재생목록에서 제거' : '삭제'}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </section>
            </div>
          )}
        </main>

        <NowPlayingPanel
          currentTrack={currentTrack} propertyTrack={null}
          queue={queue} currentIndex={currentIndex}
          isPlaying={isPlaying} currentTime={currentTime} duration={duration}
          volume={volume} eqBands={eqBands} eqPreset={eqPreset}
          eqEnabled={eqEnabled} eqPreamp={eqPreamp}
          repeatMode={repeatMode} isShuffle={isShuffle}
          onPlayPause={() => isPlaying ? pause() : resume()}
          onPrev={playPrev} onNext={playNext} onSeek={seek} onVolume={setVolume}
          onEqBand={setEqBand} onEqPreset={setEqPreset}
          onEqEnabled={setEqEnabled} onEqPreamp={setEqPreamp} onResetEq={resetEq}
          onToggleRepeat={toggleRepeatMode} onToggleShuffle={toggleShuffle}
          onTrackClick={idx => playFromQueue(idx)}
          onClearQueue={() => clearQueue(false)}
          onClearUpcoming={() => clearQueue(true)}
          onRemoveQueueAt={removeQueueAt}
          onMoveQueueItem={moveQueueItem}
          parsedLrc={parsedLrc} activeLineIndex={activeIdx}
          lyricsRef={lyricsRef} onSeekLine={seek}
          view={view} onViewChange={setView}
          activeTab={panelTab} onActiveTabChange={handlePanelTabChange}
          onOpenEq={() => setShowEqModal(true)}
          onOpenProperties={track => track && setModalPropertyTrack(track)}
          accentRgb={rgb}
          favorites={favorites} onToggleFavorite={toggleFavorite}
        />
      </div>

      {/* Bottom bar */}
      <div style={{ height:90, flexShrink:0, display:'flex', alignItems:'center', padding:'0 24px', background:'transparent', zIndex: 1, position: 'relative' }}>
        {/* Left: track info */}
        <div style={{ display:'flex', alignItems:'center', gap:14, flexBasis:'30%', minWidth:200, flexShrink:1 }}>
          <div style={{ width:46, height:46, borderRadius:10, overflow:'hidden', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(255,255,255,0.06)', boxShadow:`0 0 0 2px rgba(${rgb},0.3)` }}>
            {currentTrack?.cover ? <img src={currentTrack.cover} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <FileAudio size={20} style={{ color:'rgba(255,255,255,0.2)' }} />}
          </div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{currentTrack?.title||'—'}</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{currentTrack?.artist||''}</div>
          </div>
          {currentTrack && (
            <button 
              onClick={() => toggleFavorite(currentTrack)}
              style={{ background:'none', border:'none', cursor:'pointer', marginLeft:4, flexShrink:0, padding:4, transition:'color 0.15s', color: favorites.some(f => f.id === currentTrack.id) ? '#e94f8a' : 'rgba(255,255,255,0.35)' }}
            >
              <Heart size={16} fill={favorites.some(f => f.id === currentTrack.id) ? '#e94f8a' : 'none'} />
            </button>
          )}
        </div>

        {/* Center: controls + progress */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'0 16px', minWidth:320 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'clamp(12px, 2vw, 22px)' }}>
            <button className={`ctrl-btn${isShuffle?' active':''}`} onClick={toggleShuffle}><Shuffle size={16} /></button>
            <button className="ctrl-btn" onClick={playPrev}><SkipBack size={20} fill="currentColor" /></button>
            <button className="play-btn" onClick={() => isPlaying ? pause() : resume()}>
              {isPlaying ? <Pause size={16} fill="#0d0d16" color="#0d0d16" /> : <Play size={16} fill="#0d0d16" color="#0d0d16" style={{ marginLeft:2 }} />}
            </button>
            <button className="ctrl-btn" onClick={playNext}><SkipForward size={20} fill="currentColor" /></button>
            <button className={`ctrl-btn${repeatMode!=='off'?' active':''}`} onClick={toggleRepeatMode}>
              {repeatMode==='one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
            </button>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, width:'100%', maxWidth:520 }}>
            <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)', width:32, textAlign:'right', flexShrink:0, fontVariantNumeric:'tabular-nums' }}>{fmtTime(currentTime)}</span>
            <div className="progress-bar" style={{ flex:1 }}
              onClick={e => { const r=e.currentTarget.getBoundingClientRect(); seek(((e.clientX-r.left)/r.width)*duration) }}>
              <div className="progress-fill" style={{ width:`${pct}%` }} />
            </div>
            <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)', width:32, flexShrink:0, fontVariantNumeric:'tabular-nums' }}>{fmtTime(duration)}</span>
          </div>
        </div>

        {/* Right: volume */}
        <div style={{ display:'flex', alignItems:'center', gap:12, flexBasis:'30%', minWidth:160, justifyContent:'flex-end', flexShrink:1 }}>
          <Volume2 size={16} style={{ color:'rgba(255,255,255,0.4)', flexShrink:0 }} />
          <input type="range" min={0} max={1} step={0.01} value={volume} onChange={e => setVolume(parseFloat(e.target.value))}
            style={{ width:'100%', maxWidth:120, background:`linear-gradient(90deg, #8b5cf6 ${volume*100}%, rgba(255,255,255,0.12) ${volume*100}%)` }} />
        </div>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {showCreatePlaylist && (
        <div
          onMouseDown={e => {
            if (e.target === e.currentTarget) closeCreatePlaylist()
          }}
          style={{ position:'fixed', inset:0, zIndex:2000, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:24, backdropFilter:'blur(10px)' }}
        >
          <div style={{ width:'min(380px, 100%)', borderRadius:14, background:'rgba(18,18,30,0.98)', border:'1px solid rgba(255,255,255,0.1)', boxShadow:'0 24px 80px rgba(0,0,0,0.55)', overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 18px', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                <ListMusic size={17} style={{ color:'#a78bfa' }} />
                <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>새 재생목록</div>
              </div>
              <button onClick={closeCreatePlaylist} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.45)', display:'flex', padding:4, cursor:'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding:18 }}>
              <input
                autoFocus
                value={playlistName}
                onChange={e => setPlaylistName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createPlaylist() }}
                placeholder="재생목록 이름"
                style={{ width:'100%', boxSizing:'border-box', padding:'11px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.06)', color:'#fff', outline:'none', fontFamily:'inherit', fontSize:13 }}
              />
              <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
                <button onClick={closeCreatePlaylist} style={{ padding:'9px 13px', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.8)', fontSize:13, fontFamily:'inherit', cursor:'pointer' }}>
                  취소
                </button>
                <button onClick={createPlaylist} style={{ padding:'9px 13px', borderRadius:8, border:'none', background:'#a78bfa', color:'#151020', fontSize:13, fontWeight:800, fontFamily:'inherit', cursor:'pointer' }}>
                  만들기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {playlistTargetTracks.length > 0 && (
        <div
          onMouseDown={e => {
            if (e.target === e.currentTarget) setPlaylistTargetTracks([])
          }}
          style={{ position:'fixed', inset:0, zIndex:2000, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:24, backdropFilter:'blur(10px)' }}
        >
          <div style={{ width:'min(420px, 100%)', maxHeight:'min(560px, calc(100vh - 48px))', display:'flex', flexDirection:'column', borderRadius:14, background:'rgba(18,18,30,0.98)', border:'1px solid rgba(255,255,255,0.1)', boxShadow:'0 24px 80px rgba(0,0,0,0.55)', overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 18px', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:9, minWidth:0 }}>
                <ListMusic size={17} style={{ color:'#a78bfa', flexShrink:0 }} />
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>재생목록에 추가</div>
                  <div style={{ marginTop:3, fontSize:11, color:'rgba(255,255,255,0.42)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {playlistTargetTracks.length === 1 ? playlistTargetTracks[0].title : `${playlistTargetTracks.length}곡 선택됨`}
                  </div>
                </div>
              </div>
              <button onClick={() => setPlaylistTargetTracks([])} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.45)', display:'flex', padding:4, cursor:'pointer', flexShrink:0 }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding:14, overflowY:'auto' }}>
              {playlists.length === 0 ? (
                <div style={{ padding:'26px 12px', textAlign:'center', color:'rgba(255,255,255,0.42)' }}>
                  <ListMusic size={34} style={{ margin:'0 auto 10px', color:'rgba(255,255,255,0.18)' }} />
                  <div style={{ fontSize:13, fontWeight:800, color:'rgba(255,255,255,0.62)', marginBottom:5 }}>재생목록이 없습니다.</div>
                  <div style={{ fontSize:12 }}>먼저 새 재생목록을 만들어주세요.</div>
                </div>
              ) : playlists.map(playlist => {
                const alreadyAddedCount = playlistTargetTracks.filter(track => playlist.trackIds.includes(track.id)).length
                const allAlreadyAdded = alreadyAddedCount === playlistTargetTracks.length
                return (
                  <button
                    key={playlist.id}
                    disabled={allAlreadyAdded}
                    onClick={() => {
                      addTracksToPlaylist(playlist.id, playlistTargetTracks)
                      setPlaylistTargetTracks([])
                      clearSelection()
                    }}
                    style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'11px 12px', borderRadius:9, border:'none', background:allAlreadyAdded ? 'rgba(167,139,250,0.1)' : 'transparent', color:allAlreadyAdded ? 'rgba(196,181,253,0.8)' : 'rgba(255,255,255,0.86)', cursor:allAlreadyAdded ? 'default' : 'pointer', fontFamily:'inherit', textAlign:'left' }}
                  >
                    <div style={{ width:36, height:36, borderRadius:8, background:'rgba(139,92,246,0.14)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <ListMusic size={17} style={{ color:'#a78bfa' }} />
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{playlist.name}</div>
                      <div style={{ marginTop:2, fontSize:11, color:'rgba(255,255,255,0.36)' }}>
                        {playlist.trackIds.length}곡{alreadyAddedCount > 0 ? ` · ${alreadyAddedCount}곡 이미 추가됨` : ''}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            <div style={{ display:'flex', justifyContent:'space-between', gap:8, padding:'12px 14px', borderTop:'1px solid rgba(255,255,255,0.08)' }}>
              <button
                onClick={() => {
                  setNewPlaylistSeedTracks(playlistTargetTracks)
                  setPlaylistTargetTracks([])
                  setShowCreatePlaylist(true)
                }}
                style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.82)', fontSize:13, fontFamily:'inherit', cursor:'pointer' }}
              >
                <Plus size={15} />
                새 재생목록
              </button>
              <button onClick={() => setPlaylistTargetTracks([])} style={{ padding:'9px 13px', borderRadius:8, border:'none', background:'#a78bfa', color:'#151020', fontSize:13, fontWeight:800, fontFamily:'inherit', cursor:'pointer' }}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
      {showLyricsFullscreen && (
        <div
          onMouseDown={e => {
            if (e.target === e.currentTarget) setShowLyricsFullscreen(false)
          }}
          style={{ position:'fixed', inset:0, zIndex:2200, overflow:'hidden', background:'#07070d', color:'#fff' }}
        >
          <div style={{
            position:'absolute', inset:-28,
            backgroundImage: currentTrack?.cover ? `url(${currentTrack.cover})` : 'none',
            backgroundSize:'cover',
            backgroundPosition:'center',
            filter:'blur(28px) brightness(0.42) saturate(1.12)',
            opacity: currentTrack?.cover ? 0.82 : 0,
            transform:'scale(1.02)'
          }} />
          <div style={{ position:'absolute', inset:0, background:`radial-gradient(circle at 28% 20%, rgba(${rgb},0.28), transparent 36%), linear-gradient(180deg, rgba(7,7,13,0.52), rgba(7,7,13,0.9))` }} />

          <div style={{ position:'relative', height:'100%', display:'grid', gridTemplateRows:'1fr auto', padding:'46px 56px 34px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'minmax(240px, 340px) 1fr', gap:54, minHeight:0, alignItems:'center' }}>
              <div style={{ minWidth:0 }}>
                <div style={{ width:'100%', aspectRatio:'1/1', borderRadius:20, overflow:'hidden', background:'rgba(255,255,255,0.06)', boxShadow:`0 28px 90px rgba(${rgb},0.36)`, marginBottom:22 }}>
                  {currentTrack?.cover
                    ? <img src={currentTrack.cover} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}><FileAudio size={64} style={{ color:'rgba(255,255,255,0.16)' }} /></div>}
                </div>
                <div style={{ fontSize:26, fontWeight:900, lineHeight:1.18, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{currentTrack?.title || '재생 중인 곡 없음'}</div>
                <div style={{ marginTop:8, fontSize:15, color:'rgba(255,255,255,0.55)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{currentTrack?.artist || ''}</div>
              </div>

              <div
                ref={lyricsFullscreenRef}
                style={{ height:'100%', maxHeight:'calc(100vh - 210px)', overflowY:'auto', display:'flex', flexDirection:'column', gap:18, padding:'18px 18px 42px', maskImage:'linear-gradient(180deg, transparent 0%, #000 10%, #000 86%, transparent 100%)' }}
              >
                {parsedLrc.length > 0 ? parsedLrc.map((ln, i) => {
                  const isActive = i === activeIdx
                  return (
                    <p
                      key={i}
                      data-idx={i}
                      onClick={() => ln.time !== -1 && seek(ln.time)}
                      style={{
                        margin:0,
                        fontSize:isActive ? 32 : 23,
                        lineHeight:1.45,
                        fontWeight:isActive ? 900 : 700,
                        color:isActive ? '#fff' : 'rgba(255,255,255,0.28)',
                        cursor:ln.time !== -1 ? 'pointer' : 'default',
                        transform:isActive ? 'translateX(14px)' : 'translateX(0)',
                        transition:'all 0.35s cubic-bezier(0.25, 1, 0.5, 1)',
                        textShadow:isActive ? `0 0 32px rgba(${rgb},0.8)` : 'none'
                      }}
                    >
                      {ln.text || '\u00a0'}
                    </p>
                  )
                }) : (
                  <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.32)', fontSize:22, fontWeight:800 }}>
                    가사가 없습니다.
                  </div>
                )}
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr', gridTemplateRows:'auto auto', alignItems:'center', gap:'18px 24px', paddingTop:24 }}>
              <div style={{ gridColumn:'1 / -1', display:'flex', alignItems:'center', gap:12, minWidth:0 }}>
                <span style={{ fontSize:12, color:'rgba(255,255,255,0.42)', width:38, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmtTime(currentTime)}</span>
                <div style={{ flex:1, height:6, borderRadius:999, background:'rgba(255,255,255,0.14)', cursor:'pointer', overflow:'hidden', boxShadow:'inset 0 0 0 1px rgba(255,255,255,0.04)' }}
                  onClick={e => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX-r.left)/r.width)*duration) }}>
                  <div style={{ height:'100%', width:`${pct}%`, borderRadius:999, background:'#fff', boxShadow:`0 0 18px rgba(${rgb},0.6)` }} />
                </div>
                <span style={{ fontSize:12, color:'rgba(255,255,255,0.42)', width:38, fontVariantNumeric:'tabular-nums' }}>{fmtTime(duration)}</span>
              </div>

              <div style={{ gridColumn:2, display:'flex', alignItems:'center', justifyContent:'center', gap:14 }}>
                <button
                  onClick={playPrev}
                  title="이전 곡"
                  style={{ width:44, height:44, borderRadius:22, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.78)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', padding:0, backdropFilter:'blur(12px)' }}
                >
                  <SkipBack size={20} />
                </button>
                <button
                  onClick={() => isPlaying ? pause() : resume()}
                  title={isPlaying ? '일시정지' : '재생'}
                  style={{ width:58, height:58, borderRadius:29, border:'none', background:'#fff', color:'#0d0d16', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', padding:0, boxShadow:'0 14px 38px rgba(0,0,0,0.42)' }}
                >
                  {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" style={{ marginLeft:3 }} />}
                </button>
                <button
                  onClick={playNext}
                  title="다음 곡"
                  style={{ width:44, height:44, borderRadius:22, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.78)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', padding:0, backdropFilter:'blur(12px)' }}
                >
                  <SkipForward size={20} />
                </button>
              </div>

              <div style={{ gridColumn:3, justifySelf:'end', width:170, display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:999, background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.09)', backdropFilter:'blur(12px)' }}>
                <Volume2 size={17} style={{ color:'rgba(255,255,255,0.5)', flexShrink:0 }} />
                <input type="range" min={0} max={1} step={0.01} value={volume} onChange={e => setVolume(parseFloat(e.target.value))}
                  style={{ width:'100%', background:`linear-gradient(90deg, #fff ${volume*100}%, rgba(255,255,255,0.15) ${volume*100}%)` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {showInfo && (
        <div
          onMouseDown={e => {
            if (e.target === e.currentTarget) setShowInfo(false)
          }}
          style={{ position:'fixed', inset:0, zIndex:2000, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:24, backdropFilter:'blur(10px)' }}
        >
          <div style={{ width:'min(430px, 100%)', borderRadius:16, background:'rgba(18,18,30,0.98)', border:'1px solid rgba(255,255,255,0.1)', boxShadow:'0 24px 80px rgba(0,0,0,0.55)', overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'17px 18px', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <Info size={18} style={{ color:'#a78bfa' }} />
                <div style={{ fontSize:16, fontWeight:850, color:'#fff' }}>Luma 정보</div>
              </div>
              <button onClick={() => setShowInfo(false)} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.45)', display:'flex', padding:4, cursor:'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding:20 }}>
              <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:18 }}>
                <div style={{ width:58, height:58, borderRadius:14, overflow:'hidden', background:'rgba(255,255,255,0.06)', boxShadow:'0 12px 32px rgba(139,92,246,0.35)' }}>
                  <img src={logoUrl} alt="Luma Logo" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                </div>
                <div>
                  <div style={{ fontSize:22, fontWeight:900, color:'#fff', lineHeight:1 }}>Luma</div>
                  <div style={{ marginTop:6, fontSize:12, color:'rgba(255,255,255,0.42)' }}>버전 1.0.0</div>
                </div>
              </div>

              <div style={{ fontSize:13, lineHeight:1.7, color:'rgba(255,255,255,0.68)', marginBottom:18 }}>
                Luma는 로컬 음악 파일을 빠르게 추가하고 재생하기 위한 데스크톱 음악 플레이어입니다.
                대기열, 가사, EQ, Discord Rich Presence, 파일 속성 기능을 중심으로 개발 중입니다.
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:18 }}>
                {[
                  ['데스크톱', 'Electron + React'],
                  ['모바일', 'Expo 기반 개발 중'],
                  ['재생', '로컬 파일 중심'],
                  ['가사', '파일 내장 가사']
                ].map(([label, value]) => (
                  <div key={label} style={{ padding:'10px 11px', borderRadius:8, background:'rgba(255,255,255,0.045)', border:'1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.32)', marginBottom:4 }}>{label}</div>
                    <div style={{ fontSize:12, color:'rgba(255,255,255,0.72)', fontWeight:700 }}>{value}</div>
                  </div>
                ))}
              </div>

              <div style={{ padding:'11px 12px', borderRadius:8, background:'rgba(167,139,250,0.1)', border:'1px solid rgba(167,139,250,0.18)', color:'rgba(255,255,255,0.68)', fontSize:12, lineHeight:1.55 }}>
                현재 모바일 버전은 별도 `mobile/` 패키지에서 병행 개발 중입니다.
              </div>

              <div style={{ display:'flex', justifyContent:'flex-end', marginTop:18 }}>
                <button onClick={() => setShowInfo(false)} style={{ padding:'9px 14px', borderRadius:8, border:'none', background:'#a78bfa', color:'#151020', fontSize:13, fontWeight:850, fontFamily:'inherit', cursor:'pointer' }}>
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEqModal && (
        <div
          onMouseDown={e => {
            if (e.target === e.currentTarget) setShowEqModal(false)
          }}
          style={{ position:'fixed', inset:0, zIndex:2000, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:24, backdropFilter:'blur(10px)' }}
        >
          <div style={{ width:'min(620px, 100%)', maxHeight:'min(720px, calc(100vh - 48px))', overflowY:'auto', borderRadius:14, background:'rgba(18,18,30,0.98)', border:'1px solid rgba(255,255,255,0.1)', boxShadow:'0 24px 80px rgba(0,0,0,0.55)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 18px', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                <BarChart2 size={17} style={{ color:'#a78bfa' }} />
                <div>
                  <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>EQ</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)', marginTop:2 }}>{eqPreset === 'custom' ? '사용자 설정' : eqPreset.toUpperCase()}</div>
                </div>
              </div>
              <button onClick={() => setShowEqModal(false)} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.45)', display:'flex', padding:4, cursor:'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding:18 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', borderRadius:8, background:'rgba(255,255,255,0.045)', marginBottom:12 }}>
                <span style={{ fontSize:12, color:'rgba(255,255,255,0.68)', fontWeight:800 }}>EQ 사용</span>
                <button
                  onClick={() => setEqEnabled(!eqEnabled)}
                  title={eqEnabled ? 'EQ 끄기' : 'EQ 켜기'}
                  style={{ width:40, height:22, borderRadius:20, border:'none', padding:2, background:eqEnabled ? 'rgba(167,139,250,0.55)' : 'rgba(255,255,255,0.12)', display:'flex', justifyContent:eqEnabled ? 'flex-end' : 'flex-start', cursor:'pointer' }}
                >
                  <span style={{ width:18, height:18, borderRadius:'50%', background:'#fff', display:'block' }} />
                </button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8, marginBottom:16 }}>
                {[
                  ['flat', '기본'],
                  ['bass', '저음'],
                  ['vocal', '보컬'],
                  ['bright', '고음'],
                  ['rock', '록'],
                  ['electronic', '일렉트로닉']
                ].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setEqPreset(key as any)}
                    style={{ padding:'10px 8px', borderRadius:8, border:'none', background:eqPreset === key ? 'rgba(139,92,246,0.24)' : 'rgba(255,255,255,0.06)', color:eqPreset === key ? '#c4b5fd' : 'rgba(255,255,255,0.62)', fontSize:12, fontWeight:eqPreset === key ? 800 : 600, fontFamily:'inherit', cursor:'pointer' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ marginBottom:16, padding:'12px', borderRadius:8, background:'rgba(255,255,255,0.045)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontSize:12, color:'rgba(255,255,255,0.58)', fontWeight:800 }}>프리앰프</span>
                  <span style={{ fontSize:12, color:'rgba(255,255,255,0.45)', fontVariantNumeric:'tabular-nums' }}>{eqPreamp > 0 ? `+${eqPreamp}` : eqPreamp} dB</span>
                </div>
                <input type="range" min={-12} max={12} step={1} value={eqPreamp} disabled={!eqEnabled} onChange={e => setEqPreamp(Number(e.target.value))} style={{ width:'100%', accentColor:'#a78bfa', background:eqSliderBackground(eqPreamp), opacity:eqEnabled ? 1 : 0.35 }} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 16px' }}>
                {eqBands.map((band, idx) => (
                  <div key={band.frequency} style={{ display:'grid', gridTemplateColumns:'38px 1fr 48px', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:12, color:'rgba(255,255,255,0.56)', fontWeight:800, textAlign:'right' }}>{band.label}</span>
                    <input type="range" min={-12} max={12} step={1} value={band.gain} disabled={!eqEnabled} onChange={e => setEqBand(idx, Number(e.target.value))} style={{ width:'100%', accentColor:'#a78bfa', background:eqSliderBackground(band.gain), opacity:eqEnabled ? 1 : 0.35 }} />
                    <span style={{ fontSize:11, color:'rgba(255,255,255,0.42)', fontVariantNumeric:'tabular-nums' }}>{band.gain > 0 ? `+${band.gain}` : band.gain} dB</span>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:18 }}>
                <button onClick={resetEq} style={{ padding:'9px 13px', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.8)', fontSize:13, fontFamily:'inherit', cursor:'pointer' }}>초기화</button>
                <button onClick={() => setShowEqModal(false)} style={{ padding:'9px 13px', borderRadius:8, border:'none', background:'#a78bfa', color:'#151020', fontSize:13, fontWeight:800, fontFamily:'inherit', cursor:'pointer' }}>닫기</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalPropertyTrack && (
        <div
          onMouseDown={e => {
            if (e.target === e.currentTarget) setModalPropertyTrack(null)
          }}
          style={{ position:'fixed', inset:0, zIndex:2000, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:24, backdropFilter:'blur(10px)' }}
        >
          <div style={{ width:'min(460px, 100%)', borderRadius:14, background:'rgba(18,18,30,0.98)', border:'1px solid rgba(255,255,255,0.1)', boxShadow:'0 24px 80px rgba(0,0,0,0.55)', overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 18px', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:9, minWidth:0 }}>
                <Info size={17} style={{ color:'#a78bfa', flexShrink:0 }} />
                <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>속성</div>
              </div>
              <button onClick={() => setModalPropertyTrack(null)} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.45)', display:'flex', padding:4, cursor:'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding:18, display:'flex', gap:14 }}>
              <div style={{ width:82, height:82, borderRadius:10, overflow:'hidden', flexShrink:0, background:'rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                {modalPropertyTrack.cover
                  ? <img src={modalPropertyTrack.cover} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  : <FileAudio size={28} style={{ color:'rgba(255,255,255,0.18)' }} />}
              </div>
              <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:10 }}>
                {[
                  ['제목', modalPropertyTrack.title],
                  ['아티스트', modalPropertyTrack.artist],
                  ['앨범', modalPropertyTrack.album || '-'],
                  ['길이', fmtTime((modalPropertyTrack.id === currentTrack?.id ? duration : 0) || modalPropertyTrack.duration || 0)],
                  ['경로', modalPropertyTrack.id]
                ].map(([label, value]) => (
                  <div key={label} style={{ minWidth:0 }}>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.32)', marginBottom:3, textTransform:'uppercase', letterSpacing:'0.04em' }}>{label}</div>
                    <div style={{ fontSize:13, lineHeight:1.45, color:'rgba(255,255,255,0.78)', wordBreak:'break-all' }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'0 18px 18px' }}>
              {!modalPropertyTrack.id.startsWith('http') && (
                <button
                  onClick={() => showInFolder(modalPropertyTrack)}
                  style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 13px', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.82)', fontSize:13, fontFamily:'inherit', cursor:'pointer' }}
                >
                  <FolderOpen size={15} />
                  파일 위치 열기
                </button>
              )}
              <button onClick={() => setModalPropertyTrack(null)} style={{ padding:'9px 13px', borderRadius:8, border:'none', background:'#a78bfa', color:'#151020', fontSize:13, fontWeight:800, fontFamily:'inherit', cursor:'pointer' }}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div
          onMouseDown={e => {
            if (e.target === e.currentTarget) setDeleteConfirm(null)
          }}
          style={{ position:'fixed', inset:0, zIndex:2100, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:24, backdropFilter:'blur(10px)' }}
        >
          <div style={{ width:'min(390px, 100%)', borderRadius:14, background:'rgba(18,18,30,0.98)', border:'1px solid rgba(255,255,255,0.1)', boxShadow:'0 24px 80px rgba(0,0,0,0.55)', overflow:'hidden' }}>
            <div style={{ padding:'18px 18px 10px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                <div style={{ width:34, height:34, borderRadius:17, background:'rgba(248,113,113,0.14)', display:'flex', alignItems:'center', justifyContent:'center', color:'#f87171' }}>
                  <Trash2 size={17} />
                </div>
                <div style={{ fontSize:16, fontWeight:850, color:'#fff' }}>
                  {deleteConfirm.type === 'all' ? '전체 곡 삭제' : '곡 삭제'}
                </div>
              </div>
              <div style={{ fontSize:13, lineHeight:1.55, color:'rgba(255,255,255,0.62)' }}>
                {deleteConfirm.type === 'all'
                  ? '라이브러리의 모든 곡과 최근 재생, 즐겨찾기, 대기열을 비웁니다.'
                  : `"${deleteConfirm.track.title}" 곡을 라이브러리에서 삭제합니다.`}
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'10px 18px 18px' }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ padding:'9px 13px', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.8)', fontSize:13, fontFamily:'inherit', cursor:'pointer' }}>
                취소
              </button>
              <button onClick={confirmDelete} style={{ padding:'9px 13px', borderRadius:8, border:'none', background:'#ef4444', color:'#fff', fontSize:13, fontWeight:800, fontFamily:'inherit', cursor:'pointer' }}>
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .track-row td { transition: none; }
        .track-row:hover .option-btn { opacity: 1 !important; }
        .track-row:hover { background: rgba(255,255,255,0.05); }
        .track-row.active { background: rgba(139,92,246,0.12); }
        
        .nav-item:hover:not(.active) { background: rgba(255,255,255,0.05) !important; color: rgba(255,255,255,0.8) !important; cursor: pointer; }
        .bottom-btn:hover { background: rgba(255,255,255,0.05) !important; color: rgba(255,255,255,0.8) !important; cursor: pointer; }
        
        button:not(:disabled) { cursor: pointer; }
        button:active { transform: scale(0.98); }
        
        .control-btn { transition: all 0.2s; opacity: 0.7; }
        .control-btn:hover { opacity: 1; transform: scale(1.1); }
      `}</style>
    </div>
  )
}
