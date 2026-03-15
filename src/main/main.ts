import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, nativeImage, clipboard } from 'electron';
import path from 'path';
import Store from 'electron-store';
import screenshot from 'screenshot-desktop';
import fs from 'fs';

// Вспомогательная функция для логирования с меткой времени
const log = (module: string, message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
  console.log(`[${timestamp}] [${module}] ${message}${dataStr}`);
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
let tray: Tray | null = null;
let isRecording = false;
let pendingEditorImagePath: string | null = null;
let pendingFullscreenImagePath: string | null = null;

// Установка default значений
const initializeSettings = () => {
  const settings = store.get('settings') as any;
  if (!settings || !settings.savePath) {
    store.set('settings.savePath', app.getPath('pictures'));
  }
};

store.set('settings', {
  savePath: '', // будет установлено при инициализации
  serverUrl: 'http://localhost:8080',
  bearerToken: '',
  autoUpload: false,
  imageFormat: 'png',
  imageQuality: 90,
  videoFps: 30,
  videoBitrate: '5M',
  fileNameTemplate: 'screenshot_{YYYY}-{MM}-{DD}_{HH}-{mm}-{ss}',
  hotkeys: {
    capture: 'F1',
    captureArea: 'Ctrl+F1',
    record: 'Shift+F1',
  },
  autoLaunch: false,
  theme: 'light',
});

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

function createEditorWindow(imagePath?: string) {
  pendingEditorImagePath = imagePath || null;

  editorWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // В development-режиме используем Vite dev server
  if (isDev) {
    editorWindow.loadURL(`${VITE_DEV_SERVER_URL}/editor.html`);
  } else {
    const editorPath = getEditorHtmlPath();
    if (fileExists(editorPath)) {
      editorWindow.loadFile(editorPath);
    } else {
      console.error('[createEditorWindow] Editor file not found:', editorPath);
    }
  }

  editorWindow.on('closed', () => {
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

function createTray() {
  const iconPath = getTrayIconPath();
  let icon = nativeImage.createFromPath(iconPath);
  
  // Если иконка не загрузилась, создаём резервную
  if (icon.isEmpty()) {
    const size = 16;
    const buffer = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        buffer[idx] = 255;
        buffer[idx + 1] = 100;
        buffer[idx + 2] = 100;
        buffer[idx + 3] = 255;
      }
    }
    icon = nativeImage.createFromBuffer(buffer, { width: size, height: size });
  }
  
  // Ресайз до 16x16 для трея
  const resizedIcon = icon.resize({ width: 16, height: 16 });
  
  tray = new Tray(resizedIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Скриншот',
      click: () => handleCapture(),
    },
    {
      label: 'Скриншот области',
      click: () => handleCaptureArea(),
    },
    {
      label: 'Запись экрана',
      click: () => handleRecord(),
    },
    { type: 'separator' },
    {
      label: 'История',
      click: () => showMainWindow(),
    },
    {
      label: 'Настройки',
      click: () => showMainWindow('settings'),
    },
    { type: 'separator' },
    {
      label: 'Выйти',
      click: () => app.quit(),
    },
  ]);

  tray.setToolTip('Skrinshot');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => showMainWindow());
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
  try {
    console.log('[handleCapture] Starting full screen capture...');

    // Проверяем что mainWindow существует
    if (!mainWindow) {
      console.log('[handleCapture] mainWindow is null, creating...');
      createMainWindow();
    }

    // Делаем скриншот всего экрана через screenshot-desktop
    const imgBuffer = await screenshot({ format: 'png' });
    console.log('[handleCapture] Screenshot buffer size:', imgBuffer.length);

    const screenshotImage = nativeImage.createFromBuffer(Buffer.from(imgBuffer));
    console.log('[handleCapture] NativeImage created, size:', screenshotImage.getSize());

    // Сохраняем во временный файл
    const tempImagePath = path.join(app.getPath('temp'), `skrinshot_full_${Date.now()}.png`);
    const fs = require('fs');
    const data = screenshotImage.toPNG();
    fs.writeFileSync(tempImagePath, data);
    console.log('[handleCapture] Temp image saved to:', tempImagePath);

    // Открываем capture-окно с встроенным редактором (минуя фазу выделения)
    pendingFullscreenImagePath = tempImagePath;
    createCaptureWindow();
    console.log('[handleCapture] Capture window created for fullscreen edit');
  } catch (error) {
    console.error('[handleCapture] Error:', error);
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
  isRecording = !isRecording;
  
  if (mainWindow) {
    mainWindow.webContents.send('recording-state', isRecording);
  }
  
  if (tray) {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: isRecording ? 'Остановить запись' : 'Запись экрана',
        click: () => handleRecord(),
      },
      { type: 'separator' },
      {
        label: 'История',
        click: () => showMainWindow(),
      },
      {
        label: 'Настройки',
        click: () => showMainWindow('settings'),
      },
      { type: 'separator' },
      {
        label: 'Выйти',
        click: () => app.quit(),
      },
    ]);
    tray.setContextMenu(contextMenu);
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
    addToHistory({
      id: Date.now().toString(),
      date: now.toISOString(),
      type: 'image',
      localPath: fullPath,
      status: 'pending',
      size: data.length,
    });
    
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

