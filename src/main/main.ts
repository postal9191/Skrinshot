import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, nativeImage, clipboard, session, desktopCapturer, shell } from 'electron';
import path from 'path';
import Store from 'electron-store';
import screenshot from 'screenshot-desktop';
import fs from 'fs';

// ─── Файловый логгер ───────────────────────────────────────────────────────
let logStream: fs.WriteStream | null = null;

function initLogFile() {
  try {
    const exeDir = path.dirname(app.getPath('exe'));
    const logDir = path.join(exeDir, 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(logDir, `app-${date}.log`);
    logStream = fs.createWriteStream(logFile, { flags: 'a' });
    logStream.write(`\n${'='.repeat(60)}\n APP START  ${new Date().toISOString()}\n${'='.repeat(60)}\n`);
    logStream.write(` exe: ${app.getPath('exe')}\n logDir: ${logDir}\n\n`);
  } catch (e) {
    console.error('Failed to init log file:', e);
  }
}

const log = (module: string, message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  const dataStr = data !== undefined ? ` | ${JSON.stringify(data)}` : '';
  const line = `[${timestamp}] [${module}] ${message}${dataStr}`;
  console.log(line);
  if (logStream) logStream.write(line + '\n');
};

// Инициализация хранилища
const store = new Store();

// Vite dev server URL
const VITE_DEV_SERVER_URL = 'http://localhost:3000';

// Флаг режима разработки: в dev-приложение не запаковано
const isDev = !app.isPackaged;

// Определение пути к ресурсам
const getIndexHtmlPath = () => {
  if (isDev) {
    return path.join(__dirname, '../renderer/index.html');
  }
  return path.join(process.resourcesPath, 'app', 'dist', 'renderer', 'index.html');
};

const getCaptureHtmlPath = () => {
  if (isDev) {
    return path.join(__dirname, '../renderer/capture.html');
  }
  return path.join(process.resourcesPath, 'app', 'dist', 'renderer', 'capture.html');
};

const getEditorHtmlPath = () => {
  if (isDev) {
    return path.join(__dirname, '../renderer/editor.html');
  }
  return path.join(process.resourcesPath, 'app', 'dist', 'renderer', 'editor.html');
};

const getRecordingHtmlPath = () => {
  if (isDev) {
    return path.join(__dirname, '../renderer/recording.html');
  }
  return path.join(process.resourcesPath, 'app', 'dist', 'renderer', 'recording.html');
};

// Проверка existence файла
const fileExists = (filePath: string): boolean => {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
};

let mainWindow: BrowserWindow | null = null;
let captureWindow: BrowserWindow | null = null;
let editorWindow: BrowserWindow | null = null;
let recordingWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isRecording = false;
let pendingEditorImagePath: string | null = null;
let pendingFullscreenImagePath: string | null = null;

// ─── Дефолтные настройки — используются только для заполнения отсутствующих полей ─
const DEFAULT_SETTINGS: Record<string, any> = {
  savePath: '',
  serverUrl: 'http://localhost:8080',
  bearerToken: '',
  autoUpload: false,
  yadiskToken: '',
  yadiskFolder: '/Skrinshot',
  yadiskAutoUpload: false,
  yadiskClientId: '',
  imageFormat: 'png',
  imageQuality: 90,
  videoFps: 30,
  videoBitrate: '5M',
  videoFormat: 'mp4',
  videoMicDeviceId: '',
  videoSystemAudio: true,
  fileNameTemplate: 'screenshot_{YYYY}-{MM}-{DD}_{HH}-{mm}-{ss}',
  hotkeys: {
    capture: 'PrintScreen',
    captureArea: 'Ctrl+PrintScreen',
    record: 'Shift+PrintScreen',
    recordArea: 'Ctrl+Shift+PrintScreen',
  },
  autoLaunch: false,
  theme: 'light',
};

// Мёрджим дефолты с сохранёнными настройками — НЕ перезаписываем существующие
const initializeSettings = () => {
  const saved = (store.get('settings') as Record<string, any>) || {};
  const merged: Record<string, any> = { ...DEFAULT_SETTINGS, ...saved };
  // Мёрджим вложенный объект hotkeys отдельно
  merged.hotkeys = { ...DEFAULT_SETTINGS.hotkeys, ...(saved.hotkeys || {}) };
  // savePath: если пустой — ставим папку Картинки
  if (!merged.savePath) merged.savePath = app.getPath('pictures');
  store.set('settings', merged);
  log('MAIN', 'Settings initialized', { yadiskClientId: !!merged.yadiskClientId, yadiskToken: !!merged.yadiskToken });
};

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 800,
    minHeight: 500,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // В development-режиме используем Vite dev server
  if (isDev) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    const indexPath = getIndexHtmlPath();
    if (fileExists(indexPath)) {
      mainWindow.loadFile(indexPath);
    } else {
      console.error('[createMainWindow] Index file not found:', indexPath);
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createCaptureWindow() {
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.bounds;

  captureWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // В development-режиме используем Vite dev server
  if (isDev) {
    captureWindow.loadURL(`${VITE_DEV_SERVER_URL}/capture.html`);
  } else {
    const capturePath = getCaptureHtmlPath();
    if (fileExists(capturePath)) {
      captureWindow.loadFile(capturePath);
    } else {
      console.error('[createCaptureWindow] Capture file not found:', capturePath);
    }
  }

  captureWindow.setAlwaysOnTop(true, 'screen-saver');

  captureWindow.on('closed', () => {
    captureWindow = null;
  });
}

function createRecordingWindow(selectArea = false) {
  if (recordingWindow) {
    recordingWindow.focus();
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height, x, y } = primaryDisplay.bounds;

  recordingWindow = new BrowserWindow({
    width, height, x, y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Скрываем окно из захвата экрана — иначе индикатор REC попадёт в запись
  recordingWindow.setContentProtection(true);

  // Пропускаем клики сквозь окно (рабочий стол остаётся доступным)
  // При выборе области — нужны клики сразу, поэтому не включаем ignore
  if (!selectArea) {
    recordingWindow.setIgnoreMouseEvents(true, { forward: true });
  }

  const hash = selectArea ? 'area' : '';

  if (isDev) {
    recordingWindow.loadURL(`${VITE_DEV_SERVER_URL}/recording.html${hash ? '#' + hash : ''}`);
  } else {
    const recPath = getRecordingHtmlPath();
    if (fileExists(recPath)) {
      recordingWindow.loadFile(recPath, hash ? { hash } : undefined);
    }
  }

  recordingWindow.on('closed', () => {
    recordingWindow = null;
    isRecording = false;
    updateTrayMenu(false);
  });
}

function createEditorWindow(imagePath?: string) {
  log('MAIN', '[createEditorWindow] called', { imagePath, isDev });
  pendingEditorImagePath = imagePath || null;

  if (editorWindow && !editorWindow.isDestroyed()) {
    log('MAIN', '[createEditorWindow] editor already open, focusing');
    editorWindow.focus();
    return;
  }

  editorWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  editorWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log('MAIN', '[editor] did-fail-load', { code, desc, url });
  });
  editorWindow.webContents.on('did-finish-load', () => {
    log('MAIN', '[editor] did-finish-load OK');
  });

  if (isDev) {
    const url = `${VITE_DEV_SERVER_URL}/editor.html`;
    log('MAIN', '[createEditorWindow] loadURL dev', { url });
    editorWindow.loadURL(url);
  } else {
    const editorPath = getEditorHtmlPath();
    log('MAIN', '[createEditorWindow] loadFile prod', { editorPath, exists: fileExists(editorPath) });
    if (fileExists(editorPath)) {
      editorWindow.loadFile(editorPath);
    } else {
      log('MAIN', '[createEditorWindow] ERROR: editor file not found', { editorPath, resourcesPath: process.resourcesPath });
    }
  }

  editorWindow.on('closed', () => {
    log('MAIN', '[editor] window closed');
    editorWindow = null;
    pendingEditorImagePath = null;
  });
}

function getTrayIconPath() {
  // Используем .ico, чтобы иконка в трее и exe выглядела одинаково
  if (isDev) {
    return path.join(__dirname, '../../public/icon.ico');
  }
  return path.join(process.resourcesPath, 'app', 'public', 'icon.ico');
}

function updateTrayMenu(recording: boolean) {
  if (!tray) return;
  const menu = recording
    ? Menu.buildFromTemplate([
        { label: '⏹ Остановить запись', click: () => handleRecord() },
        { type: 'separator' },
        { label: 'Выйти', click: () => app.quit() },
      ])
    : Menu.buildFromTemplate([
        { label: 'Скриншот',           click: () => handleCapture() },
        { label: 'Скриншот области',  click: () => handleCaptureArea() },
        { label: 'Запись экрана',     click: () => handleRecord() },
        { label: 'Запись области',    click: () => handleRecordArea() },
        { type: 'separator' },
        { label: 'История',   click: () => showMainWindow() },
        { label: 'Настройки', click: () => showMainWindow('settings') },
        { type: 'separator' },
        { label: 'Выйти', click: () => app.quit() },
      ]);
  tray.setContextMenu(menu);
}

function createTray() {
  const iconPath = getTrayIconPath();
  let icon = nativeImage.createFromPath(iconPath);

  if (icon.isEmpty()) {
    const size = 16;
    const buffer = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        buffer[idx] = 255; buffer[idx + 1] = 100;
        buffer[idx + 2] = 100; buffer[idx + 3] = 255;
      }
    }
    icon = nativeImage.createFromBuffer(buffer, { width: size, height: size });
  }

  // Создаём tray только один раз
  if (!tray) {
    tray = new Tray(icon.resize({ width: 16, height: 16 }));
    tray.setToolTip('Skrinshot');
    tray.on('double-click', () => showMainWindow());
  }

  updateTrayMenu(false);
}

