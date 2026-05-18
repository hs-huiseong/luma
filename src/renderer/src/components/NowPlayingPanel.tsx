import React from 'react'
import { FileAudio, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Heart, AlignJustify, Subtitles, BarChart2, Info, Trash2, GripVertical, ChevronUp, ChevronDown } from 'lucide-react'
import { EqBand, EqPreset, Track } from '../contexts/AudioContext'

export type NowPlayingTab = 'queue' | 'lyrics' | 'eq' | 'properties'

interface Props {
  currentTrack: Track | null
  propertyTrack: Track | null
  queue: Track[]
  currentIndex: number
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  eqBands: EqBand[]
  eqPreset: EqPreset
  eqEnabled: boolean
  eqPreamp: number
  repeatMode: 'off' | 'all' | 'one'
  isShuffle: boolean
  onPlayPause: () => void
  onPrev: () => void
  onNext: () => void
  onSeek: (pos: number) => void
  onVolume: (v: number) => void
  onEqBand: (idx: number, gain: number) => void
  onEqPreset: (preset: EqPreset) => void
  onEqEnabled: (enabled: boolean) => void
  onEqPreamp: (gain: number) => void
  onResetEq: () => void
  onToggleRepeat: () => void
  onToggleShuffle: () => void
  onTrackClick: (idx: number) => void
  onClearQueue: () => void
  onClearUpcoming: () => void
  onRemoveQueueAt: (idx: number) => void
  onMoveQueueItem: (fromIdx: number, toIdx: number) => void
  parsedLrc: { time: number; text: string }[]
  activeLineIndex: number
  lyricsRef: React.RefObject<HTMLDivElement>
  onSeekLine: (time: number) => void
  view: 'home' | 'detail'
  onViewChange: (v: 'home' | 'detail') => void
  activeTab: NowPlayingTab
  onActiveTabChange: (tab: NowPlayingTab) => void
  onOpenEq: () => void
  onOpenProperties: (track: Track | null) => void
  accentRgb: string
  favorites: Track[]
  onToggleFavorite: (track: Track) => void
}

