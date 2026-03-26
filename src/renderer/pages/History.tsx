import { useState, useEffect } from 'react';

const { ipcRenderer } = require('electron');
const { shell } = require('electron');

interface HistoryItem {
  id: string;
  date: string;
  type: 'image' | 'video';
  localPath: string;
  status: 'saved' | 'pending' | 'uploading' | 'uploaded' | 'failed';
  url?: string;
  size: number;
  fileId?: string;
}

const STATUS_MAP: Record<string, { text: string; cls: string }> = {
  saved:     { text: 'Сохранён',          cls: 'st-saved' },
  pending:   { text: 'Ожидает загрузки',  cls: 'st-pending' },
  uploading: { text: 'Загружается',       cls: 'st-uploading' },
  uploaded:  { text: 'Загружен',          cls: 'st-uploaded' },
  failed:    { text: 'Ошибка',            cls: 'st-failed' },
};

export function History() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);

  useEffect(() => {
    load();
    ipcRenderer.on('history-updated', load);
    return () => { ipcRenderer.removeListener('history-updated', load); };
  }, []);

  async function load() {
    const history = await ipcRenderer.invoke('get-history');
    setItems(history || []);
    setLoading(false);
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + ' Б';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
    return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
  }

  async function deleteItem(id: string) {
    await ipcRenderer.invoke('delete-history-item', id);
    load();
  }

  async function uploadItem(item: HistoryItem) {
    setUploadWarning(null);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'uploading' } : i));
    const result = await ipcRenderer.invoke('retry-upload', item.localPath);
    if (result?.success) {
      load();
    } else {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: item.status } : i));
      if (result?.error) setUploadWarning(result.error);
    }
  }

  function copyUrl(url: string, id: string) {
    navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  function copyLocalPath(path: string, id: string) {
    navigator.clipboard.writeText(path);
    setCopied('path-' + id);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) return <div className="loading">Загрузка...</div>;

  if (items.length === 0) {
    return (
      <div className="history-empty">
        <p>История пуста</p>
        <p className="hint">Сделайте скриншот или запись экрана</p>
      </div>
    );
  }

  return (
    <div className="history">
      {uploadWarning && (
        <div className="history-warning" onClick={() => setUploadWarning(null)}>
          ⚠ {uploadWarning}
        </div>
      )}
      <table className="history-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Тип</th>
            <th>Размер</th>
            <th>Статус</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const s = STATUS_MAP[item.status] || STATUS_MAP.saved;
            const isSaved    = item.status === 'saved' || item.status === 'pending';
            const isFailed   = item.status === 'failed';
            const isUploaded = item.status === 'uploaded';
            const isUploading = item.status === 'uploading';

            return (
              <tr key={item.id}>
                <td className="td-date">{formatDate(item.date)}</td>
                <td>
                  <span className={`type-badge ${item.type === 'image' ? 'tb-image' : 'tb-video'}`}>
                    {item.type === 'image' ? '🖼 Скриншот' : '🎬 Видео'}
                  </span>
                </td>
                <td className="td-size">{formatSize(item.size)}</td>
                <td>
                  <span className={`status-badge ${s.cls}`}>{s.text}</span>
                </td>
                <td>
                  <div className="h-actions">
                    {/* Показать в папке */}
                    <button
                      className="ha-btn"
                      title="Показать в папке"
                      onClick={() => shell.showItemInFolder(item.localPath)}
                    >
                      <FolderIcon />
                    </button>

                    {/* Загрузить на сервер (для сохранённых или с ошибкой) */}
                    {(isSaved || isFailed) && (
                      <button
                        className="ha-btn ha-upload"
                        title="Загрузить на сервер"
                        onClick={() => uploadItem(item)}
                        disabled={isUploading}
                      >
                        <UploadIcon />
                      </button>
                    )}

                    {/* Копировать ссылку с сервера */}
                    {isUploaded && item.url && (
                      <button
                        className={`ha-btn ha-copy${copied === item.id ? ' ha-copied' : ''}`}
                        title={copied === item.id ? 'Скопировано!' : 'Копировать ссылку'}
                        onClick={() => copyUrl(item.url!, item.id)}
                      >
                        {copied === item.id ? <CheckIcon /> : <LinkIcon />}
                      </button>
                    )}

                    {/* Копировать локальный путь */}
                    <button
                      className={`ha-btn${copied === 'path-' + item.id ? ' ha-copied' : ''}`}
                      title={copied === 'path-' + item.id ? 'Скопировано!' : 'Копировать путь'}
                      onClick={() => copyLocalPath(item.localPath, item.id)}
                    >
                      {copied === 'path-' + item.id ? <CheckIcon /> : <PathIcon />}
                    </button>

                    {/* Удалить */}
                    <button
                      className="ha-btn ha-delete"
                      title="Удалить"
                      onClick={() => deleteItem(item.id)}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16"/>
      <line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
    </svg>
  );
}

function PathIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}
