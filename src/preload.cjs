const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wallpaperAPI', {
  saveVideo: (bytes, filename) => ipcRenderer.invoke('save-video', bytes, filename),
  saveBackground: (bytes, filename) => ipcRenderer.invoke('save-background', bytes, filename),
  writeCompatibilityReport: (report) => ipcRenderer.invoke('write-compatibility-report', report),
  listWallpapers: () => ipcRenderer.invoke('list-wallpapers'),
  setWallpaper: (filePath) => ipcRenderer.invoke('set-wallpaper', filePath),
  startNativeWallpaper: (settings) => ipcRenderer.invoke('start-native-wallpaper', settings),
  stopNativeWallpaper: () => ipcRenderer.invoke('stop-native-wallpaper'),
  minimizeToTray: () => ipcRenderer.invoke('minimize-to-tray'),
  setAutoStart: (enabled) => ipcRenderer.invoke('set-auto-start', enabled),
  setWindowAspectRatio: (width, height) => ipcRenderer.invoke('set-window-aspect-ratio', width, height),
  finishBatch: () => ipcRenderer.invoke('finish-batch')
});

contextBridge.exposeInMainWorld('nativeWallpaperAPI', {
  onRenderSync: (callback) => ipcRenderer.on('native-render-sync', callback),
  onDesktopEnter: (callback) => ipcRenderer.on('native-desktop-enter', callback),
  onDesktopLeave: (callback) => ipcRenderer.on('native-desktop-leave', callback),
  onPointerPosition: (callback) => ipcRenderer.on('native-pointer-position', (_event, point) => callback(point)),
  onModelClick: (callback) => ipcRenderer.on('native-model-click', callback),
  onInteractionError: (callback) => ipcRenderer.on('native-interaction-error', (_event, message) => callback(message)),
  setInteractionRegion: (bounds) => ipcRenderer.send('native-interaction-region', bounds)
});

contextBridge.exposeInMainWorld('nativeInputAPI', {
  modelClick: () => ipcRenderer.send('native-model-click'),
  desktopContextMenu: () => ipcRenderer.send('native-desktop-context-menu')
});
