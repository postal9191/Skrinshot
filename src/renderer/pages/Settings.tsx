import { useState, useEffect } from 'react';

const { ipcRenderer } = require('electron');

interface Settings {
  savePath: string;
  serverUrl: string;
  bearerToken: string;
  autoUpload: boolean;
  imageFormat: 'png' | 'jpg';
  imageQuality: number;
  videoFps: 15 | 30 | 60;
  videoBitrate: string;
  fileNameTemplate: string;
  hotkeys: {
    capture: string;
    captureArea: string;
    record: string;
  };
  autoLaunch: boolean;
  theme: 'light' | 'dark';
}

const defaultSettings: Settings = {
  savePath: '',
  serverUrl: 'http://localhost:8080',
  bearerToken: '',
  autoUpload: false,
  imageFormat: 'png',
  imageQuality: 90,
  videoFps: 30,
  videoBitrate: '5M',
  fileNameTemplate: 'screenshot_{YYYY}-{MM}-{DD}_{HH}-{mm}-{ss}',
  hotkeys: {
    capture: 'PrintScreen',
    captureArea: 'Ctrl+PrintScreen',
    record: 'Shift+PrintScreen',
  },
  autoLaunch: false,
  theme: 'light',
};

export function Settings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    const loaded = await ipcRenderer.invoke('get-settings');
    setSettings({ ...defaultSettings, ...loaded });
  }

  async function saveSettings() {
    await ipcRenderer.invoke('save-settings', settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleChange<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function handleHotkeyChange(key: keyof Settings['hotkeys'], value: string) {
    setSettings((prev) => ({
      ...prev,
      hotkeys: { ...prev.hotkeys, [key]: value },
    }));
  }

  return (
    <div className="settings">
      <div className="settings-section">
        <h2>📁 Сохранение файлов</h2>
        
        <div className="form-group">
          <label>Папка для сохранения</label>
          <div className="input-with-btn">
            <input
              type="text"
              value={settings.savePath}
              onChange={(e) => handleChange('savePath', e.target.value)}
              placeholder="C:\Users\...\Pictures"
            />
            <button onClick={() => {/* TODO: folder picker */}}>
              Обзор
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>Шаблон имени файла</label>
          <input
            type="text"
            value={settings.fileNameTemplate}
            onChange={(e) => handleChange('fileNameTemplate', e.target.value)}
            placeholder="screenshot_{YYYY}-{MM}-{DD}_{HH}-{mm}-{ss}"
          />
          <small>
            Доступные переменные: {'{YYYY}'}, {'{MM}'}, {'{DD}'}, {'{HH}'}, {'{mm}'}, {'{ss}'}
          </small>
        </div>
      </div>

      <div className="settings-section">
        <h2>🖼️ Изображения</h2>
        
        <div className="form-group">
          <label>Формат</label>
          <select
            value={settings.imageFormat}
            onChange={(e) => handleChange('imageFormat', e.target.value as 'png' | 'jpg')}
          >
            <option value="png">PNG (без потерь)</option>
            <option value="jpg">JPG (меньший размер)</option>
          </select>
        </div>

        {settings.imageFormat === 'jpg' && (
          <div className="form-group">
            <label>Качество JPG: {settings.imageQuality}%</label>
            <input
              type="range"
              min="10"
              max="100"
              value={settings.imageQuality}
              onChange={(e) => handleChange('imageQuality', parseInt(e.target.value))}
            />
          </div>
        )}
      </div>

      <div className="settings-section">
        <h2>🎥 Видео</h2>
        
        <div className="form-group">
          <label>FPS (кадров в секунду)</label>
          <select
            value={settings.videoFps}
            onChange={(e) => handleChange('videoFps', parseInt(e.target.value) as 15 | 30 | 60)}
          >
            <option value={15}>15 FPS</option>
            <option value={30}>30 FPS</option>
            <option value={60}>60 FPS</option>
          </select>
        </div>

        <div className="form-group">
          <label>Битрейт</label>
          <select
            value={settings.videoBitrate}
            onChange={(e) => handleChange('videoBitrate', e.target.value)}
          >
            <option value="2M">2 Mbps (низкое качество)</option>
            <option value="5M">5 Mbps (среднее качество)</option>
            <option value="10M">10 Mbps (высокое качество)</option>
            <option value="20M">20 Mbps (максимальное качество)</option>
          </select>
        </div>
      </div>

      <div className="settings-section">
        <h2>☁️ Загрузка на сервер</h2>
        
        <div className="form-group">
          <label>Адрес сервера</label>
          <input
            type="text"
            value={settings.serverUrl}
            onChange={(e) => handleChange('serverUrl', e.target.value)}
            placeholder="http://192.168.1.100:8080"
          />
        </div>

        <div className="form-group">
          <label>Bearer Token (опционально)</label>
          <input
            type="password"
            value={settings.bearerToken}
            onChange={(e) => handleChange('bearerToken', e.target.value)}
            placeholder="Ваш токен авторизации"
          />
        </div>

        <div className="form-group checkbox">
          <label>
            <input
              type="checkbox"
              checked={settings.autoUpload}
              onChange={(e) => handleChange('autoUpload', e.target.checked)}
            />
            Автоматическая загрузка после создания
          </label>
        </div>
      </div>

      <div className="settings-section">
        <h2>⌨️ Горячие клавиши</h2>
        
        <div className="form-group">
          <label>Скриншот всего экрана</label>
          <input
            type="text"
            value={settings.hotkeys.capture}
            onChange={(e) => handleHotkeyChange('capture', e.target.value)}
            placeholder="PrintScreen"
          />
        </div>

        <div className="form-group">
          <label>Скриншот области</label>
          <input
            type="text"
            value={settings.hotkeys.captureArea}
            onChange={(e) => handleHotkeyChange('captureArea', e.target.value)}
            placeholder="Ctrl+PrintScreen"
          />
        </div>

        <div className="form-group">
          <label>Запись экрана</label>
          <input
            type="text"
            value={settings.hotkeys.record}
            onChange={(e) => handleHotkeyChange('record', e.target.value)}
            placeholder="Shift+PrintScreen"
          />
        </div>
      </div>

      <div className="settings-section">
        <h2>🎨 Интерфейс</h2>
        
        <div className="form-group">
          <label>Тема</label>
          <select
            value={settings.theme}
            onChange={(e) => handleChange('theme', e.target.value as 'light' | 'dark')}
          >
            <option value="light">Светлая</option>
            <option value="dark">Тёмная</option>
          </select>
        </div>

        <div className="form-group checkbox">
          <label>
            <input
              type="checkbox"
              checked={settings.autoLaunch}
              onChange={(e) => handleChange('autoLaunch', e.target.checked)}
            />
            Запускать вместе с Windows
          </label>
        </div>
      </div>

      <div className="settings-actions">
        <button className="btn-primary" onClick={saveSettings}>
          Сохранить настройки
        </button>
        {saved && <span className="save-hint">✓ Сохранено</span>}
      </div>
    </div>
  );
}