function showMainWindow(page?: string) {
  if (mainWindow) {
    if (page) {
      mainWindow.webContents.send('navigate', page);
    }
    mainWindow.show();
    mainWindow.focus();
  } else {
    createMainWindow();
  }
}

async function handleCapture() {
  log('MAIN', '[handleCapture] START');
  try {
    if (!mainWindow) createMainWindow();

    log('MAIN', '[handleCapture] taking screenshot via screenshot-desktop');
    const imgBuffer = await screenshot({ format: 'png' });
    log('MAIN', '[handleCapture] screenshot done', { size: imgBuffer.length });

    const screenshotImage = nativeImage.createFromBuffer(Buffer.from(imgBuffer));
    const tempImagePath = path.join(app.getPath('temp'), `skrinshot_full_${Date.now()}.png`);
    fs.writeFileSync(tempImagePath, screenshotImage.toPNG());
    log('MAIN', '[handleCapture] temp saved', { tempImagePath });

    // Если capture-окно уже открыто — закрываем его сначала, иначе оно не увидит новый путь
    if (captureWindow && !captureWindow.isDestroyed()) {
      log('MAIN', '[handleCapture] captureWindow already open, closing it first');
      captureWindow.close();
      captureWindow = null;
      await new Promise(r => setTimeout(r, 100));
    }

    pendingFullscreenImagePath = tempImagePath;
    log('MAIN', '[handleCapture] pendingFullscreenImagePath set, opening captureWindow');
    createCaptureWindow();
  } catch (error: any) {
    log('MAIN', '[handleCapture] ERROR', { message: error.message, stack: error.stack });
  }
}

function handleCaptureArea() {
  if (!captureWindow) {
    createCaptureWindow();
  } else {
    captureWindow.show();
    captureWindow.focus();
  }
}

function handleRecord() {
  if (isRecording && recordingWindow) {
    recordingWindow.webContents.send('stop-recording-signal');
  } else {
    createRecordingWindow(false);
  }
}

