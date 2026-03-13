import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './styles/editor.css';

const { ipcRenderer } = require('electron');
const fs = require('fs');

type Tool = 'select' | 'arrow' | 'line' | 'rectangle' | 'ellipse' | 'text' | 'marker' | 'blur';

interface DrawingElement {
  type: Tool;
  points: { x: number; y: number }[];
  color: string;
  lineWidth: number;
  text?: string;
  bounds?: { x: number; y: number; width: number; height: number };
}

function Editor() {
  const [imagePath, setImagePath] = useState<string>('');
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState('#ff0000');
  const [lineWidth, setLineWidth] = useState(3);
  const [elements, setElements] = useState<DrawingElement[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (_: any, path: string) => {
      setImagePath(path);
      loadImage(path);
    };

    ipcRenderer.on('load-image', handler);

    return () => {
      ipcRenderer.removeListener('load-image', handler);
    };
  }, []);

  useEffect(() => {
    if (image && canvasRef.current) {
      draw();
    }
  }, [image, elements]);

  function loadImage(path: string) {
    // Корректно подготавливаем локальный путь к файлу для Electron
    let src = path;
    if (!path.startsWith('file://')) {
      const normalized = path.replace(/\\/g, '/');
      // Для путей вида C:/... нужен формат file:///C:/...
      if (/^[a-zA-Z]:/.test(normalized)) {
        src = `file:///${normalized}`;
      } else {
        src = `file://${normalized}`;
      }
    }

    const img = new Image();
    img.onload = () => {
      setImage(img);
      if (canvasRef.current) {
        canvasRef.current.width = img.width;
        canvasRef.current.height = img.height;
      }
    };
    img.onerror = (e) => {
      console.error('[EDITOR] Image load error', { src, path, event: e });
    };
    img.src = src;
  }

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Очищаем и рисуем изображение
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);

    // Рисуем все элементы
    elements.forEach((el) => {
      drawElement(ctx, el);
    });

    // Рисуем текущий элемент
    if (currentPoints.length > 0) {
      drawElement(ctx, {
        type: tool,
        points: currentPoints,
        color,
        lineWidth,
      });
    }
  }

  function drawElement(ctx: CanvasRenderingContext2D, el: DrawingElement) {
    if (el.points.length < 1) return;

    ctx.strokeStyle = el.color;
    ctx.fillStyle = el.color;
    ctx.lineWidth = el.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (el.type) {
      case 'arrow':
        if (el.points.length >= 2) {
          drawArrow(ctx, el.points[0], el.points[el.points.length - 1]);
        }
        break;
      case 'line':
        if (el.points.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(el.points[0].x, el.points[0].y);
          ctx.lineTo(el.points[el.points.length - 1].x, el.points[el.points.length - 1].y);
          ctx.stroke();
        }
        break;
      case 'rectangle':
        if (el.points.length >= 2) {
          const start = el.points[0];
          const end = el.points[el.points.length - 1];
          const width = end.x - start.x;
          const height = end.y - start.y;
          ctx.strokeRect(start.x, start.y, width, height);
        }
        break;
      case 'ellipse':
        if (el.points.length >= 2) {
          const start = el.points[0];
          const end = el.points[el.points.length - 1];
          const centerX = (start.x + end.x) / 2;
          const centerY = (start.y + end.y) / 2;
          const radiusX = Math.abs(end.x - start.x) / 2;
          const radiusY = Math.abs(end.y - start.y) / 2;
          ctx.beginPath();
          ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
          ctx.stroke();
        }
        break;
      case 'marker':
        if (el.points.length >= 2) {
          ctx.globalAlpha = 0.3;
          ctx.beginPath();
          ctx.moveTo(el.points[0].x, el.points[0].y);
          for (let i = 1; i < el.points.length; i++) {
            ctx.lineTo(el.points[i].x, el.points[i].y);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        break;
      case 'text':
        if (el.text && el.points.length >= 1) {
          ctx.font = `${20 + el.lineWidth * 5}px Arial`;
          ctx.fillText(el.text, el.points[0].x, el.points[0].y);
        }
        break;
      case 'blur':
        if (el.points.length >= 2) {
          const start = el.points[0];
          const end = el.points[el.points.length - 1];
          const x = Math.min(start.x, end.x);
          const y = Math.min(start.y, end.y);
          const width = Math.abs(end.x - start.x);
          const height = Math.abs(end.y - start.y);
          if (width > 0 && height > 0) {
            const imageData = ctx.getImageData(x, y, width, height);
            ctx.putImageData(imageData, x, y);
            // Применяем размытие через фильтр
            ctx.filter = 'blur(10px)';
            ctx.drawImage(ctx.canvas, x, y, width, height, x, y, width, height);
            ctx.filter = 'none';
          }
        }
        break;
    }
  }

  function drawArrow(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }) {
    const headLength = 15 + ctx.lineWidth;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    // Рисуем наконечник стрелки
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(
      to.x - headLength * Math.cos(angle - Math.PI / 6),
      to.y - headLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      to.x - headLength * Math.cos(angle + Math.PI / 6),
      to.y - headLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  }

  function getMousePos(e: React.MouseEvent): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (tool === 'select') return;

    const pos = getMousePos(e);
    setIsDrawing(true);
    setCurrentPoints([pos]);

    if (tool === 'text') {
      const text = prompt('Введите текст:', 'Текст');
      if (text) {
        setElements((prev) => [
          ...prev,
          {
            type: 'text',
            points: [pos],
            color,
            lineWidth,
            text,
          },
        ]);
      }
      setIsDrawing(false);
      setCurrentPoints([]);
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isDrawing) return;

    const pos = getMousePos(e);
    setCurrentPoints((prev) => [...prev, pos]);
  }

  function handleMouseUp() {
    if (!isDrawing) return;

    setIsDrawing(false);

    if (currentPoints.length > 0) {
      setElements((prev) => [
        ...prev,
        {
          type: tool,
          points: currentPoints,
          color,
          lineWidth,
        },
      ]);
    }
    setCurrentPoints([]);
  }

  function handleUndo() {
    setElements((prev) => prev.slice(0, -1));
  }

  function handleClear() {
    setElements([]);
  }

  async function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas || !imagePath) return;

    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [EDITOR] 💾 Saving image...`);

    try {
      // Отправляем в main процесс для сохранения
      const dataUrl = canvas.toDataURL('image/png');
      const buffer = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
      console.log(`[${timestamp}] [EDITOR] 📦 Buffer size:`, buffer.length, 'bytes');
      
      const result = await ipcRenderer.invoke('save-edited-image', buffer);
      console.log(`[${timestamp}] [EDITOR] 📥 Save result:`, result);

      if (result?.success) {
        console.log(`[${timestamp}] [EDITOR] ✅ Image saved successfully`);
        // Закрываем редактор через IPC
        ipcRenderer.send('close-editor-window');
      }
    } catch (error) {
      console.error(`[${timestamp}] [EDITOR] ❌ Save error:`, error);
    }
  }

  async function handleSaveAs() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [EDITOR] 💾 Save As...`);

    try {
      const dataUrl = canvas.toDataURL('image/png');
      const buffer = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');

      // Отправляем в main процесс для сохранения
      const result = await ipcRenderer.invoke('save-edited-image', buffer);
      console.log(`[${timestamp}] [EDITOR] 📥 Save As result:`, result);

      if (result?.success) {
        console.log(`[${timestamp}] [EDITOR] ✅ Image saved successfully`);
        // Закрываем редактор через IPC
        ipcRenderer.send('close-editor-window');
      }
    } catch (error) {
      console.error(`[${timestamp}] [EDITOR] ❌ Save As error:`, error);
    }
  }

  async function handleCopy() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [EDITOR] 📋 Copying to clipboard...`);

    try {
      // Конвертируем canvas в буфер и отправляем в main процесс для копирования
      const dataUrl = canvas.toDataURL('image/png');
      const buffer = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
      console.log(`[${timestamp}] [EDITOR] 📦 Buffer size:`, buffer.length, 'bytes');

      // Копируем изображение через IPC
      await ipcRenderer.invoke('copy-image-to-clipboard', buffer);
      console.log(`[${timestamp}] [EDITOR] ✅ Image copied to clipboard`);
    } catch (error) {
      console.error(`[${timestamp}] [EDITOR] ❌ Copy error:`, error);
      alert('Ошибка при копировании в буфер обмена');
    }
  }

  async function handleUploadToServer() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [EDITOR] 📤 Starting upload to server`);

    try {
      console.log(`[${timestamp}] [EDITOR] 🖼️ Converting canvas to data URL...`);
      const dataUrl = canvas.toDataURL('image/png');
      console.log(`[${timestamp}] [EDITOR] 🔄 Converting data URL to buffer...`);
      const buffer = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
      console.log(`[${timestamp}] [EDITOR] 📦 Image buffer size:`, buffer.length, 'bytes');

      // Отправляем в main процесс для загрузки на сервер
      console.log(`[${timestamp}] [EDITOR] 📡 Sending to main process...`);
      console.log(`[${timestamp}] [EDITOR] 📊 Buffer details:`, {
        length: buffer.length,
        type: typeof buffer,
        isBuffer: Buffer.isBuffer(buffer)
      });
      console.log(`[${timestamp}] [EDITOR] 🚀 Initiating IPC call to upload-image-to-server...`);
      const result = await ipcRenderer.invoke('upload-image-to-server', buffer);
      console.log(`[${timestamp}] [EDITOR] ✅ IPC call completed, received response:`, result);

      if (result?.success) {
        console.log(`[${timestamp}] [EDITOR] ✅ Uploaded to server:`, result.url);
        // Копируем ссылку в буфер
        console.log(`[${timestamp}] [EDITOR] 📋 Copying URL to clipboard...`);
        try {
          await navigator.clipboard.writeText(result.url);
          console.log(`[${timestamp}] [EDITOR] ✅ URL copied to clipboard`);
        } catch (clipboardError: any) {
          console.error(`[${timestamp}] [EDITOR] ❌ Clipboard error:`, {
            message: clipboardError.message,
            stack: clipboardError.stack
          });
        }
        alert(`Загружено на сервер!\nСсылка скопирована в буфер:\n${result.url}`);
        // Закрываем редактор
        console.log(`[${timestamp}] [EDITOR] 🚪 Closing editor window...`);
        ipcRenderer.send('close-editor-window');
      } else {
        console.error(`[${timestamp}] [EDITOR] ❌ Server error:`, result?.error);
        alert(`Ошибка загрузки: ${result?.error || 'Неизвестная ошибка'}`);
      }
    } catch (error: any) {
      console.error(`[${timestamp}] [EDITOR] ❌ Upload error:`, {
        message: error.message,
        stack: error.stack,
        name: error.name,
        source: 'handleUploadToServer'
      });
      alert('Ошибка при загрузке на сервер');
    }
  }

  return (
    <div className="editor">
      <div className="toolbar">
        <div className="tool-group">
          <button
            className={`tool-btn ${tool === 'select' ? 'active' : ''}`}
            onClick={() => setTool('select')}
            title="Выделение"
          >
            👆
          </button>
          <button
            className={`tool-btn ${tool === 'arrow' ? 'active' : ''}`}
            onClick={() => setTool('arrow')}
            title="Стрелка"
          >
            ➡️
          </button>
          <button
            className={`tool-btn ${tool === 'line' ? 'active' : ''}`}
            onClick={() => setTool('line')}
            title="Линия"
          >
            ╱
          </button>
          <button
            className={`tool-btn ${tool === 'rectangle' ? 'active' : ''}`}
            onClick={() => setTool('rectangle')}
            title="Прямоугольник"
          >
            ⬜
          </button>
          <button
            className={`tool-btn ${tool === 'ellipse' ? 'active' : ''}`}
            onClick={() => setTool('ellipse')}
            title="Эллипс"
          >
            ⭕
          </button>
          <button
            className={`tool-btn ${tool === 'text' ? 'active' : ''}`}
            onClick={() => setTool('text')}
            title="Текст"
          >
            T
          </button>
          <button
            className={`tool-btn ${tool === 'marker' ? 'active' : ''}`}
            onClick={() => setTool('marker')}
            title="Маркер"
          >
            🖍️
          </button>
          <button
            className={`tool-btn ${tool === 'blur' ? 'active' : ''}`}
            onClick={() => setTool('blur')}
            title="Размытие"
          >
            💫
          </button>
        </div>

        <div className="tool-group">
          <label>
            Цвет:
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <label>
            Толщина:
            <input
              type="range"
              min="1"
              max="10"
              value={lineWidth}
              onChange={(e) => setLineWidth(parseInt(e.target.value))}
            />
          </label>
        </div>

        <div className="tool-group">
          <button onClick={handleUndo} title="Отменить">
            ↩️
          </button>
          <button onClick={handleClear} title="Очистить">
            🗑️
          </button>
        </div>

        <div className="tool-group actions">
          <button className="btn-secondary" onClick={handleCopy}>
            📋 Копировать
          </button>
          <button className="btn-secondary" onClick={handleUploadToServer}>
            ☁️ На сервер
          </button>
          <button className="btn-primary" onClick={handleSave}>
            💾 Сохранить
          </button>
        </div>
      </div>

      <div className="canvas-container" ref={containerRef}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className={tool !== 'select' ? 'drawing' : ''}
        />
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<Editor />);
