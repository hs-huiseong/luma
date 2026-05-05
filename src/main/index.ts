import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { statSync, readdirSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { Client } from '@xhayper/discord-rpc'
import http from 'http'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from '@ffmpeg-installer/ffmpeg'

ffmpeg.setFfmpegPath(ffmpegPath.path)

let transcodePort = 0
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url!, `http://${req.headers.host}`)
    if (url.pathname === '/stream') {
      const filePath = url.searchParams.get('path')
      if (!filePath) {
        res.writeHead(400)
        return res.end()
      }

      res.writeHead(200, {
        'Content-Type': 'audio/wav',
        'Connection': 'keep-alive',
        'Accept-Ranges': 'none',
        'Access-Control-Allow-Origin': '*'
      })

      const command = ffmpeg(filePath)
        .format('wav')
        .audioCodec('pcm_s16le')
        .audioChannels(2)
        .audioFrequency(44100)
        .on('error', (err) => {
          if (err.message && err.message.includes('SIGKILL')) return
          console.error('[FFmpeg Error]', err.message)
          if (!res.headersSent) res.writeHead(500)
          res.end()
        })

      command.pipe(res, { end: true })

      req.on('close', () => {
        console.log(`[Transcode Server] Client disconnected from ${url.searchParams.get('path')}`)
        command.kill('SIGKILL')
      })
    } else {
      res.writeHead(404).end()
    }
  } catch (e) {
    res.writeHead(500).end()
  }
})

server.listen(0, '127.0.0.1', () => {
  transcodePort = (server.address() as import('net').AddressInfo).port
  console.log('[Transcode Server] Running on port', transcodePort)
})

// Discord RPC
const DISCORD_CLIENT_ID = '1498628582795116544'
const rpc = new Client({ clientId: DISCORD_CLIENT_ID })
let rpcReady = false
let rpcEnabled = true

rpc.on('ready', () => {
  rpcReady = true
  console.log('[Discord RPC] Connected')
})

rpc.login().catch((err: Error) => {
  console.warn('[Discord RPC] Login failed (Discord not running?):', err.message)
})

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: 'Luma',
    width: 1100,
    height: 750,
    minWidth: 1000,
    minHeight: 650,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#030303',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false,
      backgroundThrottling: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Disable DevTools shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      event.preventDefault()
    }
    if (input.key.toLowerCase() === 'i' && input.shift && (input.control || input.meta)) {
      event.preventDefault()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.ph1water.musicplayer')
  app.on('browser-window-created', (_, window) => {
    // optimizer.watchWindowShortcuts(window)
  })
  createWindow()
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (rpcReady) rpc.destroy().catch(() => { })
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

async function parseTrack(filePath: string) {
  const { parseFile } = await import('music-metadata')
  try {
    const stats = statSync(filePath)
    const metadata = await parseFile(filePath)

    let cover = undefined
    if (metadata.common.picture && metadata.common.picture.length > 0) {
      const pic = metadata.common.picture[0]
      cover = `data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}`
    }

    const url = pathToFileURL(filePath).href

    return {
      id: filePath,
      title: metadata.common.title || 'Unknown Title',
      artist: metadata.common.artist || 'Unknown Artist',
      album: metadata.common.album,
      url: url,
      cover: cover,
      addedAt: stats.birthtimeMs,
      lyrics: metadata.common.lyrics?.[0],
      duration: metadata.format.duration,
      needsTranscoding: metadata.format.codec?.toLowerCase().includes('dby') || metadata.format.codec?.toLowerCase().includes('ac-3') || filePath.toLowerCase().endsWith('.mp4'),
      format: {
        container: metadata.format.container,
        codec: metadata.format.codec,
        bitrate: metadata.format.bitrate,
        sampleRate: metadata.format.sampleRate,
        lossless: metadata.format.lossless
      }
    }
  } catch (e) {
    const url = pathToFileURL(filePath).href
    return { id: filePath, title: 'Error loading', artist: '', url: url, format: {} }
  }
}

// IPC Handlers
ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'flac', 'm4a', 'alac', 'wav'] }
    ]
  })
  if (result.canceled) return []
  const tracks = await Promise.all(result.filePaths.map(parseTrack))
  return tracks
})