function handleRecordArea() {
  if (isRecording && recordingWindow) {
    recordingWindow.webContents.send('stop-recording-signal');
  } else {
    createRecordingWindow(true);
  }
}

function saveScreenshot(image: Electron.NativeImage): string | null {
  const settings = store.get('settings') as any;
  const format = settings.imageFormat || 'png';
  const template = settings.fileNameTemplate || 'screenshot_{YYYY}-{MM}-{DD}_{HH}-{mm}-{ss}';
  
  const now = new Date();
  const fileName = template
    .replace('{YYYY}', now.getFullYear().toString())
    .replace('{MM}', String(now.getMonth() + 1).padStart(2, '0'))
    .replace('{DD}', String(now.getDate()).padStart(2, '0'))
    .replace('{HH}', String(now.getHours()).padStart(2, '0'))
    .replace('{mm}', String(now.getMinutes()).padStart(2, '0'))
    .replace('{ss}', String(now.getSeconds()).padStart(2, '0'));
  
  const savePath = settings.savePath || app.getPath('pictures');
  const fullPath = path.join(savePath, `${fileName}.${format}`);
  
  try {
    const data = format === 'png' 
      ? image.toPNG() 
      : image.toJPEG(settings.imageQuality || 90);
    
    const fs = require('fs');
    fs.writeFileSync(fullPath, data);
    
    // Сохраняем в историю
    const s = store.get('settings') as any;
    const willUpload = s?.autoUpload || (s?.yadiskAutoUpload && s?.yadiskToken);
    addToHistory({
      id: Date.now().toString(),
      date: now.toISOString(),
      type: 'image',
      localPath: fullPath,
      status: willUpload ? 'uploading' : 'saved',
      size: data.length,
    });
    if (willUpload) triggerAutoUpload(fullPath);
    
    return fullPath;
  } catch (error) {
    console.error('Error saving screenshot:', error);
    return null;
  }
}

function addToHistory(item: any) {
  const history = (store.get('history') as any[]) || [];
  history.unshift(item);
  // Храним последние 100 записей
  if (history.length > 100) {
    history.splice(100);
  }
  store.set('history', history);
}

function updateHistoryStatus(filePath: string, status: string, extra?: Record<string, any>) {
  const history = (store.get('history') as any[]) || [];
  const item = history.find((h: any) => h.localPath === filePath);
  if (item) {
    item.status = status;
    if (extra) Object.assign(item, extra);
    store.set('history', history);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('history-updated');
  }
}

async function uploadFile(filePath: string) {
  const settings = store.get('settings') as any;
  const serverUrl = settings.serverUrl || 'http://localhost:8080';
  const bearerToken = settings.bearerToken || '';

  log('MAIN', `📤 Upload file: ${filePath}`, { serverUrl, hasToken: !!bearerToken });

  updateHistoryStatus(filePath, 'uploading');

  try {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    const isVideo = /\.(mp4|webm|mkv|mov|avi)$/i.test(filePath);
    const endpoint = isVideo ? '/api/upload/video' : '/api/upload/image';

    log('MAIN', `📡 Sending to: ${serverUrl}${endpoint}`);

    const response = await fetch(serverUrl + endpoint, {
      method: 'POST',
      body: form,
      headers: {
        ...(bearerToken ? { 'Authorization': `Bearer ${bearerToken}` } : {}),
      },
    });

    const result = await response.json();
    log('MAIN', `📋 Response:`, result);

    if (result.success) {
      updateHistoryStatus(filePath, 'uploaded', { url: result.url, fileId: result.fileId });
      log('MAIN', `✅ Uploaded: ${result.url}`);
    } else {
      updateHistoryStatus(filePath, 'failed');
      log('MAIN', `❌ Upload failed: ${result.error}`);
    }

    return result;
  } catch (error: any) {
    log('MAIN', `❌ Upload error: ${error.message}`);
    updateHistoryStatus(filePath, 'failed');
    return null;
  }
}

async function uploadToYandexDisk(filePath: string) {
  const settings = store.get('settings') as any;
  const token = settings.yadiskToken || '';
  if (!token) {
    log('MAIN', '❌ uploadToYandexDisk: no token');
    return null;
  }

  const folder = (settings.yadiskFolder || '/Skrinshot').replace(/\/$/, '');
  const fileName = path.basename(filePath);
  const remotePath = `${folder}/${fileName}`;

  log('MAIN', `📤 Yandex Disk upload START`, { filePath, remotePath, fileExists: fs.existsSync(filePath) });
  updateHistoryStatus(filePath, 'uploading');

  try {
    // Создаём папку если не существует
    const mkdirRes = await fetch(`https://cloud-api.yandex.net/v1/disk/resources?path=${encodeURIComponent(folder)}`, {
      method: 'PUT',
      headers: { 'Authorization': `OAuth ${token}` },
    });
    log('MAIN', `📁 mkdir status: ${mkdirRes.status}`);

    // Получаем URL для загрузки
    const uploadUrlRes = await fetch(
      `https://cloud-api.yandex.net/v1/disk/resources/upload?path=${encodeURIComponent(remotePath)}&overwrite=true`,
      { headers: { 'Authorization': `OAuth ${token}` } }
    );
    const uploadUrlBody = await uploadUrlRes.json();
    log('MAIN', `🔗 get upload URL: status=${uploadUrlRes.status}`, uploadUrlBody);
    if (!uploadUrlRes.ok) {
      updateHistoryStatus(filePath, 'failed');
      return null;
    }
    const uploadUrl = uploadUrlBody.href;

    // Загружаем файл
    const fileContent = fs.readFileSync(filePath);
    log('MAIN', `⬆️  PUT file size=${fileContent.length}`);
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      body: fileContent,
    });
    log('MAIN', `⬆️  PUT status: ${putRes.status}`);
    if (!putRes.ok) {
      updateHistoryStatus(filePath, 'failed');
      return null;
    }

    // Публикуем файл
    const pubRes = await fetch(
      `https://cloud-api.yandex.net/v1/disk/resources/publish?path=${encodeURIComponent(remotePath)}`,
      { method: 'PUT', headers: { 'Authorization': `OAuth ${token}` } }
    );
    log('MAIN', `🌐 publish status: ${pubRes.status}`);

    // Получаем публичную ссылку
    const infoRes = await fetch(
      `https://cloud-api.yandex.net/v1/disk/resources?path=${encodeURIComponent(remotePath)}&fields=public_url`,
      { headers: { 'Authorization': `OAuth ${token}` } }
    );
    const info = await infoRes.json();
    log('MAIN', `ℹ️  resource info:`, info);
    const publicUrl = info.public_url;

    if (publicUrl) {
      updateHistoryStatus(filePath, 'uploaded', { url: publicUrl });
      log('MAIN', `✅ Yandex Disk uploaded: ${publicUrl}`);
      return { success: true, url: publicUrl };
    } else {
      updateHistoryStatus(filePath, 'failed');
      log('MAIN', `❌ Yandex Disk: no public_url in response`);
      return null;
    }
  } catch (error: any) {
    log('MAIN', `❌ Yandex Disk error: ${error.message}`);
    updateHistoryStatus(filePath, 'failed');
    return null;
  }
}

