import React, { useState, useEffect, useRef, useMemo } from 'react'
import { FastAverageColor } from 'fast-average-color'
import { useAudio } from '../contexts/AudioContext'
import { useLyrics } from '../hooks/useLyrics'
import Sidebar from './Sidebar'
import NowPlayingPanel from './NowPlayingPanel'
import SettingsModal from './SettingsModal'
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1,
  Volume2, Plus, FileAudio, Trash2, X, Heart, ChevronRight, Clock, MoreHorizontal
} from 'lucide-react'

interface LrcLine { time: number; text: string }

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

export default function MainLayout() {
  const {
    currentTrack, playNext, playPrev, isPlaying, pause, resume, duration, currentTime, seek,
    volume, setVolume, queue, currentIndex, play, playQueue, addTracksToQueue, removeTrack, clearQueue, recentlyPlayed, favorites, toggleFavorite,
    repeatMode, isShuffle, toggleRepeatMode, toggleShuffle
  } = useAudio()

  const [activeNav, setActiveNav] = useState('홈')
  const [view, setView] = useState<'home'|'detail'>('home')
  const { lyrics } = useLyrics(currentTrack)
  const [parsedLrc, setParsedLrc] = useState<LrcLine[]>([])
  const lyricsRef = useRef<HTMLDivElement>(null)
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
    if (activeIdx >= 0 && lyricsRef.current) {
      const container = lyricsRef.current
      const activeEl = container.querySelector(`p[data-idx="${activeIdx}"]`) as HTMLElement
      if (activeEl) {
        // Find the actual scrollable parent (either the container itself or it's the container)
        // offsetTop is relative to the offsetParent. If container is position:relative, it works.
        const offsetTop = activeEl.offsetTop
        const containerHalf = container.clientHeight / 2
        const elHalf = activeEl.clientHeight / 2
        container.scrollTo({ top: offsetTop - containerHalf + elHalf, behavior: 'smooth' })
      }
    }
  }, [activeIdx])

  useEffect(() => {
    if (!currentTrack?.cover) { setRgb('60,20,120'); return }
    new FastAverageColor().getColorAsync(currentTrack.cover, { crossOrigin:'anonymous', algorithm:'dominant' })
      .then(c => setRgb(`${c.value[0]},${c.value[1]},${c.value[2]}`))
      .catch(() => setRgb('60,20,120'))
  }, [currentTrack?.cover])

  const addFiles = async () => {
    // @ts-ignore
    const tracks = await window.api.selectFiles()
    if (tracks?.length) addTracksToQueue(tracks)
  }

  const [showSettings, setShowSettings] = useState(false)
  const pct = duration > 0 ? (currentTime/duration)*100 : 0
  const recent = useMemo(() => recentlyPlayed.slice(0,5), [recentlyPlayed])

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
        <Sidebar activeNav={activeNav} setActiveNav={nav => { setActiveNav(nav); setView('home') }} onAddFiles={addFiles} onOpenSettings={() => setShowSettings(true)} />

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
                    <button style={{ background:'none', border:'none', cursor:'pointer', padding:0, color:'rgba(255,255,255,0.5)' }}><MoreHorizontal size={20} /></button>
                  </div>
                </div>

                {/* Right: Info */}
                <div style={{ flex:1, minWidth:0 }}>
                  <h1 style={{ fontSize:48, fontWeight:800, color:'#fff', lineHeight:1.1, marginBottom:16, letterSpacing:'-0.03em' }}>{currentTrack.title}</h1>
                  <div style={{ fontSize:22, color:'#e94f8a', fontWeight:600, marginBottom:10 }}>{currentTrack.artist}</div>
                  <div style={{ fontSize:15, color:'rgba(255,255,255,0.6)', marginBottom:24 }}>{currentTrack.album}</div>
                  <div style={{ display:'flex', gap:8, marginBottom:40, flexWrap:'wrap' }}>
                    {currentTrack.format?.container && <span style={{ fontSize:11, padding:'4px 14px', borderRadius:6, background:'rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.7)', fontWeight:600 }}>{currentTrack.format.container.toUpperCase()}</span>}
                    {currentTrack.format?.lossless && <span style={{ fontSize:11, padding:'4px 14px', borderRadius:6, background:'rgba(139,92,246,0.2)', border:'1px solid rgba(139,92,246,0.4)', color:'#a78bfa', fontWeight:600 }}>LOSSLESS</span>}
                    {currentTrack.format?.sampleRate && <span style={{ fontSize:11, padding:'4px 14px', borderRadius:6, background:'rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.7)', fontWeight:600 }}>{(currentTrack.format.sampleRate/1000).toFixed(1)}kHz</span>}
                  </div>
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
                  <button style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.5)', fontSize:13, display:'flex', alignItems:'center', gap:4 }}>더보기 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg></button>
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
              <h1 style={{ fontSize:30, fontWeight:800, color:'#fff', marginBottom:32, letterSpacing:'-0.02em' }}>홈</h1>

              {/* Recent */}
              {recent.length > 0 && (
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
                          onDoubleClick={() => { play(track); setView('detail') }}>
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
                  <span style={{ fontSize:18, fontWeight:700, color:'#fff' }}>전체 곡</span>
                  <div style={{ display:'flex', gap:8 }}>
                    {queue.length > 0 && (
                      <button onClick={clearQueue} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:20, fontSize:12, fontWeight:600, border:'1px solid rgba(255,255,255,0.12)', background:'transparent', color:'rgba(255,255,255,0.45)', cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' }}>
                        <Trash2 size={13} /> 전체 삭제
                      </button>
                    )}
                    <button onClick={addFiles} className="gradient-btn" style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 18px', fontSize:12 }}>
                      <Plus size={14} /> 음악 추가
                    </button>
                  </div>
                </div>

                {(activeNav === '즐겨찾기' ? favorites.length === 0 : queue.length === 0) ? (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'80px 0', color:'rgba(255,255,255,0.1)' }}>
                    {activeNav === '즐겨찾기' ? <Heart size={72} strokeWidth={1} style={{ marginBottom:16 }} /> : <FileAudio size={72} strokeWidth={1} style={{ marginBottom:16 }} />}
                    <p style={{ fontSize:17, fontWeight:700 }}>{activeNav === '즐겨찾기' ? '즐겨찾기가 없습니다.' : '음악을 추가해보세요.'}</p>
                  </div>
                ) : (
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
                        <th style={{ padding:'8px 12px', textAlign:'center', fontSize:11, fontWeight:500, letterSpacing:'0.06em', color:'rgba(255,255,255,0.3)', width:44 }}>#</th>
                        <th style={{ padding:'8px 12px', textAlign:'left', fontSize:11, fontWeight:500, letterSpacing:'0.06em', color:'rgba(255,255,255,0.3)' }}>제목</th>
                        <th style={{ padding:'8px 12px', textAlign:'left', fontSize:11, fontWeight:500, letterSpacing:'0.06em', color:'rgba(255,255,255,0.3)' }}>아티스트</th>
                        <th style={{ padding:'8px 12px', textAlign:'left', fontSize:11, fontWeight:500, letterSpacing:'0.06em', color:'rgba(255,255,255,0.3)' }}>앨범</th>
                        <th style={{ padding:'8px 12px', textAlign:'right', fontSize:11, fontWeight:500, letterSpacing:'0.06em', color:'rgba(255,255,255,0.3)', width:52 }}><Clock size={13} style={{ display:'inline' }} /></th>
                        <th style={{ width:50 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(activeNav === '즐겨찾기' ? favorites : queue).map((track, idx) => {
                        const isActive = currentTrack?.id === track.id
                        const isFav = favorites.some(f => f.id === track.id)
                        return (
                          <tr key={track.id} className={`track-row${isActive?' active':''}`}
                            onDoubleClick={() => { 
                              if (activeNav === '즐겨찾기') play(track)
                              else playQueue(queue, idx)
                              setView('detail')
                            }}>
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
                                  {track.format?.lossless && <span style={{ fontSize:9, padding:'1px 6px', borderRadius:10, background:'rgba(139,92,246,0.2)', color:'#a78bfa', fontWeight:700, letterSpacing:'0.05em', marginTop:2, display:'inline-block' }}>LOSSLESS</span>}
                                </div>
                              </div>
                            </td>
                            <td style={{ padding:'11px 12px', fontSize:13, color:'rgba(255,255,255,0.5)' }}>{track.artist}</td>
                            <td style={{ padding:'11px 12px', fontSize:13, color:'rgba(255,255,255,0.35)' }}>{track.album}</td>
                            <td style={{ padding:'11px 12px', textAlign:'right', fontSize:13, color:'rgba(255,255,255,0.4)', width:52, fontVariantNumeric:'tabular-nums' }}>—</td>
                            <td style={{ padding:'11px 6px', textAlign:'right', width:50 }}>
                              <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4 }}>
                                <button onClick={e => { e.stopPropagation(); toggleFavorite(track) }} style={{ background:'none', border:'none', cursor:'pointer', padding:4, color: isFav ? '#e94f8a' : 'rgba(255,255,255,0.2)', transition:'color 0.15s' }}>
                                  <Heart size={16} fill={isFav ? '#e94f8a' : 'none'} />
                                </button>
                                {activeNav !== '즐겨찾기' && (
                                  <button onClick={e => removeTrack(track.id, e)} style={{ background:'none', border:'none', cursor:'pointer', padding:4, color:'rgba(255,255,255,0.35)', opacity:0, transition:'opacity 0.15s' }}
                                    className="remove-btn">
                                    <Trash2 size={16} />
                                  </button>
                                )}
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
          currentTrack={currentTrack} queue={queue} currentIndex={currentIndex}
          isPlaying={isPlaying} currentTime={currentTime} duration={duration}
          volume={volume} repeatMode={repeatMode} isShuffle={isShuffle}
          onPlayPause={() => isPlaying ? pause() : resume()}
          onPrev={playPrev} onNext={playNext} onSeek={seek} onVolume={setVolume}
          onToggleRepeat={toggleRepeatMode} onToggleShuffle={toggleShuffle}
          onTrackClick={idx => playQueue(queue, idx)}
          onClearQueue={clearQueue}
          parsedLrc={parsedLrc} activeLineIndex={activeIdx}
          lyricsRef={lyricsRef} onSeekLine={seek}
          view={view} onViewChange={setView} accentRgb={rgb}
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

      <style>{`
        .track-row td { transition: none; }
        .track-row:hover .remove-btn { opacity: 1 !important; }
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
