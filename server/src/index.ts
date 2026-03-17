import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Вспомогательная функция для логирования с меткой времени
const log = (module: string, message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
  console.log(`[${timestamp}] [${module}] ${message}${dataStr}`);
};

const app = express();
const PORT = process.env.PORT || 8080;

// Директория для загрузки файлов
const UPLOAD_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  log('SERVER', `📁 Created uploads directory: ${UPLOAD_DIR}`);
}

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const date = new Date();
    const year = date.getFullYear().toString();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const computerName = process.env.COMPUTERNAME || 'unknown';

    const uploadPath = path.join(UPLOAD_DIR, year, month, computerName);
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
      log('SERVER', `📁 Created directory: ${uploadPath}`);
    }

    log('SERVER', `📂 Upload destination: ${uploadPath}`);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname);
    const filename = `${uniqueId}${ext}`;
    log('SERVER', `📝 Generated filename: ${filename} (original: ${file.originalname})`);
    cb(null, filename);
  },
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'video/mp4', 'video/webm', 'video/x-matroska'];
  log('SERVER', `🔍 File filter check: ${file.mimetype} (original: ${file.originalname})`);
  if (allowedTypes.includes(file.mimetype)) {
    log('SERVER', `✅ File type allowed: ${file.mimetype}`);
    cb(null, true);
  } else {
    log('SERVER', `❌ File type not allowed: ${file.mimetype}`);
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

// Middleware для логирования всех запросов
app.use((req, res, next) => {
  log('SERVER', `📥 ${req.method} ${req.path}`, {
    ip: req.ip,
    headers: req.headers,
    query: req.query
  });
  next();
});

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  log('SERVER', '🏥 Health check requested');
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Endpoint для загрузки изображений
app.post('/api/upload/image', upload.single('file'), (req: Request, res: Response) => {
  log('SERVER', '📸 Upload image request received');
  
  try {
    if (!req.file) {
      log('SERVER', '❌ File not found in request');
      return res.status(400).json({
        success: false,
        error: 'Файл не найден',
      });
    }

    log('SERVER', `✅ File uploaded:`, {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: req.file.path
    });

    const fileId = path.basename(req.file.filename, path.extname(req.file.filename));
    const fileName = req.file.originalname;
    const url = `${getBaseUrl(req)}/files/${getFileRelativePath(req.file)}`;

    const response = {
      success: true,
      fileId,
      fileName,
      url,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedAt: new Date().toISOString(),
    };

    log('SERVER', `📤 Response sent:`, response);
    res.json(response);
  } catch (error: any) {
    log('SERVER', `❌ Upload error:`, { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Ошибка при загрузке файла',
    });
  }
});

// Endpoint для загрузки видео
app.post('/api/upload/video', upload.single('file'), (req: Request, res: Response) => {
  log('SERVER', '🎥 Upload video request received');
  
  try {
    if (!req.file) {
      log('SERVER', '❌ File not found in request');
      return res.status(400).json({
        success: false,
        error: 'Файл не найден',
      });
    }

    log('SERVER', `✅ Video uploaded:`, {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: req.file.path
    });

    const fileId = path.basename(req.file.filename, path.extname(req.file.filename));
    const fileName = req.file.originalname;
    const url = `${getBaseUrl(req)}/files/${getFileRelativePath(req.file)}`;

    const response = {
      success: true,
      fileId,
      fileName,
      url,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedAt: new Date().toISOString(),
    };

    log('SERVER', `📤 Response sent:`, response);
    res.json(response);
  } catch (error: any) {
    log('SERVER', `❌ Upload error:`, { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Ошибка при загрузке файла',
    });
  }
});

// Endpoint для получения информации о файле
app.get('/api/files/:id', (req: Request, res: Response) => {
  const fileId = req.params.id;
  log('SERVER', `🔍 Get file info request: ${fileId}`);

  // Поиск файла в директории uploads
  const foundFile = findFileById(UPLOAD_DIR, fileId);

  if (!foundFile) {
    log('SERVER', `❌ File not found: ${fileId}`);
    return res.status(404).json({
      success: false,
      error: 'Файл не найден',
    });
  }

  const stats = fs.statSync(foundFile);
  const ext = path.extname(foundFile);
  const fileName = path.basename(foundFile);

  const response = {
    success: true,
    fileId,
    fileName,
    url: `${getBaseUrl(req)}/files/${getFileRelativePath({ path: foundFile } as Express.Multer.File)}`,
    size: stats.size,
    createdAt: stats.birthtime.toISOString(),
  };

  log('SERVER', `📤 Response sent:`, response);
  res.json(response);
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
  log('SERVER', `❌ Error handler:`, { error: err.message, stack: err.stack });
  res.status(500).json({
    success: false,
    error: err.message,
  });
});

// Запуск сервера
app.listen(PORT, () => {
  log('SERVER', `🚀 Server started on port ${PORT}`);
  log('SERVER', `📁 Files saved to: ${UPLOAD_DIR}`);
  log('SERVER', `🌐 URL: http://localhost:${PORT}`);
});
