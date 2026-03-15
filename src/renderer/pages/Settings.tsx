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
  videoMicDeviceId: string;
  videoSystemAudio: boolean;
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

function eventToAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (e.ctrlKey)  parts.push('Ctrl');
  if (e.altKey)   parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey)  parts.push('Super');

  const keyMap: Record<string, string> = {
    'PrintScreen': 'PrintScreen',
    'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4',
    'F5': 'F5', 'F6': 'F6', 'F7': 'F7', 'F8': 'F8',
    'F9': 'F9', 'F10': 'F10', 'F11': 'F11', 'F12': 'F12',
    'Home': 'Home', 'End': 'End', 'Insert': 'Insert', 'Delete': 'Delete',
    'PageUp': 'PageUp', 'PageDown': 'PageDown',
    'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right',
    'Tab': 'Tab', 'Escape': 'Escape', 'Space': 'Space',
    'Backspace': 'Backspace', 'Enter': 'Return',
  };

  let key = '';
  if (e.key in keyMap) {
    key = keyMap[e.key];
  } else if (e.key.length === 1) {
    key = e.key.toUpperCase();
  } else {
    return null;
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { setCapturing(false); inputRef.current?.blur(); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') { onChange(''); return; }
    const acc = eventToAccelerator(e.nativeEvent);
    if (acc) { onChange(acc); setCapturing(false); inputRef.current?.blur(); }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      readOnly
      className="hotkey-input"
      value={capturing ? '' : value}
      placeholder={capturing ? 'Нажмите комбинацию...' : (placeholder || 'Нажмите для назначения')}
      onFocus={() => setCapturing(true)}
      onBlur={() => setCapturing(false)}
      onKeyDown={handleKeyDown}
    />
  );
}

type Section = 'general' | 'hotkeys' | 'screenshots' | 'video' | 'server' | 'about';

