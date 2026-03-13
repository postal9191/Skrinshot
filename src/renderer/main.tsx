import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { History } from './pages/History';
import { Settings } from './pages/Settings';

const { ipcRenderer } = require('electron');

type Page = 'history' | 'settings';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('history');

  useEffect(() => {
    const unsubscribe = ipcRenderer.on('navigate', (_, page: string) => {
      setCurrentPage(page as Page);
    });

    return () => {
      unsubscribe.removeListener();
    };
  }, []);

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <h1 className="logo">📸 Skrinshot</h1>
          <nav className="nav">
            <button
              className={`nav-btn ${currentPage === 'history' ? 'active' : ''}`}
              onClick={() => setCurrentPage('history')}
            >
              История
            </button>
            <button
              className={`nav-btn ${currentPage === 'settings' ? 'active' : ''}`}
              onClick={() => setCurrentPage('settings')}
            >
              Настройки
            </button>
            <button
              className="nav-btn test-btn"
              onClick={() => ipcRenderer.send('test-capture')}
            >
              📷 ТЕСТ СКРИНШОТ
            </button>
          </nav>
        </div>
      </header>

      <main className="main">
        {currentPage === 'history' && <History />}
        {currentPage === 'settings' && <Settings />}
      </main>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
