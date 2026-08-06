import { contextBridge, ipcRenderer } from 'electron'
import type { IpcApi, IpcEventChannel, IpcEvents } from '@shared/ipc'

export interface DeckApi {
  invoke: <K extends keyof IpcApi>(
    channel: K,
    ...args: Parameters<IpcApi[K]>
  ) => Promise<ReturnType<IpcApi[K]>>
  on: <K extends IpcEventChannel>(
    channel: K,
    callback: (payload: IpcEvents[K]) => void
  ) => () => void
}

const api: DeckApi = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, callback) => {
    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
      callback(args[0] as Parameters<typeof callback>[0])
    }
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