async function transcodeToMp4(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let ffmpegPath: string = require('ffmpeg-static');
    if (app.isPackaged) {
      ffmpegPath = ffmpegPath.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
      ffmpegPath = ffmpegPath.replace('app.asar/', 'app.asar.unpacked/');
    }
    log('MAIN', '[transcodeToMp4]', { inputPath, outputPath, ffmpegPath });
    const ffmpeg = require('fluent-ffmpeg');
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg(inputPath)
      .output(outputPath)
      .videoCodec('libx264')
      .outputOptions([
        '-preset', 'ultrafast',
        '-crf', '28',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-f', 'mp4',
      ])
      .noAudio()
      .on('end', () => { log('MAIN', '[transcodeToMp4] done'); resolve(); })
      .on('error', (err: Error) => { log('MAIN', '[transcodeToMp4] error', { message: err.message }); reject(err); })
      .run();
  });
}

function triggerAutoUpload(filePath: string) {
  const settings = store.get('settings') as any;
  if (settings.autoUpload) uploadFile(filePath);
  if (settings.yadiskAutoUpload && settings.yadiskToken) uploadToYandexDisk(filePath);
}

let retryQueueRunning = false;

async function processRetryQueue() {
  if (retryQueueRunning) return;
  retryQueueRunning = true;
  try {
    const settings = store.get('settings') as any;

    // Ретраим только если есть куда загружать
    const hasServer = !!settings.serverUrl;
    const hasYadisk = !!settings.yadiskToken;
    if (!hasServer && !hasYadisk) return;

    if (hasServer) {
      // Проверяем доступность сервера
      try {
        const res = await fetch(settings.serverUrl + '/api/health', { signal: AbortSignal.timeout(3000) });
        if (!res.ok) return;
      } catch {
        return; // Сервер недоступен — не ретраим
      }
    }

    const history = (store.get('history') as any[]) || [];
    const toRetry = history.filter((h: any) => h.status === 'pending' || h.status === 'failed');

    for (const item of toRetry) {
      if (fs.existsSync(item.localPath)) {
        log('MAIN', `🔄 Auto-retrying upload: ${item.localPath}`);
        if (hasYadisk) await uploadToYandexDisk(item.localPath);
        else await uploadFile(item.localPath);
      }
    }
  } finally {
    retryQueueRunning = false;
  }
}

function addToUploadQueue(filePath: string) {
  const queue = (store.get('uploadQueue') as any[]) || [];
  queue.push({
    filePath,
    addedAt: new Date().toISOString(),
    attempts: 0,
  });
  store.set('uploadQueue', queue);
}

function registerHotkeys() {
  const settings = store.get('settings') as any;
  const hotkeys = settings.hotkeys || {};
  
  // Сбрасываем все горячие клавиши
  globalShortcut.unregisterAll();
  
  // Регистрируем горячие клавиши
  if (hotkeys.capture) {
    globalShortcut.register(hotkeys.capture, () => {
      handleCapture();
    });
  }
  
  if (hotkeys.captureArea) {
    globalShortcut.register(hotkeys.captureArea, () => {
      handleCaptureArea();
    });
  }
  
  if (hotkeys.record) {
    globalShortcut.register(hotkeys.record, () => {
      handleRecord();
    });
  }

  if (hotkeys.recordArea) {
    globalShortcut.register(hotkeys.recordArea, () => {
      handleRecordArea();
    });
  }
}

// IPC handlers
ipcMain.handle('get-pending-fullscreen', () => {
  log('MAIN', '[get-pending-fullscreen]', { path: pendingFullscreenImagePath });
  const p = pendingFullscreenImagePath;
  pendingFullscreenImagePath = null;
  return p;
});

ipcMain.handle('get-pending-image', () => {
  log('MAIN', '[get-pending-image]', { path: pendingEditorImagePath });
  const path = pendingEditorImagePath;
  pendingEditorImagePath = null;
  return path;
});

ipcMain.handle('get-settings', () => {
  log('MAIN', '[get-settings] Getting settings');
  return store.get('settings');
});

ipcMain.handle('save-settings', (_, settings: any) => {
  log('MAIN', '[save-settings] Saving settings:', settings);
  store.set('settings', settings);
  registerHotkeys();
  return true;
});

ipcMain.handle('get-history', () => {
  log('MAIN', '[get-history] Getting history');
  return store.get('history') || [];
});

ipcMain.handle('delete-history-item', (_, id: string) => {
  log('MAIN', '[delete-history-item] Deleting item:', id);
  const history = (store.get('history') as any[]) || [];
  const item = history.find((h: any) => h.id === id);
  if (item && item.localPath) {
    try {
      const fs = require('fs');
      fs.unlinkSync(item.localPath);
      log('MAIN', '[delete-history-item] File deleted:', item.localPath);
    } catch (e) {
      log('MAIN', '[delete-history-item] File not found or error:', e);
    }
  }
  store.set('history', history.filter((h: any) => h.id !== id));
  return true;
});

