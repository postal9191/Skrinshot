import { useState, useEffect, useRef } from 'react';

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
    recordArea: string;
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
    recordArea: 'Ctrl+Shift+PrintScreen',
  },
  autoLaunch: false,
  theme: 'light',
};

// Преобразует KeyboardEvent в строку акселератора Electron
function eventToAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = [];

  if (e.ctrlKey)  parts.push('Ctrl');
  if (e.altKey)   parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey)  parts.push('Super');

  const keyMap: Record<string, string> = {
    'PrintScreen':   'PrintScreen',
    'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4',
    'F5': 'F5', 'F6': 'F6', 'F7': 'F7', 'F8': 'F8',
    'F9': 'F9', 'F10': 'F10', 'F11': 'F11', 'F12': 'F12',
    'Home': 'Home', 'End': 'End', 'Insert': 'Insert', 'Delete': 'Delete',
    'PageUp': 'PageUp', 'PageDown': 'PageDown',
    'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right',
    'Tab': 'Tab', 'Escape': 'Escape', 'Space': 'Space',
    'Backspace': 'Backspace', 'Enter': 'Return',
    'NumLock': 'NumLock', 'ScrollLock': 'Scrolllock', 'CapsLock': 'Capslock',
    'Pause': 'Pause',
  };

  let key = '';

  if (e.key in keyMap) {
    key = keyMap[e.key];
  } else if (e.key.length === 1) {
    key = e.key.toUpperCase();
  } else {
    return null; // только модификатор — не записываем
  }

  if (!key) return null;
  parts.push(key);
  return parts.join('+');
}

interface HotkeyInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

function HotkeyInput({ value, onChange, placeholder }: HotkeyInputProps) {
  const [capturing, setCapturing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFocus() {
    setCapturing(true);
  }

  function handleBlur() {
    setCapturing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      setCapturing(false);
      inputRef.current?.blur();
      return;
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      onChange('');
      return;
    }

    const acc = eventToAccelerator(e.nativeEvent);
    if (acc) {
      onChange(acc);
      setCapturing(false);
      inputRef.current?.blur();
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      readOnly
      value={capturing ? '...' : value}
      placeholder={capturing ? 'Нажмите комбинацию клавиш' : (placeholder || 'Нажмите для назначения')}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      style={{ cursor: 'pointer', caretColor: 'transparent' }}
      title="Кликните и нажмите нужную комбинацию клавиш"
    />
  );
}

export function Settings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    const loaded = await ipcRenderer.invoke('get-settings');
    setSettings({ ...defaultSettings, ...loaded, hotkeys: { ...defaultSettings.hotkeys, ...(loaded?.hotkeys || {}) } });
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
        <small style={{ display: 'block', marginBottom: 12, opacity: 0.6 }}>
          Кликните на поле и нажмите нужную комбинацию. Delete — очистить.
        </small>

        <div className="form-group">
          <label>Скриншот всего экрана</label>
          <HotkeyInput
            value={settings.hotkeys.capture}
            onChange={(v) => handleHotkeyChange('capture', v)}
            placeholder="PrintScreen"
          />
        </div>

        <div className="form-group">
          <label>Скриншот области</label>
          <HotkeyInput
            value={settings.hotkeys.captureArea}
            onChange={(v) => handleHotkeyChange('captureArea', v)}
            placeholder="Ctrl+PrintScreen"
          />
        </div>

        <div className="form-group">
          <label>Запись экрана</label>
          <HotkeyInput
            value={settings.hotkeys.record}
            onChange={(v) => handleHotkeyChange('record', v)}
            placeholder="Shift+PrintScreen"
          />
        </div>

        <div className="form-group">
          <label>Запись области</label>
          <HotkeyInput
            value={settings.hotkeys.recordArea}
            onChange={(v) => handleHotkeyChange('recordArea', v)}
            placeholder="Ctrl+Shift+PrintScreen"
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
