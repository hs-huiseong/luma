import { contextBridge, ipcRenderer } from 'electron'
import { exposeElectronAPI } from '@electron-toolkit/preload'

type DiscordPresenceInfo = {
  title: string
  artist: string
  album?: string
  cover?: string
  isPlaying: boolean
  isYouTube?: boolean
  currentTime?: number
  duration?: number
}

const api = {
  selectFiles: () => ipcRenderer.invoke('select-files'),
  getTracksByPaths: (paths: string[]) => ipcRenderer.invoke('get-tracks-by-paths', paths),
  getTranscodePort: () => ipcRenderer.invoke('get-transcode-port'),
  showItemInFolder: (path: string) => ipcRenderer.invoke('show-item-in-folder', path),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  watchFolder: (path: string) => ipcRenderer.send('watch-folder', path),
  onFolderUpdated: (callback: (tracks: any[]) => void) => {
    const listener = (_event: any, tracks: any[]) => callback(tracks)
    ipcRenderer.on('folder-updated', listener)
    return () => ipcRenderer.removeListener('folder-updated', listener)
  },
  // YouTube API
  youtubeSearch: (query: string) => ipcRenderer.invoke('youtube-search', query),
  youtubeGetStream: (videoId: string) => ipcRenderer.invoke('youtube-get-stream', videoId),
  youtubeGetPlaylist: (url: string) => ipcRenderer.invoke('youtube-get-playlist', url),
  youtubeGetSubtitles: (videoId: string) => ipcRenderer.invoke('youtube-get-subtitles', videoId),
  // Discord RPC
  discordUpdatePresence: (info: DiscordPresenceInfo) => 
    ipcRenderer.send('discord-update-presence', info),
  discordClearPresence: () => ipcRenderer.send('discord-clear-presence'),
  discordGetStatus: () => ipcRenderer.invoke('discord-get-status'),
  discordSetEnabled: (val: boolean) => ipcRenderer.invoke('discord-set-enabled', val),
}

if (process.contextIsolated) {
  try {
    exposeElectronAPI()
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
