const { app, BrowserWindow, ipcMain, protocol, net, screen, Menu, Tray, nativeImage, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { execFile, spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([{ scheme: 'wallpaper', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

let desktopWindow;
let nativeWindow;
let nativeInputWindow;
let nativeInputPromise;
let nativeInteractionBounds;
let focusWatcher;
let pointerWatcher;
let mainWindow;
let tray;
let isQuitting = false;
let lastDesktopContextMenuAt = 0;
let mainWindowAspectRatio = 16 / 9;
let adjustingMainWindow = false;
const hasSingleInstanceLock = app.requestSingleInstanceLock();
const RESOURCE_LIBRARY_NAME = 'V7.Wallpaper.Studio.Resources.asar';
const packagedIconPath = (name) => path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, '../build'), name);
const appIconPath = packagedIconPath('v7-wallpaper-studio.ico');
const trayIconPath = packagedIconPath('v7-wallpaper-studio-tray.png');

function resourceRoot() {
  if (!app.isPackaged) return path.join(__dirname, '../public');
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  const candidates = [
    portableDir && path.join(portableDir, RESOURCE_LIBRARY_NAME),
    path.join(path.dirname(process.execPath), RESOURCE_LIBRARY_NAME),
    path.join(path.dirname(process.execPath), '..', RESOURCE_LIBRARY_NAME),
    path.join(process.resourcesPath, RESOURCE_LIBRARY_NAME),
    path.join(process.resourcesPath, 'models')
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function resourcePath(...parts) {
  return path.join(resourceRoot(), ...parts);
}

function executablePowerShellScript(name) {
  const source = resourcePath(name);
  if (!app.isPackaged || !source.includes('.asar')) return source;
  const directory = path.join(app.getPath('userData'), 'native-scripts');
  const target = path.join(directory, name);
  fs.mkdirSync(directory, { recursive: true });
  const contents = fs.readFileSync(source);
  if (!fs.existsSync(target) || !contents.equals(fs.readFileSync(target))) fs.writeFileSync(target, contents);
  return target;
}

function hasResourceLibrary() {
  return !app.isPackaged || fs.existsSync(resourcePath('models', 'manifest.json'));
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.show();
  mainWindow.restore();
  mainWindow.moveTop();
  mainWindow.focus();
  mainWindow.flashFrame(true);
}

function createTray() {
  if (tray) return;
  const trayIcon = nativeImage.createFromPath(trayIconPath);
  tray = new Tray(trayIcon);
  tray.setToolTip('V7 Wallpaper Studio');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示主窗口', click: showMainWindow },
    { type: 'separator' },
    { label: '退出程序', click: () => { isQuitting = true; app.quit(); } }
  ]));
  tray.on('double-click', showMainWindow);
}

function openDesktopContextMenu() {
  const now = Date.now();
  if (now - lastDesktopContextMenuAt < 180) return;
  lastDesktopContextMenuAt = now;
  const script = executablePowerShellScript('open-desktop-context-menu.ps1');
  execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true }, () => {});
}

function resizeMainWindowToAspect(bounds, preferWidth = true) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized() || adjustingMainWindow) return;
  const current = mainWindow.getBounds();
  const content = mainWindow.getContentBounds();
  const frameWidth = Math.max(0, current.width - content.width);
  const frameHeight = Math.max(0, current.height - content.height);
  const contentWidth = Math.max(1, (preferWidth ? bounds.width : Math.round((bounds.height - frameHeight) * mainWindowAspectRatio)) - frameWidth);
  const contentHeight = Math.max(1, Math.round(preferWidth ? contentWidth / mainWindowAspectRatio : bounds.height - frameHeight));
  const next = { ...bounds, width: contentWidth + frameWidth, height: contentHeight + frameHeight };
  if (next.width === bounds.width && next.height === bounds.height) return;
  adjustingMainWindow = true;
  mainWindow.setBounds(next, false);
  adjustingMainWindow = false;
}

function stopFocusWatcher() {
  if (focusWatcher && !focusWatcher.killed) focusWatcher.kill();
  focusWatcher = null;
}

function stopNativeWallpaper() {
  stopFocusWatcher();
  if (pointerWatcher) clearInterval(pointerWatcher);
  pointerWatcher = null;
  if (nativeInputWindow && !nativeInputWindow.isDestroyed()) nativeInputWindow.close();
  nativeInputWindow = null;
  nativeInputPromise = null;
  nativeInteractionBounds = null;
  if (nativeWindow && !nativeWindow.isDestroyed()) nativeWindow.close();
  nativeWindow = null;
  if (desktopWindow && !desktopWindow.isDestroyed()) desktopWindow.close();
  desktopWindow = null;
}

