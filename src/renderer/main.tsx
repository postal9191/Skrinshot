import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { History } from './pages/History';
import { Settings } from './pages/Settings';

const { ipcRenderer } = require('electron');

type Page = 'history' | 'settings';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('history');

  useEffect(() => {
    const handler = (_: any, page: string) => {
      setCurrentPage(page as Page);
    };
    ipcRenderer.on('navigate', handler);

    return () => {
      ipcRenderer.removeListener('navigate', handler);
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
          </nav>
        </div>
      </header>

      <main className="main">
        {currentPage === 'history' && <div className="main-padded"><History /></div>}
        {currentPage === 'settings' && <Settings />}
      </main>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
