import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { basename, dirname, extname, join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { existsSync, statSync } from 'fs'
import { execFile } from 'child_process'
import { electronApp, is } from '@electron-toolkit/utils'
import { Client } from '@xhayper/discord-rpc'
import http from 'http'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from '@ffmpeg-installer/ffmpeg'

ffmpeg.setFfmpegPath(ffmpegPath.path)

let transcodePort = 0
const metadataWarningPaths = new Set<string>()
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url!, `http://${req.headers.host}`)
    if (url.pathname === '/stream') {
      const filePath = url.searchParams.get('path')
      if (!filePath) {
        res.writeHead(400)
        res.end()
        return
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
  return
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
let rpcLoginInFlight = false
let lastRpcLoginAttempt = 0

rpc.on('ready', () => {
  rpcReady = true
  console.log('[Discord RPC] Connected')
})

rpc.on('disconnected', () => {
  rpcReady = false
})

connectDiscordRpc()

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
  app.on('browser-window-created', () => {
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

    let cover: string | undefined = undefined
    if (metadata.common.picture && metadata.common.picture.length > 0) {
      const pic = metadata.common.picture[0]
      cover = `data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}`
    }

    const url = pathToFileURL(filePath).href
    const album = cleanAlbumTitle(metadata.common.album)

    return {
      id: filePath,
      title: metadata.common.title || 'Unknown Title',
      artist: metadata.common.artist || 'Unknown Artist',
      album,
      url: url,
      cover: cover,
      addedAt: stats.birthtimeMs,
      lyrics: metadata.common.lyrics?.[0],
      duration: metadata.format.duration,
      needsTranscoding: needsTranscodingFor(filePath, metadata.format.codec),
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
    let addedAt: number | undefined
    try {
      addedAt = statSync(filePath).birthtimeMs
    } catch {}

    const [fallback, cover] = await Promise.all([
      readMetadataWithFfmpeg(filePath).catch(() => null),
      readCoverWithFfmpeg(filePath).catch(() => undefined)
    ])
    warnMetadataFallback(filePath, e, Boolean(fallback))

    return {
      id: filePath,
      title: fallback?.title || fallbackTitleFromPath(filePath),
      artist: fallback?.artist || 'Unknown Artist',
      album: cleanAlbumTitle(fallback?.album),
      url,
      cover,
      addedAt,
      duration: fallback?.duration,
      needsTranscoding: needsTranscodingFor(filePath, fallback?.codec),
      format: {
        container: fallback?.container,
        codec: fallback?.codec,
        bitrate: fallback?.bitrate,
        sampleRate: fallback?.sampleRate
      }
    }
  }
}

function fallbackTitleFromPath(filePath: string): string {
  const name = basename(filePath, extname(filePath)).trim()
  return name || 'Unknown Title'
}

function needsTranscodingFor(filePath: string, codec?: string): boolean {
  const normalizedCodec = codec?.toLowerCase() || ''
  return filePath.toLowerCase().endsWith('.mp4')
    || normalizedCodec.includes('dby')
    || normalizedCodec.includes('eac3')
    || normalizedCodec.includes('e-ac-3')
    || normalizedCodec.includes('ac-3')
    || normalizedCodec.includes('ac3')
}

function warnMetadataFallback(filePath: string, error: unknown, usedFfmpegFallback: boolean): void {
  if (metadataWarningPaths.has(filePath)) return
  metadataWarningPaths.add(filePath)
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`[Metadata] music-metadata failed; ${usedFfmpegFallback ? 'used FFmpeg fallback' : 'used filename fallback'}: ${filePath} (${message})`)
}

function readMetadataWithFfmpeg(filePath: string): Promise<{
  title?: string
  artist?: string
  album?: string
  duration?: number
  codec?: string
  bitrate?: number
  sampleRate?: number
  container?: string
}> {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath.path, ['-hide_banner', '-i', filePath], { windowsHide: true }, (_err, _stdout, stderr) => {
      if (!stderr) {
        reject(new Error('No FFmpeg metadata output'))
        return
      }

      const tags: Record<string, string> = {}
      for (const line of stderr.split(/\r?\n/)) {
        const tag = line.match(/^\s{4,}([A-Za-z0-9_ -]+)\s*:\s*(.+)$/)
        if (tag) tags[tag[1].trim().toLowerCase()] = tag[2].trim()
      }

      const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
      const audioMatch = stderr.match(/Audio:\s*([^,\s]+).*?(\d+)\s*Hz/i)
      const bitrateMatch = stderr.match(/bitrate:\s*(\d+)\s*kb\/s/i)
      const containerMatch = stderr.match(/Input #0,\s*([^,]+(?:,[^,]+)*),\s*from/i)

      resolve({
        title: tags.title,
        artist: tags.artist || tags.album_artist,
        album: tags.album,
        duration: durationMatch
          ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])
          : undefined,
        codec: audioMatch?.[1],
        bitrate: bitrateMatch ? Number(bitrateMatch[1]) * 1000 : undefined,
        sampleRate: audioMatch ? Number(audioMatch[2]) : undefined,
        container: containerMatch?.[1]?.trim()
      })
    })
  })
}