function startPointerWatcher() {
  if (pointerWatcher) clearInterval(pointerWatcher);
  pointerWatcher = setInterval(() => {
    if (!nativeWindow || nativeWindow.isDestroyed()) return;
    const point = screen.getCursorScreenPoint();
    const bounds = screen.getPrimaryDisplay().bounds;
    nativeWindow.webContents.send('native-pointer-position', { x: point.x - bounds.x, y: point.y - bounds.y });
  }, 33);
}

function startFocusWatcher() {
  stopFocusWatcher();
  const script = executablePowerShellScript('watch-desktop-focus.ps1');
  focusWatcher = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  let buffer = '';
  focusWatcher.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const state of lines) {
      if (state.trim() === 'desktop' && nativeWindow && !nativeWindow.isDestroyed()) nativeWindow.webContents.send('native-desktop-enter');
      if (state.trim() === 'other' && nativeWindow && !nativeWindow.isDestroyed()) nativeWindow.webContents.send('native-desktop-leave');
    }
  });
  focusWatcher.on('exit', () => { focusWatcher = null; });
}

function attachWindowToDesktop(hwnd, options) {
  const script = executablePowerShellScript('set-desktop-parent.ps1');
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, String(hwnd)];
  if (options?.interactive) args.push('-Interactive', '-X', String(options.bounds.x), '-Y', String(options.bounds.y), '-Width', String(options.bounds.width), '-Height', String(options.bounds.height));
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message));
      else resolve(stdout.trim());
    });
  });
}

async function updateNativeInteractionRegion(bounds) {
  if (!nativeWindow || nativeWindow.isDestroyed() || !bounds) return;
  const next = {
    x: Math.max(0, Math.floor(bounds.x)),
    y: Math.max(0, Math.floor(bounds.y)),
    width: Math.max(1, Math.ceil(bounds.width)),
    height: Math.max(1, Math.ceil(bounds.height)),
  };
  if (nativeInputWindow && !nativeInputWindow.isDestroyed()) {
    if (JSON.stringify(next) === JSON.stringify(nativeInteractionBounds)) return;
    nativeInteractionBounds = next;
    nativeInputWindow.setBounds(next, false);
    await attachWindowToDesktop(nativeInputWindow.getNativeWindowHandle().readBigUInt64LE(0).toString(), { interactive: true, bounds: next });
    return;
  }
  if (nativeInputPromise) return nativeInputPromise;
  nativeInteractionBounds = next;
  nativeInputWindow = new BrowserWindow({ ...next, show: false, frame: false, transparent: true, resizable: false, focusable: true, skipTaskbar: true, hasShadow: false, webPreferences: { contextIsolation: true, backgroundThrottling: false, preload: path.join(__dirname, 'preload.cjs') } });
  nativeInputWindow.setMenuBarVisibility(false);
  nativeInputWindow.setIgnoreMouseEvents(false);
  nativeInputWindow.webContents.on('context-menu', (event) => {
    event.preventDefault();
    openDesktopContextMenu();
  });
  nativeInputPromise = (async () => {
    await nativeInputWindow.loadURL('wallpaper://app/native-input.html');
    const hwnd = nativeInputWindow.getNativeWindowHandle().readBigUInt64LE(0).toString();
    await attachWindowToDesktop(hwnd, { interactive: true, bounds: next });
    nativeInputWindow.showInactive();
    nativeInputWindow.setIgnoreMouseEvents(false);
  })();
  try {
    await nativeInputPromise;
  } finally {
    nativeInputPromise = null;
  }
}

function spawnDesktopVideo(videoPath) {
  stopNativeWallpaper();
  if (desktopWindow && !desktopWindow.isDestroyed()) desktopWindow.close();
  desktopWindow = new BrowserWindow({ show: false, frame: false, transparent: false, skipTaskbar: true, webPreferences: { contextIsolation: true } });
  desktopWindow.loadFile(path.join(__dirname, '../dist/app/desktop.html'), { query: { video: pathToFileURL(videoPath).href } });
  desktopWindow.once('ready-to-show', () => {
    desktopWindow.setFullScreen(true);
    desktopWindow.setAlwaysOnBottom(true);
    desktopWindow.showInactive();
    const hwnd = desktopWindow.getNativeWindowHandle().readBigUInt64LE(0).toString();
    const script = executablePowerShellScript('set-desktop-parent.ps1');
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, String(hwnd)], () => {});
  });
}

