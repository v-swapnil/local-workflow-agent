import { contextBridge } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import { exposeElectronTRPC } from 'electron-trpc/main';

// Expose TRPC bridge eagerly so renderer imports can use it immediately.
exposeElectronTRPC();

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
  } catch (err) {
    console.error(err);
  }
}