// Обработчик для сохранения скриншота всего экрана
ipcMain.handle('save-fullscreen-screenshot', (_, imageData: string) => {
  log('MAIN', '[save-fullscreen-screenshot] Saving screenshot');
  const settings = store.get('settings') as any;
  const format = settings.imageFormat || 'png';
  const template = settings.fileNameTemplate || 'screenshot_{YYYY}-{MM}-{DD}_{HH}-{mm}-{ss}';

  const now = new Date();
  const fileName = template
    .replace('{YYYY}', now.getFullYear().toString())
    .replace('{MM}', String(now.getMonth() + 1).padStart(2, '0'))
    .replace('{DD}', String(now.getDate()).padStart(2, '0'))
    .replace('{HH}', String(now.getHours()).padStart(2, '0'))
    .replace('{mm}', String(now.getMinutes()).padStart(2, '0'))
    .replace('{ss}', String(now.getSeconds()).padStart(2, '0'));

  const savePath = settings.savePath || app.getPath('pictures');
  const fullPath = path.join(savePath, `${fileName}.${format}`);

  try {
    const fs = require('fs');
    const buffer = Buffer.from(imageData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    fs.writeFileSync(fullPath, buffer);
    log('MAIN', '[save-fullscreen-screenshot] File saved:', fullPath);

    addToHistory({
      id: Date.now().toString(),
      date: now.toISOString(),
      type: 'image',
      localPath: fullPath,
      status: (settings.autoUpload || (settings.yadiskAutoUpload && settings.yadiskToken)) ? 'uploading' : 'saved',
      size: buffer.length,
    });

    if (settings.autoUpload || (settings.yadiskAutoUpload && settings.yadiskToken)) {
      log('MAIN', '[save-fullscreen-screenshot] Auto-upload enabled, uploading...');
      triggerAutoUpload(fullPath);
    }

    createEditorWindow(fullPath);

    return { success: true, path: fullPath };
  } catch (error) {
    log('MAIN', '[save-fullscreen-screenshot] Error:', error);
    return { success: false, error: error };
  }
});

ipcMain.handle('get-upload-queue', () => {
  log('MAIN', '[get-upload-queue] Getting upload queue');
  return store.get('uploadQueue') || [];
});

ipcMain.handle('yadisk-auth', (_, clientId: string): Promise<{ success: boolean; token?: string; error?: string }> => {
  return new Promise((resolve) => {
    const REDIRECT_URI = 'https://oauth.yandex.ru/verification_code';
    const authUrl = `https://oauth.yandex.ru/authorize?response_type=token&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

    // persist: сохраняет сессию Яндекса между запусками — второй раз уже без логина
    const authWindow = new BrowserWindow({
      width: 500,
      height: 660,
      title: 'Вход в Яндекс',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: 'persist:yandex-auth',
      },
      autoHideMenuBar: true,
    });

    let resolved = false;
    function done(result: { success: boolean; token?: string; error?: string }) {
      if (resolved) return;
      resolved = true;
      if (!authWindow.isDestroyed()) authWindow.close();
      resolve(result);
    }

    // Вариант 1: токен в хэше URL (некоторые конфиги Яндекса)
    authWindow.webContents.on('will-redirect', (_e, url) => {
      if (url.startsWith(REDIRECT_URI)) {
        const hash = url.includes('#') ? url.split('#')[1] : '';
        const params = new URLSearchParams(hash);
        const token = params.get('access_token');
        if (token) done({ success: true, token });
      }
    });

    // Вариант 2: Яндекс показывает токен как текст на странице verification_code
    authWindow.webContents.on('did-navigate', async (_e, url) => {
      if (!url.startsWith(REDIRECT_URI)) return;
      try {
        // Ждём загрузки содержимого страницы
        await new Promise(r => setTimeout(r, 500));
        const pageText: string = await authWindow.webContents.executeJavaScript(
          `document.body.innerText`
        );
        // Ищем токен — он начинается с y0_ или AQAAA и состоит из base64-символов
        const match = pageText.match(/y0_[A-Za-z0-9_\-]{20,}|AQAAA[A-Za-z0-9_\-]{20,}/);
        if (match) {
          done({ success: true, token: match[0] });
        } else {
          // Последний шанс — весь текст страницы (токен занимает всю строку)
          const trimmed = pageText.trim().split(/\s+/)[0];
          if (trimmed && trimmed.length > 30) {
            done({ success: true, token: trimmed });
          }
        }
      } catch {}
    });

    authWindow.on('closed', () => done({ success: false, error: 'Окно закрыто' }));
    authWindow.loadURL(authUrl);
  });
});

ipcMain.handle('retry-upload', (_, filePath: string) => {
  const settings = store.get('settings') as any;
  const useYadisk = settings.yadiskAutoUpload && settings.yadiskToken;
  const useServer = settings.autoUpload && settings.serverUrl;
  log('MAIN', '[retry-upload]', { filePath, useYadisk, useServer });

  if (!useYadisk && !useServer) {
    return { success: false, error: 'Загрузка не настроена. Включите автозагрузку в разделе «Сервер».' };
  }
  if (useYadisk) return uploadToYandexDisk(filePath);
  return uploadFile(filePath);
});

ipcMain.handle('clear-queue', () => {
  log('MAIN', '[clear-queue] Clearing upload queue');
  store.set('uploadQueue', []);
  return true;
});

ipcMain.handle('capture-screen-area', async (_, bounds: any) => {
  try {
    console.log('[capture-screen-area] Capturing area (client bounds):', bounds);

    // Захватываем весь экран (screenshot-desktop на Windows захватывает первичный монитор)
    const imgBuffer = await screenshot({ format: 'png' });
    console.log('[capture-screen-area] Full screenshot buffer size:', imgBuffer.length);

    // Создаем изображение из буфера
    const fullImage = nativeImage.createFromBuffer(Buffer.from(imgBuffer));
    const fullSize = fullImage.getSize();
    console.log('[capture-screen-area] Full image size:', fullSize);

    // Получаем информацию о дисплеях
    const displays = screen.getAllDisplays();
    const primaryDisplay = screen.getPrimaryDisplay();

    console.log('[capture-screen-area] All displays:', displays.map(d => ({
      id: d.id,
      bounds: d.bounds,
      scaleFactor: d.scaleFactor,
      size: d.size
    })));

    // Используем pixelRatio из окна capture или scaleFactor дисплея
    const pixelRatio = bounds.pixelRatio || primaryDisplay.scaleFactor || 1;
    console.log('[capture-screen-area] Using pixelRatio:', pixelRatio);

    console.log('[capture-screen-area] Primary display:', {
      bounds: primaryDisplay.bounds,
      scaleFactor: primaryDisplay.scaleFactor,
      workAreaSize: primaryDisplay.workAreaSize
    });

    // bounds приходят в пикселях окна capture (client coordinates)
    // Умножаем на pixelRatio для получения физических пикселей изображения
    const cropBounds = {
      x: Math.round(bounds.x * pixelRatio),
      y: Math.round(bounds.y * pixelRatio),
      width: Math.round(bounds.width * pixelRatio),
      height: Math.round(bounds.height * pixelRatio),
    };

    console.log('[capture-screen-area] Crop bounds (scaled):', cropBounds);

    // Проверяем что область не выходит за границы изображения
    const safeBounds = {
      x: Math.max(0, Math.min(cropBounds.x, fullSize.width - 1)),
      y: Math.max(0, Math.min(cropBounds.y, fullSize.height - 1)),
      width: Math.min(cropBounds.width, fullSize.width - cropBounds.x),
      height: Math.min(cropBounds.height, fullSize.height - cropBounds.y),
    };

    console.log('[capture-screen-area] Safe bounds:', safeBounds);

    // Обрезаем изображение
    const croppedImage = fullImage.crop(safeBounds);
    console.log('[capture-screen-area] Cropped image size:', croppedImage.getSize());

    // Возвращаем как base64
    const dataUrl = croppedImage.toDataURL();
    console.log('[capture-screen-area] DataURL length:', dataUrl.length);
    return dataUrl;
  } catch (error) {
    console.error('[capture-screen-area] Error:', error);
    return null;
  }
});

ipcMain.handle('capture-area-done', async (_, imageData: string, bounds: any) => {
  console.log('[capture-area-done] Called with data length:', imageData.length);

  if (captureWindow) {
    console.log('[capture-area-done] Closing capture window');
    captureWindow.close();
  }

  // Конвертируем base64 в буфер
  const buffer = Buffer.from(imageData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  console.log('[capture-area-done] Buffer size:', buffer.length);

  // Создаем временное изображение в памяти (не сохраняем на диск)
  const tempImagePath = path.join(app.getPath('temp'), `skrinshot_temp_${Date.now()}.png`);
  
  try {
    const fs = require('fs');
    fs.writeFileSync(tempImagePath, buffer);
    console.log('[capture-area-done] Temp file created:', tempImagePath);

    // Открываем редактор с временным файлом
    console.log('[capture-area-done] Creating editor window');
    createEditorWindow(tempImagePath);

    return { success: true, path: tempImagePath, isTemp: true };
  } catch (error) {
    console.error('[capture-area-done] Error:', error);
    return { success: false, error: error };
  }
});

// Обработчик для закрытия окна захвата
ipcMain.on('close-capture-window', () => {
  console.log('[close-capture-window] Closing capture window');
  if (captureWindow) {
    captureWindow.close();
  }
});

// Обработчик для закрытия окна редактора
ipcMain.on('close-editor-window', () => {
  console.log('[close-editor-window] Closing editor window');
  if (editorWindow) {
    editorWindow.close();
  }
});

// Тестовый обработчик для скриншота
ipcMain.on('test-capture', () => {
  console.log('[test-capture] Test capture triggered from UI');
  handleCapture();
});

ipcMain.handle('save-edited-image', (_, buffer: Buffer) => {
  try {
    log('MAIN', '[save-edited-image] Saving edited image, buffer size:', buffer.length);
    const settings = store.get('settings') as any;
    const format = settings.imageFormat || 'png';
    const template = settings.fileNameTemplate || 'screenshot_{YYYY}-{MM}-{DD}_{HH}-{mm}-{ss}-edited';

    const now = new Date();
    const fileName = template
      .replace('{YYYY}', now.getFullYear().toString())
      .replace('{MM}', String(now.getMonth() + 1).padStart(2, '0'))
      .replace('{DD}', String(now.getDate()).padStart(2, '0'))
      .replace('{HH}', String(now.getHours()).padStart(2, '0'))
      .replace('{mm}', String(now.getMinutes()).padStart(2, '0'))
      .replace('{ss}', String(now.getSeconds()).padStart(2, '0'));

    const savePath = settings.savePath || app.getPath('pictures');
    const fullPath = path.join(savePath, `${fileName}.${format}`);

    const fs = require('fs');
    fs.writeFileSync(fullPath, buffer);
    log('MAIN', '[save-edited-image] File saved:', fullPath);

    addToHistory({
      id: Date.now().toString(),
      date: now.toISOString(),
      type: 'image',
      localPath: fullPath,
      status: (settings.autoUpload || (settings.yadiskAutoUpload && settings.yadiskToken)) ? 'uploading' : 'saved',
      size: buffer.length,
    });

    if (settings.autoUpload || (settings.yadiskAutoUpload && settings.yadiskToken)) {
      log('MAIN', '[save-edited-image] Auto-upload enabled, uploading...');
      triggerAutoUpload(fullPath);
    }

    return { success: true, path: fullPath };
  } catch (error) {
    log('MAIN', '[save-edited-image] Error:', error);
    return { success: false, error: error };
  }
});

// Обработчик для копирования изображения в буфер обмена
ipcMain.handle('copy-image-to-clipboard', (_, buffer: Buffer) => {
  try {
    log('MAIN', '[copy-image-to-clipboard] Copying image to clipboard, buffer size:', buffer.length);
    const image = nativeImage.createFromBuffer(buffer);
    clipboard.writeImage(image);
    log('MAIN', '[copy-image-to-clipboard] Image copied successfully');
    return { success: true };
  } catch (error) {
    log('MAIN', '[copy-image-to-clipboard] Error:', error);
    return { success: false, error: error };
  }
});

// Обработчик для загрузки изображения на сервер (или Яндекс Диск)
ipcMain.handle('upload-image-to-server', async (_, buffer: Buffer) => {
  try {
    const settings = store.get('settings') as any;

    // Если настроен Яндекс Диск — грузим туда
    if (settings.yadiskAutoUpload && settings.yadiskToken) {
      log('MAIN', '[upload-image-to-server] routing to Yandex Disk', { bufferSize: buffer.length });
      const tempFilePath = path.join(app.getPath('temp'), `skrinshot_upload_${Date.now()}.png`);
      fs.writeFileSync(tempFilePath, buffer);
      const result = await uploadToYandexDisk(tempFilePath);
      try { fs.unlinkSync(tempFilePath); } catch {}
      if (result?.success && result?.url) {
        clipboard.writeText(result.url);
        log('MAIN', '[upload-image-to-server] URL copied to clipboard', { url: result.url });
      }
      return result || { success: false, error: 'Ошибка загрузки на Яндекс Диск' };
    }

    const serverUrl = settings.serverUrl || 'http://localhost:8080';
    const bearerToken = settings.bearerToken || '';

    log('MAIN', '[upload-image-to-server] Uploading to:', { serverUrl, bufferSize: buffer.length, hasToken: !!bearerToken });

    // Сохраняем во временный файл для загрузки
    const tempFilePath = path.join(app.getPath('temp'), `skrinshot_upload_${Date.now()}.png`);
    fs.writeFileSync(tempFilePath, buffer);
    log('MAIN', '[upload-image-to-server] Temp file created:', tempFilePath);

    // Создаем FormData и добавляем файл через stream
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', fs.createReadStream(tempFilePath), {
      filename: `screenshot_${Date.now()}.png`,
      contentType: 'image/png',
    });

    // Отправляем POST запрос используя form.submit() для корректной работы
    log('MAIN', '[upload-image-to-server] Sending request...');
    
    const http = require('http');
    const https = require('https');
    const url = require('url');
    
    const parsedUrl = url.parse(serverUrl + '/api/upload/image');
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    
    log('MAIN', '[upload-image-to-server] Parsed URL:', {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.path,
      protocol: parsedUrl.protocol
    });
    
    log('MAIN', '[upload-image-to-server] Headers:', {
      ...form.getHeaders(),
      ...(bearerToken ? { 'Authorization': `Bearer ${bearerToken}` } : {}),
    });
    
    return new Promise((resolve, reject) => {
      const req = protocol.request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.path,
        method: 'POST',
        headers: {
          ...form.getHeaders(),
          ...(bearerToken ? { 'Authorization': `Bearer ${bearerToken}` } : {}),
        },
      }, (res: any) => {
        log('MAIN', '[upload-image-to-server] Response received:', {
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          headers: res.headers
        });
        
        let data = '';
        res.on('data', (chunk: string) => {
          log('MAIN', '[upload-image-to-server] Received chunk:', { length: chunk.length });
          data += chunk;
        });
        res.on('end', () => {
          log('MAIN', '[upload-image-to-server] Response ended, total data length:', data.length);
          try {
            const result = JSON.parse(data);
            log('MAIN', '[upload-image-to-server] Server response:', result);
            
            // Удаляем временный файл
            try {
              fs.unlinkSync(tempFilePath);
              log('MAIN', '[upload-image-to-server] Temp file deleted:', tempFilePath);
            } catch (e) {
              log('MAIN', '[upload-image-to-server] Failed to delete temp file:', e);
            }
            
            if (result.success) {
              // Добавляем в историю
              addToHistory({
                id: Date.now().toString(),
                date: new Date().toISOString(),
                type: 'image',
                status: 'uploaded',
                url: result.url,
                fileId: result.fileId,
                size: buffer.length,
              });
              if (result.url) {
                clipboard.writeText(result.url);
                log('MAIN', '[upload-image-to-server] URL copied to clipboard', { url: result.url });
              }
              log('MAIN', '[upload-image-to-server] ✅ Upload successful:', result.url);
              resolve({ success: true, url: result.url, fileId: result.fileId });
            } else {
              log('MAIN', '[upload-image-to-server] ❌ Server error:', result.error);
              resolve({ success: false, error: result.error || 'Ошибка сервера' });
            }
          } catch (e) {
            log('MAIN', '[upload-image-to-server] Parse error:', e);
            resolve({ success: false, error: 'Ошибка парсинга ответа' });
          }
        });
      });
      
      req.on('error', (err: Error) => {
        log('MAIN', '[upload-image-to-server] ❌ Request error:', err);
        // Удаляем временный файл при ошибке
        try {
          fs.unlinkSync(tempFilePath);
        } catch (e) {}
        resolve({ success: false, error: err.message });
      });
      
      log('MAIN', '[upload-image-to-server] Starting to pipe form data...');
      form.pipe(req);
    });
  } catch (error: any) {
    log('MAIN', '[upload-image-to-server] ❌ Network error:', { error: error.message, stack: error.stack });
    return { success: false, error: error.message || 'Ошибка сети' };
  }
});

// Обновляем трей когда запись началась
ipcMain.on('recording-started', () => {
  isRecording = true;
  updateTrayMenu(true);
});

// Восстанавливаем трей когда запись остановлена
ipcMain.on('recording-stopped', () => {
  isRecording = false;
  updateTrayMenu(false);
});

// Сохраняем видео во временный файл для превью
ipcMain.handle('save-video-temp', (_, videoData: Buffer) => {
  try {
    const fs = require('fs');
    const tempPath = path.join(app.getPath('temp'), `skrinshot_rec_${Date.now()}.webm`);
    fs.writeFileSync(tempPath, videoData);
    return { success: true, path: tempPath };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Сохраняем видео в финальное место
ipcMain.handle('save-video-local', async (_, tempPath: string) => {
  try {
    const settings = store.get('settings') as any;
    const videoFormat: string = settings.videoFormat || 'mp4';
    const imageTemplate = settings.fileNameTemplate || 'screenshot_{YYYY}-{MM}-{DD}_{HH}-{mm}-{ss}';
    const template = imageTemplate.replace(/^screenshot/, 'video');
    const now = new Date();
    const fileName = template
      .replace('{YYYY}', now.getFullYear().toString())
      .replace('{MM}', String(now.getMonth() + 1).padStart(2, '0'))
      .replace('{DD}', String(now.getDate()).padStart(2, '0'))
      .replace('{HH}', String(now.getHours()).padStart(2, '0'))
      .replace('{mm}', String(now.getMinutes()).padStart(2, '0'))
      .replace('{ss}', String(now.getSeconds()).padStart(2, '0'));

    const savePath = settings.savePath || app.getPath('videos');
    const fullPath = path.join(savePath, `${fileName}.${videoFormat}`);

    if (videoFormat === 'mp4') {
      log('MAIN', '[save-video-local] transcoding webm → mp4', { tempPath, fullPath });
      await transcodeToMp4(tempPath, fullPath);
      try { fs.unlinkSync(tempPath); } catch {}
    } else {
      fs.copyFileSync(tempPath, fullPath);
      fs.unlinkSync(tempPath);
    }

    const size = fs.statSync(fullPath).size;
    addToHistory({
      id: Date.now().toString(),
      date: now.toISOString(),
      type: 'video',
      localPath: fullPath,
      status: 'saved',
      size,
    });

    log('MAIN', '[save-video-local] saved', { fullPath, format: videoFormat });
    return { success: true, path: fullPath };
  } catch (error: any) {
    log('MAIN', '[save-video-local] ERROR', { message: error.message });
    return { success: false, error: error.message };
  }
});

// Загружаем видео (на сервер или Яндекс Диск в зависимости от настроек)
ipcMain.handle('upload-video', async (_, tempPath: string) => {
  try {
    const settings = store.get('settings') as any;
    const videoFormat: string = settings.videoFormat || 'mp4';
    log('MAIN', '[upload-video] start', { tempPath, videoFormat, yadiskToken: !!settings.yadiskToken, serverUrl: settings.serverUrl });

    // Конвертируем в mp4 если нужно
    let uploadPath = tempPath;
    if (videoFormat === 'mp4' && tempPath.endsWith('.webm')) {
      const mp4Path = tempPath.replace('.webm', '.mp4');
      log('MAIN', '[upload-video] transcoding webm → mp4', { mp4Path });
      await transcodeToMp4(tempPath, mp4Path);
      try { fs.unlinkSync(tempPath); } catch {}
      uploadPath = mp4Path;
    }

    let result: any = null;
    if (settings.yadiskToken) {
      result = await uploadToYandexDisk(uploadPath);
    } else {
      result = await uploadFile(uploadPath);
    }

    if (result && result.success) {
      try { fs.unlinkSync(uploadPath); } catch {}
      if (result.url) {
        clipboard.writeText(result.url);
        log('MAIN', '[upload-video] URL copied to clipboard', { url: result.url });
      }
    }
    log('MAIN', '[upload-video] result', result);
    return result || { success: false, error: 'Ошибка загрузки' };
  } catch (error: any) {
    log('MAIN', '[upload-video] ERROR', { message: error.message });
    return { success: false, error: error.message };
  }
});

// Удаляем временный файл
ipcMain.handle('discard-video', (_, tempPath: string) => {
  try {
    const fs = require('fs');
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  } catch {}
  return { success: true };
});

// Закрываем окно записи
ipcMain.on('close-recording-window', () => {
  if (recordingWindow) recordingWindow.close();
});

// Переключение прозрачности кликов (hover на панели управления)
ipcMain.on('set-ignore-mouse-events', (_, ignore: boolean) => {
  if (recordingWindow) {
    recordingWindow.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

// Кастомный протокол для OAuth Яндекс (skrinshot://oauth/callback)
app.setAsDefaultProtocolClient('skrinshot');

function handleYadiskOAuthUrl(url: string) {
  // url вида: skrinshot://oauth/callback#access_token=TOKEN&...
  const hash = url.includes('#') ? url.split('#')[1] : '';
  const params = new URLSearchParams(hash);
  const token = params.get('access_token');
  log('MAIN', `[yadisk-oauth] Deep link received, token=${!!token}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('yadisk-token-received', token || null);
    mainWindow.show();
    mainWindow.focus();
  }
}

// Windows: второй экземпляр получает URL через argv
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const deepLink = argv.find(a => a.startsWith('skrinshot://'));
    if (deepLink) handleYadiskOAuthUrl(deepLink);
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
}

// App lifecycle
app.whenReady().then(() => {
  initLogFile();
  log('MAIN', 'App ready', { isDev, resourcesPath: process.resourcesPath });

  // Разрешаем захват экрана для записи (Electron 28+)
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then(sources => {
      callback({ video: sources[0], audio: 'loopback' });
    });
  });

  initializeSettings();
  createTray();
  createMainWindow();
  registerHotkeys();

  // Авторетрай: при старте и каждые 30 секунд
  setTimeout(() => processRetryQueue(), 5000);
  setInterval(() => processRetryQueue(), 30000);
});

app.on('window-all-closed', () => {
  // Не закрываем приложение, оно работает в трее
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