const fmt = (s: number) => {
  if (!s || isNaN(s)) return '0:00'
  return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`
}

export default function NowPlayingPanel(p: Props) {
  const [tab, setTab] = React.useState<NowPlayingTab>('queue')
  const [draggedIndex, setDraggedIndex] = React.useState<number | null>(null)
  const pct = p.duration > 0 ? (p.currentTime / p.duration) * 100 : 0
  const upNext = p.currentIndex >= 0 ? p.queue.slice(p.currentIndex + 1) : p.queue
  const propertyTrack = p.propertyTrack || p.currentTrack

  React.useEffect(() => {
    setTab(p.activeTab)
  }, [p.activeTab])

  const selectTab = (nextTab: NowPlayingTab) => {
    if (nextTab === 'eq') {
      p.onOpenEq()
      return
    }
    if (nextTab === 'properties') {
      p.onOpenProperties(propertyTrack)
      return
    }
    setTab(nextTab)
    p.onActiveTabChange(nextTab)
  }

  const moveByOne = (idx: number, direction: -1 | 1) => {
    const target = idx + direction
    if (target < 0 || target >= p.queue.length) return
    p.onMoveQueueItem(idx, target)
  }

  // Detail mode: show playlist
  if (p.view === 'detail') {
    return (
      <aside style={{ width:280, flexShrink:0, display:'flex', flexDirection:'column', background:'transparent' }}>
        <div style={{ padding:'20px 20px 14px', display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'#fff', marginBottom:3 }}>재생 목록</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)' }}>{p.queue.length}곡</div>
          </div>
          {p.queue.length > 0 && (
            <button onClick={p.onClearQueue} title="대기열 비우기" style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.4)', padding:4 }}>
              <Trash2 size={15} />
            </button>
          )}
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'0 8px' }}>
          {p.queue.length === 0 && (
            <p style={{ textAlign:'center', fontSize:12, color:'rgba(255,255,255,0.22)', padding:'28px 8px' }}>대기열이 비어 있습니다.</p>
          )}
          {p.queue.map((track, idx) => {
            const isActive = idx === p.currentIndex
            return (
              <div key={`${track.id}-${idx}`} onDoubleClick={() => p.onTrackClick(idx)}
                draggable
                onDragStart={() => setDraggedIndex(idx)}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); if (draggedIndex !== null) p.onMoveQueueItem(draggedIndex, idx); setDraggedIndex(null) }}
                onDragEnd={() => setDraggedIndex(null)}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'10px', borderRadius:10, cursor:'pointer', marginBottom:2, background: draggedIndex === idx ? 'rgba(255,255,255,0.08)' : isActive ? 'rgba(139,92,246,0.18)' : 'transparent', transition:'background 0.15s' }}>
                <GripVertical size={14} style={{ color:'rgba(255,255,255,0.22)', flexShrink:0 }} />
                <div style={{ width:20, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {isActive && p.isPlaying
                    ? <div style={{ display:'flex', gap:2, alignItems:'flex-end' }}>
                        <div className="eq-bar-1" style={{ width:3, height:8, borderRadius:2, background:'#a78bfa' }} />
                        <div className="eq-bar-2" style={{ width:3, height:12, borderRadius:2, background:'#a78bfa' }} />
                        <div className="eq-bar-3" style={{ width:3, height:6, borderRadius:2, background:'#a78bfa' }} />
                      </div>
                    : <span style={{ fontSize:12, color: isActive ? '#a78bfa' : 'rgba(255,255,255,0.35)' }}>{idx+1}</span>
                  }
                </div>
                <div style={{ width:40, height:40, borderRadius:8, overflow:'hidden', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(255,255,255,0.06)' }}>
                  {track.cover ? <img src={track.cover} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <FileAudio size={14} style={{ color:'rgba(255,255,255,0.2)' }} />}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight: isActive ? 600 : 500, color: isActive ? '#fff' : 'rgba(255,255,255,0.85)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{track.title}</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{track.artist}</div>
                </div>
                <span style={{ fontSize:11, color:'rgba(255,255,255,0.35)', flexShrink:0 }}>{fmt(track.duration || 0)}</span>
                <div style={{ display:'flex', flexDirection:'column', gap:1, flexShrink:0 }}>
                  <button
                    onClick={e => { e.stopPropagation(); moveByOne(idx, -1) }}
                    disabled={idx === 0}
                    title="위로 이동"
                    style={{ background:'none', border:'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.32)', padding:0, display:'flex' }}
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); moveByOne(idx, 1) }}
                    disabled={idx === p.queue.length - 1}
                    title="아래로 이동"
                    style={{ background:'none', border:'none', cursor: idx === p.queue.length - 1 ? 'default' : 'pointer', color: idx === p.queue.length - 1 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.32)', padding:0, display:'flex' }}
                  >
                    <ChevronDown size={12} />
                  </button>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); p.onRemoveQueueAt(idx) }}
                  title="대기열에서 제거"
                  style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.25)', padding:3, display:'flex' }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )
          })}
        </div>
      </aside>
    )
  }

  return (
    <aside style={{ width:280, flexShrink:0, display:'flex', flexDirection:'column', background:'transparent' }}>

      {/* Header */}
      <div style={{ padding:'20px 20px 0', display:'flex', alignItems:'center' }}>
        <button onClick={() => p.onViewChange('detail')} style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.7)', background:'none', border:'none', cursor:'pointer' }}>
          지금 재생 중
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>

      {/* Album Art */}
      <div style={{ padding:'16px 16px 12px' }}>
        <div style={{ width:'100%', aspectRatio:'1/1', borderRadius:12, overflow:'hidden', background:'rgba(255,255,255,0.05)', cursor:'pointer', boxShadow:`0 8px 32px rgba(${p.accentRgb},0.25)` }} onClick={() => p.onViewChange('detail')}>
          {p.currentTrack?.cover
            ? <img src={p.currentTrack.cover} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}><FileAudio size={48} style={{ color:'rgba(255,255,255,0.12)' }} /></div>}
        </div>
      </div>

      {/* Track info */}
      <div style={{ padding:'0 20px 12px', display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
        <div style={{ minWidth:0, flex:1 }}>
          <div style={{ fontSize:17, fontWeight:700, color:'#fff', marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.currentTrack?.title || '—'}</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.currentTrack?.artist || ''}</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.currentTrack?.album || ''}</div>
        </div>
        {p.currentTrack && (
          <button 
            onClick={() => p.onToggleFavorite(p.currentTrack!)}
            style={{ background:'none', border:'none', cursor:'pointer', color: p.favorites.some(f => f.id === p.currentTrack?.id) ? '#e94f8a' : 'rgba(255,255,255,0.2)', padding:4, flexShrink:0, marginTop:2, transition:'color 0.15s' }}>
            <Heart size={18} fill={p.favorites.some(f => f.id === p.currentTrack?.id) ? '#e94f8a' : 'none'} />
          </button>
        )}
      </div>

      {/* Progress */}
      <div style={{ padding:'0 20px 12px' }}>
        <div style={{ position:'relative', height:3, borderRadius:2, background:'rgba(255,255,255,0.1)', cursor:'pointer', marginBottom:6 }}
          onClick={e => { const r = e.currentTarget.getBoundingClientRect(); p.onSeek(((e.clientX-r.left)/r.width)*p.duration) }}>
          <div style={{ height:'100%', width:`${pct}%`, borderRadius:2, background:'linear-gradient(90deg,#8b5cf6,#ec4899)', position:'relative' }}>
            <div style={{ position:'absolute', right:-5, top:'50%', transform:'translateY(-50%)', width:10, height:10, borderRadius:'50%', background:'#fff', boxShadow:'0 0 4px rgba(0,0,0,0.5)' }} />
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'rgba(255,255,255,0.4)' }}>
          <span>{fmt(p.currentTime)}</span><span>{fmt(p.duration)}</span>
        </div>
      </div>

      {/* Main Controls */}
      <div style={{ padding:'0 20px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <button onClick={p.onToggleShuffle} style={{ background:'none', border:'none', cursor:'pointer', color: p.isShuffle ? '#a78bfa' : 'rgba(255,255,255,0.5)', padding:4, transition:'all 0.15s' }}><Shuffle size={18} /></button>
        <button onClick={p.onPrev} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.8)', padding:4, transition:'all 0.15s' }}><SkipBack size={22} fill="currentColor" /></button>
        <button onClick={p.onPlayPause} style={{ width:48, height:48, borderRadius:'50%', border:'none', cursor:'pointer', background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 16px rgba(0,0,0,0.4)', transition:'all 0.15s', flexShrink:0 }}>
          {p.isPlaying ? <Pause size={20} fill="#0d0d14" color="#0d0d14" /> : <Play size={20} fill="#0d0d14" color="#0d0d14" style={{ marginLeft:2 }} />}
        </button>
        <button onClick={p.onNext} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.8)', padding:4, transition:'all 0.15s' }}><SkipForward size={22} fill="currentColor" /></button>
        <button onClick={p.onToggleRepeat} style={{ background:'none', border:'none', cursor:'pointer', color: p.repeatMode !== 'off' ? '#a78bfa' : 'rgba(255,255,255,0.5)', padding:4, transition:'all 0.15s' }}>
          {p.repeatMode === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
        </button>
      </div>

      {/* Secondary Controls */}
      <div style={{ padding:'0 16px 12px', display:'flex', gap:4 }}>
        {[
          { key:'queue', icon:<AlignJustify size={14} />, label:'대기열' },
          { key:'lyrics', icon:<Subtitles size={14} />, label:'가사' },
          { key:'eq', icon:<BarChart2 size={14} />, label:'EQ' },
          { key:'properties', icon:<Info size={14} />, label:'속성' },
        ].map(t => (
          <button key={t.key} onClick={() => selectTab(t.key as NowPlayingTab)}
            title={t.key === 'properties' ? '속성' : undefined}
            style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:4, padding:'7px 4px', borderRadius:8, border:'none', cursor:'pointer', background: tab === t.key ? 'rgba(139,92,246,0.2)' : 'transparent', color: tab === t.key ? '#a78bfa' : 'rgba(255,255,255,0.35)', fontFamily:'inherit', fontSize:11, fontWeight: tab === t.key ? 600 : 400, transition:'all 0.15s' }}>
            {t.icon}
            {t.label && <span>{t.label}</span>}
          </button>
        ))}
      </div>

      {/* Queue / Lyrics */}
      <div ref={tab === 'lyrics' ? p.lyricsRef : null} style={{ flex:1, overflowY:'auto', padding:'0 12px', position:'relative' }}>
        {tab === 'queue' && (
          <>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 8px 10px', marginBottom:4 }}>
              <span style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.5)' }}>대기열</span>
              {upNext.length > 0 && <button onClick={p.onClearUpcoming} style={{ background:'none', border:'none', cursor:'pointer', fontSize:11, color:'rgba(255,255,255,0.35)', fontFamily:'inherit' }}>다음 곡 지우기</button>}
            </div>
            {p.queue.length === 0 && <p style={{ textAlign:'center', fontSize:12, color:'rgba(255,255,255,0.2)', padding:'20px 0' }}>대기 중인 곡이 없습니다.</p>}
            {p.queue.map((track, i) => {
              const isActive = i === p.currentIndex
              return (
              <div key={`${track.id}-${i}`} onDoubleClick={() => p.onTrackClick(i)}
                draggable
                onDragStart={() => setDraggedIndex(i)}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); if (draggedIndex !== null) p.onMoveQueueItem(draggedIndex, i); setDraggedIndex(null) }}
                onDragEnd={() => setDraggedIndex(null)}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 8px', borderRadius:8, cursor:'pointer', marginBottom:2, transition:'background 0.1s', background: draggedIndex === i ? 'rgba(255,255,255,0.08)' : 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background='rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background=draggedIndex === i ? 'rgba(255,255,255,0.08)' : 'transparent')}>
                <GripVertical size={13} style={{ color:'rgba(255,255,255,0.22)', flexShrink:0 }} />
                <button
                  onClick={e => { e.stopPropagation(); p.onToggleFavorite(track) }}
                  style={{ background:'none', border:'none', cursor:'pointer', color: p.favorites.some(f => f.id === track.id) ? '#e94f8a' : 'rgba(255,255,255,0.25)', padding:2 }}
                >
                  <Heart size={13} fill={p.favorites.some(f => f.id === track.id) ? '#e94f8a' : 'none'} />
                </button>
                <div style={{ width:36, height:36, borderRadius:6, overflow:'hidden', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(255,255,255,0.06)' }}>
                  {track.cover ? <img src={track.cover} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <FileAudio size={13} style={{ color:'rgba(255,255,255,0.15)' }} />}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:isActive ? 700 : 500, color:isActive ? '#fff' : 'rgba(255,255,255,0.88)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{track.title}</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:1 }}>{track.artist}</div>
                </div>
                {isActive && <span style={{ fontSize:10, color:'#a78bfa', flexShrink:0, fontWeight:700 }}>재생 중</span>}
                <div style={{ display:'flex', flexDirection:'column', gap:1, flexShrink:0 }}>
                  <button
                    onClick={e => { e.stopPropagation(); moveByOne(i, -1) }}
                    disabled={i === 0}
                    title="위로 이동"
                    style={{ background:'none', border:'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.32)', padding:0, display:'flex' }}
                  >
                    <ChevronUp size={11} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); moveByOne(i, 1) }}
                    disabled={i === p.queue.length - 1}
                    title="아래로 이동"
                    style={{ background:'none', border:'none', cursor: i === p.queue.length - 1 ? 'default' : 'pointer', color: i === p.queue.length - 1 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.32)', padding:0, display:'flex' }}
                  >
                    <ChevronDown size={11} />
                  </button>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); p.onRemoveQueueAt(i) }}
                  title="대기열에서 제거"
                  style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.25)', padding:2, display:'flex' }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )})}
          </>
        )}

        {tab === 'lyrics' && (
          <div style={{ paddingBottom:100, display:'flex', flexDirection:'column', gap:'12px' }}>
            {p.parsedLrc.length > 0 ? p.parsedLrc.map((ln, i) => {
              const isActive = i === p.activeLineIndex
              return (
                <p key={i} data-idx={i} onClick={() => ln.time !== -1 && p.onSeekLine(ln.time)}
                  style={{ 
                    fontSize: isActive ? 15 : 13, 
                    lineHeight:1.6, 
                    cursor: ln.time !== -1 ? 'pointer' : 'default', 
                    transition:'all 0.4s cubic-bezier(0.25, 1, 0.5, 1)', 
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.3)', 
                    fontWeight: isActive ? 700 : 500, 
                    padding:'0 8px',
                    margin: 0,
                    textShadow: isActive ? '0 0 16px rgba(255,255,255,0.4)' : 'none',
                    transform: isActive ? 'translateX(6px)' : 'translateX(0)',
                    transformOrigin: 'left center'
                  }}>
                  {ln.text || '\u00a0'}
                </p>
              )
            }) : <p style={{ textAlign:'center', fontSize:12, color:'rgba(255,255,255,0.2)', padding:'20px 8px' }}>가사가 없습니다.</p>}
          </div>
        )}

      </div>

    </aside>
  )
}
