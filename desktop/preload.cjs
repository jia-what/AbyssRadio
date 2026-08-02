/**
 * Abyss Radio — preload bridge.
 * Exposes a minimal, safe API to the renderer for native features
 * (KuGou web login window, app info).
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('abyss', {
  // Opens the KuGou web login window; resolves when cookies are captured or window closes.
  kugouLogin: () => ipcRenderer.invoke('kugou:login'),
  // Clears the KuGou login session partition (logout).
  kugouClearSession: () => ipcRenderer.invoke('kugou:clear-session'),
  appInfo: () => ipcRenderer.invoke('app:info'),
});