ipcMain.handle('get-tracks-by-paths', async (_, filePaths: string[]) => {
  if (!filePaths || !Array.isArray(filePaths)) return []
  const tracks = await Promise.all(filePaths.map(parseTrack))
  return tracks
})

ipcMain.handle('get-transcode-port', () => transcodePort)

// Cover Art Cache (Title + Artist -> Image URL)
const coverCache = new Map<string, string>()

async function searchCoverOnline(title: string, artist: string): Promise<string | null> {
  const query = `${title} ${artist}`.trim()
  if (!query || coverCache.has(query)) return coverCache.get(query) || null

  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=1`
    const response = await fetch(url)
    const data = await response.json() as any
    if (data.results && data.results.length > 0) {
      // 600x600 고화질 이미지 사용
      const artwork = data.results[0].artworkUrl100.replace('100x100bb.jpg', '600x600bb.jpg')
      coverCache.set(query, artwork)
      return artwork
    }
  } catch (err) {
    console.error('[CoverSearch] Failed to fetch cover:', err)
  }
  return null
}

// Discord RPC Handler
ipcMain.handle('discord-get-status', () => rpcReady && rpcEnabled)
ipcMain.handle('discord-set-enabled', (_, val: boolean) => {
  rpcEnabled = val
  if (!val && rpcReady) rpc.clearActivity().catch(() => {})
})

ipcMain.on('discord-update-presence', (_, info: {
  title: string
  artist: string
  album?: string
  cover?: string        // 공개 HTTPS URL인 경우에만 (YouTube 썸네일)
  isPlaying: boolean
  isYouTube?: boolean
  currentTime?: number
  duration?: number
  format?: { container?: string; lossless?: boolean; sampleRate?: number; bitrate?: number }
}) => {
  if (!rpcReady || !rpc.user || !rpcEnabled) return
  try {
    // 음질 정보 문자열 구성
    let qualityText = '로컬 파일'
    if (info.format) {
      const parts: string[] = []
      if (info.format.container) parts.push(info.format.container.toUpperCase())
      if (info.format.sampleRate) parts.push(`${(info.format.sampleRate / 1000).toFixed(1)}kHz`)
      if (info.format.bitrate && !info.format.lossless) parts.push(`${Math.round(info.format.bitrate / 1000)}kbps`)
      if (parts.length > 0) qualityText = parts.join(' · ')
    }

    // 앨범아트 처리
    let largeImageKey = (info.cover && info.cover.startsWith('https')) ? info.cover : 'logo'
    
    // 로컬 파일이고 커버가 없는 경우 온라인 검색 시도
    if (largeImageKey === 'logo') {
      const query = `${info.title} ${info.artist}`.trim()
      if (coverCache.has(query)) {
        largeImageKey = coverCache.get(query)!
      } else {
        // 백그라운드에서 검색 후 다음 업데이트 때 반영되도록 함
        searchCoverOnline(info.title, info.artist).catch(() => {})
      }
    }

    const largeImageText = info.album || 'Luma'

    // 재생 state 줄: 아티스트 이름만 표시
    const stateBase = info.artist

    if (info.isPlaying) {
      const now = Date.now()
      const elapsed = (info.currentTime || 0) * 1000
      const startTimestamp = now - elapsed
      const endTimestamp = info.duration ? startTimestamp + info.duration * 1000 : undefined

      rpc.user.setActivity({
        type: 2, // Listening
        details: info.title,
        state: stateBase,
        largeImageKey,
        largeImageText,
        smallImageKey: info.isYouTube ? 'youtube' : undefined,
        smallImageText: info.isYouTube ? 'YouTube 스트리밍' : undefined,
        startTimestamp,
        endTimestamp,
        instance: false
      })
    } else {
      // 일시정지: 타이머 없이 깔끔하게
      rpc.user.setActivity({
        type: 2, // Listening
        details: info.title,
        state: `⏸ ${stateBase}`,
        largeImageKey,
        largeImageText,
        instance: false
      })
    }
  } catch (err) {
    console.warn('[Discord RPC] setActivity failed:', err)
  }
})

ipcMain.on('discord-clear-presence', () => {
  if (!rpcReady || !rpc.user) return
  rpc.user.clearActivity().catch(() => { })
})