const sidebarItems: { id: Section; label: string; icon: string }[] = [
  { id: 'general',     label: 'Общие',           icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'hotkeys',     label: 'Горячие клавиши', icon: 'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v10m0 0h10M9 13H5a2 2 0 00-2 2v4a2 2 0 002 2h4a2 2 0 002-2v-4a2 2 0 00-2-2zm10 0h-4a2 2 0 00-2 2v4a2 2 0 002 2h4a2 2 0 002-2v-4a2 2 0 00-2-2z' },
  { id: 'screenshots', label: 'Скриншоты',        icon: 'M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'video',       label: 'Видео',            icon: 'M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
  { id: 'server',      label: 'Сервер',           icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' },
  { id: 'about',       label: 'О программе',      icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
];

function SvgIcon({ path, size = 20 }: { path: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-track"><span className="toggle-thumb" /></span>
    </label>
  );
}

export function Settings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>('general');
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => { loadSettings(); loadMicDevices(); }, []);

  async function loadMicDevices() {
    try {
      // Запрашиваем доступ, чтобы получить названия устройств
      await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop())).catch(() => {});
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMicDevices(devices.filter(d => d.kind === 'audioinput'));
    } catch {
      // нет доступа — список пустой
    }
  }

  async function loadSettings() {
    const loaded = await ipcRenderer.invoke('get-settings');
    setSettings({ ...defaultSettings, ...loaded, hotkeys: { ...defaultSettings.hotkeys, ...(loaded?.hotkeys || {}) } });
  }

  async function saveSettings() {
    await ipcRenderer.invoke('save-settings', settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  function setHotkey(key: keyof Settings['hotkeys'], value: string) {
    setSettings(prev => ({ ...prev, hotkeys: { ...prev.hotkeys, [key]: value } }));
  }

  function renderContent() {
    switch (activeSection) {
      case 'general':
        return (
          <div className="sp-body">
            <h2 className="sp-title">Общие настройки</h2>
            <div className="sp-row">
              <div className="sp-row-label">Запускать вместе с Windows</div>
              <Toggle checked={settings.autoLaunch} onChange={v => set('autoLaunch', v)} />
            </div>
            <div className="sp-row">
              <div className="sp-row-label">Тёмная тема</div>
              <Toggle checked={settings.theme === 'dark'} onChange={v => set('theme', v ? 'dark' : 'light')} />
            </div>
          </div>
        );

      case 'hotkeys':
        return (
          <div className="sp-body">
            <h2 className="sp-title">Горячие клавиши</h2>
            <p className="sp-hint">Кликните на поле и нажмите нужную комбинацию. Delete — очистить.</p>
            <div className="sp-field">
              <label>Скриншот всего экрана</label>
              <HotkeyInput value={settings.hotkeys.capture} onChange={v => setHotkey('capture', v)} placeholder="PrintScreen" />
            </div>
            <div className="sp-field">
              <label>Скриншот области</label>
              <HotkeyInput value={settings.hotkeys.captureArea} onChange={v => setHotkey('captureArea', v)} placeholder="Ctrl+PrintScreen" />
            </div>
            <div className="sp-field">
              <label>Запись экрана</label>
              <HotkeyInput value={settings.hotkeys.record} onChange={v => setHotkey('record', v)} placeholder="Shift+PrintScreen" />
            </div>
            <div className="sp-field">
              <label>Запись области</label>
              <HotkeyInput value={settings.hotkeys.recordArea} onChange={v => setHotkey('recordArea', v)} placeholder="Ctrl+Shift+PrintScreen" />
            </div>
          </div>
        );

      case 'screenshots':
        return (
          <div className="sp-body">
            <h2 className="sp-title">Скриншоты</h2>
            <div className="sp-field">
              <label>Папка сохранения</label>
              <div className="sp-input-row">
                <input type="text" value={settings.savePath} onChange={e => set('savePath', e.target.value)} placeholder="C:\Users\...\Pictures" />
                <button className="sp-btn-outline" onClick={() => {}}>Обзор</button>
              </div>
            </div>
            <div className="sp-field">
              <label>Шаблон имени файла</label>
              <input type="text" value={settings.fileNameTemplate} onChange={e => set('fileNameTemplate', e.target.value)} placeholder="screenshot_{YYYY}-{MM}-{DD}_{HH}-{mm}-{ss}" />
              <span className="sp-small">Переменные: {'{YYYY}'} {'{MM}'} {'{DD}'} {'{HH}'} {'{mm}'} {'{ss}'}</span>
            </div>
            <div className="sp-field">
              <label>Формат изображения</label>
              <div className="sp-radio-group">
                <label className="sp-radio">
                  <input type="radio" name="imgfmt" value="png" checked={settings.imageFormat === 'png'} onChange={() => set('imageFormat', 'png')} />
                  <span>PNG — без потерь</span>
                </label>
                <label className="sp-radio">
                  <input type="radio" name="imgfmt" value="jpg" checked={settings.imageFormat === 'jpg'} onChange={() => set('imageFormat', 'jpg')} />
                  <span>JPG — меньший размер</span>
                </label>
              </div>
            </div>
            {settings.imageFormat === 'jpg' && (
              <div className="sp-field">
                <label>Качество JPG: {settings.imageQuality}%</label>
                <input type="range" min={10} max={100} value={settings.imageQuality} onChange={e => set('imageQuality', parseInt(e.target.value))} />
              </div>
            )}
          </div>
        );

      case 'video':
        return (
          <div className="sp-body">
            <h2 className="sp-title">Видео</h2>
            <div className="sp-field">
              <label>Частота кадров (FPS)</label>
              <div className="sp-btn-group">
                {([15, 30, 60] as const).map(fps => (
                  <button key={fps} className={`sp-btn-seg${settings.videoFps === fps ? ' active' : ''}`} onClick={() => set('videoFps', fps)}>
                    {fps} FPS
                  </button>
                ))}
              </div>
            </div>
            <div className="sp-field">
              <label>Битрейт</label>
              <div className="sp-btn-group">
                {[['2M','2 Mbps'],['5M','5 Mbps'],['10M','10 Mbps'],['20M','20 Mbps']].map(([v, l]) => (
                  <button key={v} className={`sp-btn-seg${settings.videoBitrate === v ? ' active' : ''}`} onClick={() => set('videoBitrate', v)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="sp-audio-section">
              <div className="sp-audio-row">
                <span className="sp-audio-label">Микрофон</span>
                <select
                  className="sp-select"
                  value={settings.videoMicDeviceId}
                  onChange={e => set('videoMicDeviceId', e.target.value)}
                >
                  <option value="">Отключён</option>
                  {micDevices.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Микрофон ${d.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sp-audio-row">
                <span className="sp-audio-label">Системный звук</span>
                <select
                  className="sp-select"
                  value={settings.videoSystemAudio ? 'on' : ''}
                  onChange={e => set('videoSystemAudio', e.target.value === 'on')}
                >
                  <option value="">Отключён</option>
                  <option value="on">Включён (loopback)</option>
                </select>
              </div>
            </div>
          </div>
        );

      case 'server':
        return (
          <div className="sp-body">
            <h2 className="sp-title">Загрузка на сервер</h2>
            <div className="sp-field">
              <label>Адрес сервера</label>
              <input type="text" value={settings.serverUrl} onChange={e => set('serverUrl', e.target.value)} placeholder="http://192.168.1.100:8080" />
            </div>
            <div className="sp-field">
              <label>Bearer Token</label>
              <input type="password" value={settings.bearerToken} onChange={e => set('bearerToken', e.target.value)} placeholder="Токен авторизации (опционально)" />
            </div>
            <div className="sp-row">
              <div className="sp-row-label">Автоматически загружать после создания</div>
              <Toggle checked={settings.autoUpload} onChange={v => set('autoUpload', v)} />
            </div>
          </div>
        );

      case 'about':
        return (
          <div className="sp-body">
            <h2 className="sp-title">О программе</h2>
            <div className="sp-about">
              <div className="sp-about-icon">
                <SvgIcon path={sidebarItems[2].icon} size={40} />
              </div>
              <div className="sp-about-name">Skrinshot</div>
              <div className="sp-about-ver">Версия 1.0.0</div>
              <div className="sp-about-desc">
                Инструмент для скриншотов и записи экрана с загрузкой в локальную сеть
              </div>
            </div>
          </div>
        );
    }
  }

  return (
    <div className="settings-layout">
      <aside className="settings-sidebar">
        {sidebarItems.map(item => (
          <button
            key={item.id}
            className={`sidebar-item${activeSection === item.id ? ' active' : ''}`}
            onClick={() => setActiveSection(item.id)}
          >
            <SvgIcon path={item.icon} size={18} />
            <span>{item.label}</span>
          </button>
        ))}
      </aside>

      <div className="settings-content">
        {renderContent()}
        <div className="sp-footer">
          <button className="sp-save" onClick={saveSettings}>Сохранить</button>
          {saved && <span className="sp-saved">Сохранено</span>}
        </div>
      </div>
    </div>
  );
}