async function uploadFile(filePath: string) {
  const settings = store.get('settings') as any;
  const serverUrl = settings.serverUrl || 'http://localhost:8080';
  const bearerToken = settings.bearerToken || '';

  log('MAIN', `📤 Upload file: ${filePath}`, { serverUrl, hasToken: !!bearerToken });

  try {
    const fs = require('fs');
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    const isVideo = filePath.endsWith('.mp4');
    const endpoint = isVideo ? '/api/upload/video' : '/api/upload/image';

    log('MAIN', `📡 Sending request to: ${serverUrl}${endpoint}`);
    
    // Логируем детали запроса
    log('MAIN', `📋 Request details:`, {
      method: 'POST',
      url: serverUrl + endpoint,
      headers: {
        ...(bearerToken ? { 'Authorization': `Bearer ${bearerToken}` } : {}),
      },
      fileSize: fs.statSync(filePath).size
    });

    log('MAIN', `📡 Initiating fetch request...`);
    const response = await fetch(serverUrl + endpoint, {
      method: 'POST',
      body: form,
      headers: {
        ...(bearerToken ? { 'Authorization': `Bearer ${bearerToken}` } : {}),
      },
    });
    log('MAIN', `📡 Fetch request completed`);

    log('MAIN', `📥 Response status: ${response.status} ${response.statusText}`);
    log('MAIN', `📥 Response headers:`, response.headers);

    const result = await response.json();
    log('MAIN', `📋 Response body:`, result);

    if (result.success) {
      // Обновляем историю
      const history = (store.get('history') as any[]) || [];
      const item = history.find((h: any) => h.localPath === filePath);
      if (item) {
        item.status = 'uploaded';
        item.url = result.url;
        item.fileId = result.fileId;
      }
      store.set('history', history);
      log('MAIN', `✅ File uploaded successfully: ${result.url}`);
    } else {
      log('MAIN', `❌ Upload failed: ${result.error}`);
    }

    return result;
  } catch (error: any) {
    log('MAIN', `❌ Upload error:`, {
      error: error.message,
      stack: error.stack,
      filePath,
      serverUrl: settings.serverUrl || 'http://localhost:8080'
    });
    // Добавляем в очередь на повторную отправку
    addToUploadQueue(filePath);
    return null;
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
}

// IPC handlers
ipcMain.handle('get-pending-fullscreen', () => {
  const p = pendingFullscreenImagePath;
  pendingFullscreenImagePath = null;
  return p;
});

ipcMain.handle('get-pending-image', () => {
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
      status: settings.autoUpload ? 'uploading' : 'pending',
      size: buffer.length,
    });

    if (settings.autoUpload) {
      log('MAIN', '[save-fullscreen-screenshot] Auto-upload enabled, uploading...');
      uploadFile(fullPath);
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

ipcMain.handle('retry-upload', (_, filePath: string) => {
  log('MAIN', '[retry-upload] Retrying upload:', filePath);
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
      status: settings.autoUpload ? 'uploading' : 'pending',
      size: buffer.length,
    });

    if (settings.autoUpload) {
      log('MAIN', '[save-edited-image] Auto-upload enabled, uploading...');
      uploadFile(fullPath);
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

// Обработчик для загрузки изображения на сервер
ipcMain.handle('upload-image-to-server', async (_, buffer: Buffer) => {
  try {
    const settings = store.get('settings') as any;
    const serverUrl = settings.serverUrl || 'http://localhost:8080';
    const bearerToken = settings.bearerToken || '';

    log('MAIN', '[upload-image-to-server] Uploading to:', { serverUrl, bufferSize: buffer.length, hasToken: !!bearerToken });

    // Сохраняем во временный файл для загрузки
    const tempFilePath = path.join(app.getPath('temp'), `skrinshot_upload_${Date.now()}.png`);
    const fs = require('fs');
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

ipcMain.handle('start-recording', async () => {
  // Запуск записи экрана будет реализован через renderer процесс
  return { success: true };
});

ipcMain.handle('stop-recording', async (_, videoData: Buffer, bounds: any) => {
  const settings = store.get('settings') as any;
  const template = settings.fileNameTemplate || 'recording_{YYYY}-{MM}-{DD}_{HH}-{mm}-{ss}';
  
  const now = new Date();
  const fileName = template
    .replace('{YYYY}', now.getFullYear().toString())
    .replace('{MM}', String(now.getMonth() + 1).padStart(2, '0'))
    .replace('{DD}', String(now.getDate()).padStart(2, '0'))
    .replace('{HH}', String(now.getHours()).padStart(2, '0'))
    .replace('{mm}', String(now.getMinutes()).padStart(2, '0'))
    .replace('{ss}', String(now.getSeconds()).padStart(2, '0'));
  
  const savePath = settings.savePath || app.getPath('videos');
  const fullPath = path.join(savePath, `${fileName}.mp4`);
  
  try {
    const fs = require('fs');
    fs.writeFileSync(fullPath, videoData);
    
    addToHistory({
      id: Date.now().toString(),
      date: now.toISOString(),
      type: 'video',
      localPath: fullPath,
      status: settings.autoUpload ? 'uploading' : 'pending',
      size: videoData.length,
    });
    
    if (settings.autoUpload) {
      uploadFile(fullPath);
    }
    
    return { success: true, path: fullPath };
  } catch (error) {
    console.error('Error saving video:', error);
    return { success: false, error: error };
  }
});

// App lifecycle
app.whenReady().then(() => {
  initializeSettings();
  createTray();
  createMainWindow();
  registerHotkeys();
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
