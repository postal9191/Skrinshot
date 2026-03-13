import React, { useState, useEffect } from 'react';

const { ipcRenderer } = require('electron');

interface HistoryItem {
  id: string;
  date: string;
  type: 'image' | 'video';
  localPath: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'failed';
  url?: string;
  size: number;
  fileId?: string;
}

export function History() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    const history = await ipcRenderer.invoke('get-history');
    setItems(history);
    setLoading(false);
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + ' Б';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
    return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
  }

  async function deleteItem(id: string) {
    await ipcRenderer.invoke('delete-history-item', id);
    loadHistory();
  }

  async function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    alert('Ссылка скопирована в буфер обмена');
  }

  async function retryUpload(item: HistoryItem) {
    const result = await ipcRenderer.invoke('retry-upload', item.localPath);
    if (result?.success) {
      loadHistory();
    }
  }

  function getStatusBadge(status: string) {
    const statuses: Record<string, { text: string; className: string }> = {
      pending: { text: 'Ожидает', className: 'status-pending' },
      uploading: { text: 'Загрузка', className: 'status-uploading' },
      uploaded: { text: 'Загружен', className: 'status-uploaded' },
      failed: { text: 'Ошибка', className: 'status-failed' },
    };
    const s = statuses[status] || statuses.pending;
    return <span className={`status-badge ${s.className}`}>{s.text}</span>;
  }

  function openFile(path: string) {
    const shell = require('electron').shell;
    shell.showItemInFolder(path);
  }

  if (loading) {
    return <div className="loading">Загрузка...</div>;
  }

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
          {items.map((item) => (
            <tr key={item.id}>
              <td>{formatDate(item.date)}</td>
              <td>
                <span className="type-badge">
                  {item.type === 'image' ? '🖼️ Скриншот' : '🎥 Видео'}
                </span>
              </td>
              <td>{formatSize(item.size)}</td>
              <td>{getStatusBadge(item.status)}</td>
              <td>
                <div className="actions">
                  <button onClick={() => openFile(item.localPath)} title="Показать в папке">
                    📁
                  </button>
                  {item.url && (
                    <button onClick={() => copyUrl(item.url)} title="Копировать ссылку">
                      🔗
                    </button>
                  )}
                  {item.status === 'failed' && (
                    <button onClick={() => retryUpload(item)} title="Повторить загрузку">
                      🔄
                    </button>
                  )}
                  <button onClick={() => deleteItem(item.id)} title="Удалить">
                    🗑️
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