async function spawnNativeWallpaper(settings) {
  if (desktopWindow && !desktopWindow.isDestroyed()) desktopWindow.close();
  stopNativeWallpaper();
  const display = screen.getPrimaryDisplay();
  const displayBounds = display.bounds;
  settings.minimumRenderResolution = Math.max(Number(settings.minimumRenderResolution) || 1, Number(display.scaleFactor) || 1);
  nativeWindow = new BrowserWindow({
    x: displayBounds.x,
    y: displayBounds.y,
    width: displayBounds.width,
    height: displayBounds.height,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: { contextIsolation: true, backgroundThrottling: false, preload: path.join(__dirname, 'preload.cjs') }
  });
  const query = encodeURIComponent(JSON.stringify(settings));
  nativeWindow.on('closed', () => { stopFocusWatcher(); nativeWindow = null; });
  const readyToShow = new Promise((resolve, reject) => {
    nativeWindow.once('ready-to-show', resolve);
    nativeWindow.webContents.once('did-fail-load', (_event, code, description) => reject(new Error(`原生壁纸页面加载失败 (${code}): ${description}`)));
  });
  try {
    await nativeWindow.loadURL(`wallpaper://app/native.html?config=${query}`);
    await readyToShow;
    // Keep Chromium's content viewport in sync before WorkerW reparents the window.
    nativeWindow.setBounds(displayBounds, false);
    const hwnd = nativeWindow.getNativeWindowHandle().readBigUInt64LE(0).toString();
    const result = await attachWindowToDesktop(hwnd);
    nativeWindow.webContents.send('native-render-sync');
    nativeWindow.showInactive();
    startFocusWatcher();
    startPointerWatcher();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
    return result;
  } catch (error) {
    stopNativeWallpaper();
    throw error;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({ show: !process.env.V7_BATCH_EXPORT && !process.env.V7_COMPAT_CHECK, width: 1440, height: 810, minWidth: 980, minHeight: 551, backgroundColor: '#111111', icon: appIconPath, webPreferences: { contextIsolation: true, backgroundThrottling: false, preload: path.join(__dirname, 'preload.cjs') } });
  mainWindowAspectRatio = 16 / 9;
  mainWindow.setAspectRatio(mainWindowAspectRatio);
  mainWindow.on('close', (event) => {
    if (!isQuitting && !process.env.V7_BATCH_EXPORT && !process.env.V7_COMPAT_CHECK) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('will-resize', (event, newBounds, details) => {
    if (mainWindowAspectRatio <= 0 || mainWindow.isMaximized() || adjustingMainWindow) return;
    event.preventDefault();
    const edge = details?.edge || '';
    resizeMainWindowToAspect(newBounds, /left|right/.test(edge) || !edge);
  });
  if (process.env.VITE_DEV_SERVER_URL) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  else {
    const query = process.env.V7_BATCH_EXPORT ? `?batch=1${process.env.V7_BATCH_LIMIT ? `&limit=${process.env.V7_BATCH_LIMIT}` : ''}` : process.env.V7_COMPAT_CHECK ? '?compat=1' : '';
    mainWindow.loadURL(`wallpaper://app/index.html${query}`);
  }
  mainWindow.on('closed', () => { mainWindow = null; });
}

function registerAppProtocol() {
  protocol.handle('wallpaper', (request) => {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
  const base = app.isPackaged ? path.join(app.getAppPath(), 'dist', 'app') : path.join(__dirname, '../dist/app');
    const assetRoot = resourcePath('wallpapers');
    const modelRoot = resourcePath('models');
    const backgroundRoot = path.join(app.getPath('userData'), 'backgrounds');
    const relative = pathname.slice(pathname.indexOf('/', 1) + 1);
    const root = pathname.startsWith('/wallpapers/') ? assetRoot : pathname.startsWith('/models/') ? modelRoot : pathname.startsWith('/backgrounds/') ? backgroundRoot : base;
    const child = pathname.startsWith('/wallpapers/') || pathname.startsWith('/models/') || pathname.startsWith('/backgrounds/') ? relative : pathname === '/' ? 'index.html' : pathname.slice(1);
    const filePath = path.resolve(root, child);
    if (!filePath.startsWith(`${path.resolve(root)}${path.sep}`)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(filePath).href);
  });
}

ipcMain.handle('save-video', async (event, bytes, filename) => {
  const directory = app.isPackaged ? path.join(app.getPath('userData'), 'wallpapers') : path.join(__dirname, '../exports');
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, path.basename(filename));
  fs.writeFileSync(filePath, Buffer.from(bytes));
  return { path: filePath, url: pathToFileURL(filePath).href };
});
ipcMain.handle('save-background', async (event, bytes, filename) => {
  const directory = path.join(app.getPath('userData'), 'backgrounds');
  fs.mkdirSync(directory, { recursive: true });
  const extension = path.extname(path.basename(filename)).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.png';
  const safeName = `background-${Date.now()}${extension}`;
  const filePath = path.join(directory, safeName);
  fs.writeFileSync(filePath, Buffer.from(bytes));
  return { path: filePath, url: `wallpaper://app/backgrounds/${encodeURIComponent(safeName)}` };
});
ipcMain.handle('write-compatibility-report', async (event, report) => {
  const directory = app.isPackaged ? app.getPath('userData') : path.join(__dirname, '../exports');
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, 'core-compatibility-report.json');
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8');
  return { path: filePath };
});
ipcMain.handle('finish-batch', () => { setTimeout(() => app.quit(), 1500); return true; });
ipcMain.handle('list-wallpapers', () => {
  const directory = app.isPackaged ? path.join(app.getPath('userData'), 'wallpapers') : path.join(__dirname, '../exports');
  const saved = fs.existsSync(directory) ? fs.readdirSync(directory).filter((name) => name.endsWith('.webm')).map((name) => {
    const filePath = path.join(directory, name);
    return { name, path: filePath, url: pathToFileURL(filePath).href };
  }) : [];
  const packagedRoot = resourcePath('wallpapers');
  const bundled = fs.existsSync(packagedRoot) ? fs.readdirSync(packagedRoot).filter((name) => name.endsWith('.webm')).map((name) => ({ name, path: path.join(packagedRoot, name), url: `wallpaper://app/wallpapers/${encodeURIComponent(name)}` })) : [];
  return [...bundled, ...saved.filter((item) => !bundled.some((entry) => entry.name === item.name))];
});
ipcMain.handle('set-wallpaper', async (event, filePath) => { spawnDesktopVideo(filePath); return true; });
ipcMain.handle('start-native-wallpaper', async (event, settings) => spawnNativeWallpaper(settings));
ipcMain.handle('stop-native-wallpaper', () => { stopNativeWallpaper(); return true; });
ipcMain.handle('minimize-to-tray', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
  return true;
});
ipcMain.handle('set-auto-start', (_event, enabled) => {
  const openAtLogin = Boolean(enabled);
  app.setLoginItemSettings({
    openAtLogin,
    path: process.execPath,
    args: process.defaultApp ? [app.getAppPath()] : []
  });
  return app.getLoginItemSettings();
});
ipcMain.on('native-interaction-region', (event, bounds) => {
  if (event.sender === nativeWindow?.webContents) updateNativeInteractionRegion(bounds).catch((error) => nativeWindow?.webContents.send('native-interaction-error', error.message));
});
ipcMain.on('native-model-click', (event) => {
  if (event.sender === nativeInputWindow?.webContents && nativeWindow && !nativeWindow.isDestroyed()) nativeWindow.webContents.send('native-model-click');
});
ipcMain.on('native-desktop-context-menu', (event) => {
  if (event.sender !== nativeInputWindow?.webContents || !nativeInputWindow || nativeInputWindow.isDestroyed()) return;
  openDesktopContextMenu();
});
ipcMain.handle('set-window-aspect-ratio', (event, width, height) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const ratioWidth = Number(width);
  const ratioHeight = Number(height);
  if (!Number.isFinite(ratioWidth) || !Number.isFinite(ratioHeight) || ratioWidth <= 0 || ratioHeight <= 0) throw new Error('无效的窗口比例');
  const ratio = ratioWidth / ratioHeight;
  if (ratio < 0.25 || ratio > 4) throw new Error('窗口比例需在 1:4 到 4:1 之间');
  mainWindowAspectRatio = ratio;
  mainWindow.setAspectRatio(ratio);
  resizeMainWindowToAspect(mainWindow.getBounds());
  return true;
});

if (hasSingleInstanceLock) {
  app.on('second-instance', () => showMainWindow());
  app.whenReady().then(() => {
    if (!hasResourceLibrary()) {
      dialog.showErrorBox('资源库缺失', `请将“${RESOURCE_LIBRARY_NAME}”放在程序 exe 同一目录后重新启动。`);
      app.quit();
      return;
    }
    registerAppProtocol();
    createTray();
    createWindow();
    app.on('activate', showMainWindow);
  });
} else {
  app.quit();
}
app.on('before-quit', () => {
  isQuitting = true;
  stopNativeWallpaper();
});
app.on('will-quit', () => {
  isQuitting = true;
  stopNativeWallpaper();
  if (tray && !tray.isDestroyed()) tray.destroy();
  tray = null;
});
app.on('window-all-closed', () => {});
