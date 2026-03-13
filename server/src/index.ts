import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = process.env.PORT || 8080;

// Директория для загрузки файлов
const UPLOAD_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const date = new Date();
    const year = date.getFullYear().toString();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    
    const uploadPath = path.join(UPLOAD_DIR, year, month);
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueId}${ext}`);
  },
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'video/mp4'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Недопустимый тип файла'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500 MB
  },
});

// Middleware
app.use(express.json());
app.use('/files', express.static(UPLOAD_DIR));

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Endpoint для загрузки изображений
app.post('/api/upload/image', upload.single('file'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Файл не найден',
      });
    }

    const fileId = path.basename(req.file.filename, path.extname(req.file.filename));
    const fileName = req.file.originalname;
    const url = `${getBaseUrl(req)}/files/${getFileRelativePath(req.file)}`;
    
    res.json({
      success: true,
      fileId,
      fileName,
      url,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка при загрузке файла',
    });
  }
});

// Endpoint для загрузки видео
app.post('/api/upload/video', upload.single('file'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Файл не найден',
      });
    }

    const fileId = path.basename(req.file.filename, path.extname(req.file.filename));
    const fileName = req.file.originalname;
    const url = `${getBaseUrl(req)}/files/${getFileRelativePath(req.file)}`;
    
    res.json({
      success: true,
      fileId,
      fileName,
      url,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка при загрузке файла',
    });
  }
});

// Endpoint для получения информации о файле
app.get('/api/files/:id', (req: Request, res: Response) => {
  const fileId = req.params.id;
  
  // Поиск файла в директории uploads
  const foundFile = findFileById(UPLOAD_DIR, fileId);
  
  if (!foundFile) {
    return res.status(404).json({
      success: false,
      error: 'Файл не найден',
    });
  }
  
  const stats = fs.statSync(foundFile);
  const ext = path.extname(foundFile);
  const fileName = path.basename(foundFile);
  
  res.json({
    success: true,
    fileId,
    fileName,
    url: `${getBaseUrl(req)}/files/${getFileRelativePath({ path: foundFile } as Express.Multer.File)}`,
    size: stats.size,
    createdAt: stats.birthtime.toISOString(),
  });
});

// Вспомогательные функции
function getBaseUrl(req: Request): string {
  const protocol = req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}`;
}

function getFileRelativePath(file: Express.Multer.File): string {
  const relativePath = path.relative(UPLOAD_DIR, file.path);
  // Заменяем обратные слеши на прямые для URL
  return relativePath.replace(/\\/g, '/');
}

function findFileById(dir: string, fileId: string): string | null {
  if (!fs.existsSync(dir)) {
    return null;
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      const found = findFileById(fullPath, fileId);
      if (found) return found;
    } else {
      const name = path.basename(entry.name, path.extname(entry.name));
      if (name === fileId) {
        return fullPath;
      }
    }
  }
  
  return null;
}

// Обработка ошибок
app.use((err: Error, req: Request, res: Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: err.message,
  });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📁 Файлы сохраняются в: ${UPLOAD_DIR}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
});