function readCoverWithFfmpeg(filePath: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegPath.path,
      ['-hide_banner', '-loglevel', 'error', '-i', filePath, '-map', '0:v:0', '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1'],
      { windowsHide: true, encoding: 'buffer', maxBuffer: 12 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          reject(err)
          return
        }
        const image = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout)
        if (image.length === 0) {
          resolve(undefined)
          return
        }
        resolve(`data:image/jpeg;base64,${image.toString('base64')}`)
      }
    )
  })
}

function cleanAlbumTitle(album?: string): string | undefined {
  const value = album?.trim()
  if (!value) return undefined

  const normalized = value.toLowerCase()
  const placeholders = new Set([
    'no album',
    'no album title',
    'no album title detected',
    'unknown album',
    'untitled album'
  ])

  return placeholders.has(normalized) ? undefined : value
}

function connectDiscordRpc(): void {
  if (!rpcEnabled || rpcReady || rpcLoginInFlight) return
  const now = Date.now()
  if (now - lastRpcLoginAttempt < 5000) return

  rpcLoginInFlight = true
  lastRpcLoginAttempt = now
  rpc.login()
    .catch((err: Error) => {
      rpcReady = false
      console.warn('[Discord RPC] Login failed (Discord not running?):', err.message)
    })
    .finally(() => {
      rpcLoginInFlight = false
    })
}

function cleanPresenceText(value: string | undefined, fallback: string): string {
  const text = value?.replace(/\s+/g, ' ').trim() || fallback
  return text.slice(0, 120)
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

ipcMain.handle('show-item-in-folder', async (_, rawPath: string) => {
  if (!rawPath || rawPath.startsWith('http')) return false

  const filePath = rawPath.startsWith('file://') ? fileURLToPath(rawPath) : rawPath
  const targetPath = existsSync(filePath) ? filePath : dirname(filePath)
  if (!existsSync(targetPath)) return false

  shell.showItemInFolder(targetPath)
  if (targetPath !== filePath) {
    const result = await shell.openPath(targetPath)
    return result === ''
  }
  return true
})

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
  if (!val && rpcReady) rpc.user?.clearActivity().catch(() => {})
  if (val) connectDiscordRpc()
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
}) => {
  if (!rpcEnabled) return
  if (!rpcReady || !rpc.user) {
    connectDiscordRpc()
    return
  }

  try {
    const title = cleanPresenceText(info.title, 'Unknown Title')
    const artist = cleanPresenceText(info.artist, 'Unknown Artist')
    const album = cleanAlbumTitle(info.album)

    // 앨범아트 처리
    let largeImageKey = (info.cover && info.cover.startsWith('https')) ? info.cover : 'logo'
    
    // 로컬 파일이고 커버가 없는 경우 온라인 검색 시도
    if (largeImageKey === 'logo') {
      const query = `${title} ${artist}`.trim()
      if (coverCache.has(query)) {
        largeImageKey = coverCache.get(query)!
      } else {
        // 백그라운드에서 검색 후 다음 업데이트 때 반영되도록 함
        searchCoverOnline(title, artist).catch(() => {})
      }
    }

    const largeImageText = album || 'Luma'
    const stateBase = album ? `${artist} · ${album}` : artist

    if (info.isPlaying) {
      const now = Date.now()
      const currentTime = Number.isFinite(info.currentTime) ? Math.max(info.currentTime || 0, 0) : 0
      const duration = Number.isFinite(info.duration) && (info.duration || 0) > 0 ? info.duration || 0 : undefined
      const startMs = now - currentTime * 1000
      const endMs = duration ? startMs + duration * 1000 : undefined

      rpc.user.setActivity({
        type: 2, // Listening
        details: title,
        state: stateBase,
        largeImageKey,
        largeImageText,
        smallImageKey: info.isYouTube ? 'youtube' : undefined,
        smallImageText: info.isYouTube ? 'YouTube 스트리밍' : undefined,
        startTimestamp: new Date(startMs),
        endTimestamp: endMs ? new Date(endMs) : undefined,
        instance: false
      })
    } else {
      // 일시정지: 타이머 없이 깔끔하게
      rpc.user.setActivity({
        type: 2, // Listening
        details: title,
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
