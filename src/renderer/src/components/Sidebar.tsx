import React from 'react'
import { Home, Music, Disc, User, Folder, ListMusic, Settings, Info, Plus, Heart, Dumbbell, BookOpen, Moon, Clock } from 'lucide-react'

interface SidebarProps {
  activeNav: string
  setActiveNav: (nav: string) => void
  onAddFiles: () => void
  onOpenSettings: () => void
}

import logoUrl from '../../../assets/logo.png'

const navItems = [
  { label: '홈', icon: Home },
  { label: '곡', icon: Music },
  { label: '앨범', icon: Disc },
  { label: '아티스트', icon: User },
  { label: '폴더', icon: Folder },
  { label: '재생목록', icon: ListMusic },
]

const playlists = [
  { label: '즐겨찾기', icon: Heart, color: '#e94f8a' },
]

const Sidebar: React.FC<SidebarProps> = ({ activeNav, setActiveNav, onAddFiles, onOpenSettings }) => {
  return (
    <aside className="w-[220px] shrink-0 flex flex-col py-4 select-none"
      style={{ background: 'transparent' }}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-[18px] pb-5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden shadow-lg">
          <img src={logoUrl} alt="Luma Logo" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
        </div>
        <span className="font-bold text-[15px] text-white tracking-tight">Luma</span>
      </div>

      {/* Search */}
      <div className="px-3.5 pb-4">
        <div className="flex items-center gap-2 rounded-lg px-3 py-[7px]"
          style={{ background: 'rgba(255,255,255,0.07)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <span className="text-[13px] flex-1" style={{ color: 'rgba(255,255,255,0.35)' }}>검색</span>
        </div>
      </div>

      {/* Nav */}
      <div className="px-2 space-y-0.5">
        {navItems.map(({ label, icon: Icon }) => {
          const isActive = activeNav === label
          return (
            <button key={label}
              onClick={() => setActiveNav(label)}
              className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] transition-all text-left nav-item ${isActive ? 'active' : ''}`}
              style={{
                background: isActive ? 'linear-gradient(90deg,rgba(139,92,246,0.3),rgba(139,92,246,0.1))' : 'transparent',
                color: isActive ? '#a78bfa' : 'rgba(255,255,255,0.55)',
                fontWeight: isActive ? 600 : 400,
              }}>
              <Icon size={16} />
              {label}
            </button>
          )
        })}
        <button onClick={onAddFiles}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] transition-all text-left nav-item"
          style={{ color: 'rgba(255,255,255,0.4)' }}>
          <Plus size={16} /> 파일 추가
        </button>
      </div>

      {/* Playlists */}
      <div className="mt-5 px-2 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>재생목록</span>
          <button style={{ color: 'rgba(255,255,255,0.3)' }}><Plus size={14} /></button>
        </div>
        {playlists.map(({ label, icon: Icon, color }) => {
          const isActive = activeNav === label
          return (
            <button key={label}
              onClick={() => setActiveNav(label)}
              className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[12px] transition-all text-left truncate nav-item ${isActive ? 'active' : ''}`}
              style={{
                background: isActive ? 'linear-gradient(90deg,rgba(139,92,246,0.3),rgba(139,92,246,0.1))' : 'transparent',
                color: isActive ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                fontWeight: isActive ? 600 : 400,
              }}>
              <Icon size={14} color={isActive ? '#a78bfa' : color} className="shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          )
        })}
      </div>

      {/* Bottom */}
      <div className="px-2 pt-3 mt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        {[{ label: '설정', Icon: Settings }, { label: '정보', Icon: Info }].map(({ label, Icon }) => (
          <button key={label}
            onClick={label === '설정' ? onOpenSettings : undefined}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] transition-all bottom-btn"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>
    </aside>
  )
}

export default Sidebar
