import React, { useState, useEffect } from 'react'
import { X, Radio, Circle, CheckCircle2, AlertCircle, RotateCcw, Trash2, AlertTriangle } from 'lucide-react'

interface SettingsModalProps {
  onClose: () => void
}

const SETTINGS_KEY = 'luma-settings'

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
  } catch { return {} }
}

function saveSettings(settings: Record<string, unknown>) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function useSettings() {
  const [settings, setSettings] = useState(loadSettings)
  const update = (key: string, value: unknown) => {
    setSettings((prev: Record<string, unknown>) => {
      const next = { ...prev, [key]: value }
      saveSettings(next)
      return next
    })
  }
  return { settings, update }
}

const SectionLabel: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.3)', marginBottom: 12
  }}>
    {icon}{label}
  </div>
)

const Toggle: React.FC<{ enabled: boolean; onToggle: () => void }> = ({ enabled, onToggle }) => (
  <button
    onClick={onToggle}
    style={{
      width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
      background: enabled ? 'linear-gradient(90deg,#7c3aed,#a855f7)' : 'rgba(255,255,255,0.12)',
      position: 'relative', transition: 'background 0.25s', flexShrink: 0,
    }}>
    <div style={{
      position: 'absolute', top: 3, left: enabled ? 25 : 3,
      width: 20, height: 20, borderRadius: '50%', background: '#fff',
      transition: 'left 0.25s', boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
    }} />
  </button>
)

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const { settings, update } = useSettings()
  const [rpcEnabled, setRpcEnabled] = useState<boolean>(settings.discordRpc ?? true)
  const [rpcStatus, setRpcStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking')
  const [resetConfirm, setResetConfirm] = useState<null | 'recent' | 'all'>(null)
  const [resetDone, setResetDone] = useState(false)

  useEffect(() => {
    const check = async () => {
      try {
        const result = await (window as any).api.discordGetStatus?.()
        setRpcStatus(result ? 'connected' : 'disconnected')
      } catch { setRpcStatus('disconnected') }
    }
    check()
    const interval = setInterval(check, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleRpcToggle = (val: boolean) => {
    setRpcEnabled(val)
    update('discordRpc', val)
    ;(window as any).api.discordSetEnabled?.(val)
  }

  const handleReset = (type: 'recent' | 'all') => {
    if (type === 'recent') {
      try {
        const saved = JSON.parse(localStorage.getItem('luma-music-state') || '{}')
        saved.recentPaths = []
        localStorage.setItem('luma-music-state', JSON.stringify(saved))
      } catch {}
    } else {
      localStorage.removeItem('luma-music-state')
      localStorage.removeItem('luma-music-stats')
      localStorage.removeItem('sanseong-music-state')
      localStorage.removeItem('sanseong-music-stats')
    }
    setResetConfirm(null)
    setResetDone(true)
    setTimeout(() => { window.location.reload() }, 800)
  }

  const StatusIcon = rpcStatus === 'connected' ? CheckCircle2 : rpcStatus === 'checking' ? Circle : AlertCircle
  const statusColor = rpcStatus === 'connected' ? '#4ade80' : rpcStatus === 'checking' ? '#facc15' : '#f87171'
  const statusText = rpcStatus === 'connected' ? 'Discord 연결됨' : rpcStatus === 'checking' ? '확인 중...' : 'Discord 연결 안됨'

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => resetConfirm ? setResetConfirm(null) : onClose()}
        style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
      />

      {/* Confirm Dialog */}
      {resetConfirm && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          zIndex: 1100, width: 360, borderRadius: 16,
          background: 'rgba(20,10,30,0.99)',
          border: '1px solid rgba(239,68,68,0.3)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.8)',
          padding: '28px', color: '#fff', textAlign: 'center',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <AlertTriangle size={36} color="#f87171" />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
            {resetConfirm === 'recent' ? '최근 재생 기록 삭제' : '앱 전체 초기화'}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 24, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
            {resetConfirm === 'recent'
              ? '최근 재생 기록이 모두 삭제됩니다.\n계속하시겠습니까?'
              : '재생목록, 즐겨찾기, 최근 기록, 통계가\n모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.'}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setResetConfirm(null)}
              style={{
                flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}>취소</button>
            <button
              onClick={() => handleReset(resetConfirm)}
              style={{
                flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(90deg,#dc2626,#ef4444)',
                color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700,
              }}>{resetConfirm === 'recent' ? '삭제' : '초기화'}</button>
          </div>
        </div>
      )}

      {/* Main Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        zIndex: 1000, width: 480, borderRadius: 20,
        background: 'rgba(18,18,28,0.97)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
        padding: '28px 32px', color: '#fff',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px' }}>설정</span>
          <button onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center' }}>
            <X size={16} />
          </button>
        </div>

        {/* Section: Discord RPC */}
        <div style={{ marginBottom: 24 }}>
          <SectionLabel icon={<Radio size={12} />} label="Discord 연동" />

          <div style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 14, padding: '16px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Discord Rich Presence</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
                지금 재생 중인 곡을 Discord에 표시합니다
              </div>
            </div>
            <Toggle enabled={rpcEnabled} onToggle={() => handleRpcToggle(!rpcEnabled)} />
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', borderRadius: 10,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
          }}>
            <StatusIcon size={14} color={statusColor} />
            <span style={{ fontSize: 12, color: statusColor }}>{statusText}</span>
            {rpcStatus !== 'connected' && (
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginLeft: 'auto' }}>
                Discord를 실행하면 자동 연결됩니다
              </span>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 24 }} />

        {/* Section: Data Management */}
        <div>
          <SectionLabel icon={<RotateCcw size={12} />} label="데이터 관리" />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* 최근 재생 기록 삭제 */}
            <div style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 14, padding: '14px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>최근 재생 기록 삭제</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>홈 화면의 최근 재생 기록을 지웁니다</div>
              </div>
              <button
                onClick={() => setResetConfirm('recent')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 8, border: 'none',
                  background: 'rgba(239,68,68,0.15)', color: '#f87171',
                  cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0,
                }}>
                <Trash2 size={13} /> 삭제
              </button>
            </div>

            {/* 앱 전체 초기화 */}
            <div style={{
              background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)',
              borderRadius: 14, padding: '14px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3, color: '#f87171' }}>앱 전체 초기화</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>재생목록, 즐겨찾기, 기록, 통계 모두 삭제</div>
              </div>
              <button
                onClick={() => setResetConfirm('all')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 8, border: 'none',
                  background: 'rgba(239,68,68,0.25)', color: '#f87171',
                  cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0,
                }}>
                <RotateCcw size={13} /> 초기화
              </button>
            </div>
          </div>

          {resetDone && (
            <div style={{
              marginTop: 10, padding: '10px 14px', borderRadius: 10,
              background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)',
              fontSize: 12, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 6
            }}>
              <CheckCircle2 size={14} /> 완료! 앱을 재시작합니다...
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default SettingsModal
