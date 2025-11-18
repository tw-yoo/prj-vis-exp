const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const PORT = Number(process.env.PORT) || 4321;
const ROOT_DIR = __dirname;
const IMAGE_DIR = path.join(ROOT_DIR, 'chartqa_images_train_shuffled');
const LOG_FILE = path.join(ROOT_DIR, 'classification_log.csv');
const LOG_HEADER = 'timestamp,action,filename,label,from,to\n';
const STATIC_FILES = new Map([
  ['/index.html', 'index.html'],
  ['/style.css', 'style.css'],
]);

const CLASS_PATHS = {
  1: path.join(ROOT_DIR, 'eligible', 'bar_simple'),
  2: path.join(ROOT_DIR, 'eligible', 'bar_stacked'),
  3: path.join(ROOT_DIR, 'eligible', 'bar_grouped'),
  4: path.join(ROOT_DIR, 'eligible', 'line_simple'),
  5: path.join(ROOT_DIR, 'eligible', 'line_multiple'),
  0: path.join(ROOT_DIR, 'not_eligible'),
};

const moveHistory = [];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

async function ensureDestinationDirectories() {
  await Promise.all(
    Object.values(CLASS_PATHS).map((dirPath) => fsp.mkdir(dirPath, { recursive: true }))
  );
}

async function ensureLogFile() {
  try {
    await fsp.access(LOG_FILE, fs.constants.F_OK);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fsp.writeFile(LOG_FILE, LOG_HEADER, 'utf8');
    } else {
      throw err;
    }
  }
}

function csvEscape(value) {
  const string = value === undefined || value === null ? '' : String(value);
  if (/[",\n]/.test(string)) {
    return `"${string.replace(/"/g, '""')}"`;
  }
  return string;
}

function formatCsvRow(values) {
  return `${values.map(csvEscape).join(',')}\n`;
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

async function appendLogRow(action, filename, label, fromPath, toPath) {
  await ensureLogFile();
  const row = formatCsvRow([
    new Date().toISOString(),
    action,
    filename,
    label,
    path.relative(ROOT_DIR, fromPath),
    path.relative(ROOT_DIR, toPath),
  ]);
  await fsp.appendFile(LOG_FILE, row, 'utf8');
}

async function loadHistoryFromLog() {
  await ensureLogFile();
  const data = await fsp.readFile(LOG_FILE, 'utf8');
  const lines = data.split(/\r?\n/).filter((line) => line.trim().length);
  if (!lines.length) return;
  const startIndex = lines[0].startsWith('timestamp') ? 1 : 0;
  for (let i = startIndex; i < lines.length; i += 1) {
    const columns = parseCsvLine(lines[i]);
    if (columns.length < 6) {
      continue;
    }
    const [, action, filename, label, fromRel, toRel] = columns;
    if (action === 'move') {
      moveHistory.push({
        filename,
        label: String(label),
        from: path.join(ROOT_DIR, fromRel),
        to: path.join(ROOT_DIR, toRel),
      });
    } else if (action === 'undo') {
      if (moveHistory.length) {
        moveHistory.pop();
      }
    }
  }
}

function sendJSON(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendError(res, statusCode, message) {
  sendJSON(res, statusCode, { error: message });
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif']);

async function listImages() {
  const entries = await fsp.readdir(IMAGE_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => {
      if (!entry.isFile()) return false;
      const ext = path.extname(entry.name).toLowerCase();
      return IMAGE_EXTENSIONS.has(ext);
    })
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function countFilesInDir(dirPath) {
  try {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).length;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return 0;
    }
    throw err;
  }
}

async function getLabelCounts() {
  const entries = await Promise.all(
    Object.entries(CLASS_PATHS).map(async ([label, dirPath]) => {
      const count = await countFilesInDir(dirPath);
      return [label, count];
    })
  );
  return Object.fromEntries(entries);
}

async function parseJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (err) {
    throw new Error('Invalid JSON payload');
  }
}

async function handleMoveRequest(req, res) {
  const body = await parseJsonBody(req);
  const { filename, label } = body;
  if (!filename || typeof filename !== 'string') {
    return sendError(res, 400, 'filename is required');
  }
  if (label === undefined || !(label in CLASS_PATHS)) {
    return sendError(res, 400, 'Unknown label');
  }

  const safeName = path.basename(filename);
  const sourcePath = path.join(IMAGE_DIR, safeName);
  const destinationDir = CLASS_PATHS[label];

  try {
    await fsp.access(sourcePath, fs.constants.F_OK);
  } catch (err) {
    return sendError(res, 404, 'Source image not found');
  }

  await fsp.mkdir(destinationDir, { recursive: true });
  const destinationPath = path.join(destinationDir, safeName);
  await fsp.rename(sourcePath, destinationPath);
  const labelKey = String(label);
  const moveEntry = {
    filename: safeName,
    label: labelKey,
    from: sourcePath,
    to: destinationPath,
  };
  moveHistory.push(moveEntry);
  await appendLogRow('move', safeName, labelKey, sourcePath, destinationPath);
  const newCount = await countFilesInDir(destinationDir);
  return sendJSON(res, 200, { success: true, label: labelKey, count: newCount });
}

async function handleUndoRequest(req, res) {
  if (!moveHistory.length) {
    return sendError(res, 400, '되돌릴 작업이 없습니다.');
  }
  const lastMove = moveHistory.pop();
  const currentPath = lastMove.to;
  const targetPath = lastMove.from;
  try {
    await fsp.access(currentPath, fs.constants.F_OK);
  } catch (err) {
    moveHistory.push(lastMove);
    return sendError(res, 404, '되돌릴 파일을 찾을 수 없습니다.');
  }

  try {
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    await fsp.rename(currentPath, targetPath);
    await appendLogRow('undo', lastMove.filename, lastMove.label, currentPath, targetPath);
  } catch (err) {
    moveHistory.push(lastMove);
    console.error(err);
    return sendError(res, 500, '되돌리기에 실패했습니다.');
  }

  const labelKey = String(lastMove.label);
  const newCount = await countFilesInDir(CLASS_PATHS[labelKey]);
  return sendJSON(res, 200, {
    success: true,
    filename: lastMove.filename,
    label: labelKey,
    count: newCount,
  });
}

function serveStaticFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const stream = fs.createReadStream(filePath);
  stream.on('open', () => {
    res.writeHead(200, { 'Content-Type': contentType });
  });
  stream.on('error', () => {
    res.writeHead(404);
    res.end('Not found');
  });
  stream.pipe(res);
}

function serveImage(res, filename) {
  const safeName = path.basename(filename);
  const fullPath = path.join(IMAGE_DIR, safeName);
  const ext = path.extname(fullPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const stream = fs.createReadStream(fullPath);
  stream.on('open', () => {
    res.writeHead(200, { 'Content-Type': contentType });
  });
  stream.on('error', (err) => {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500);
    res.end(err.code === 'ENOENT' ? 'Not found' : 'Server error');
  });
  stream.pipe(res);
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = parsedUrl;
  try {
    if (req.method === 'GET' && pathname === '/api/images') {
      const [images, counts] = await Promise.all([listImages(), getLabelCounts()]);
      return sendJSON(res, 200, { images, counts });
    }

    if (req.method === 'POST' && pathname === '/api/move') {
      return await handleMoveRequest(req, res);
    }

    if (req.method === 'POST' && pathname === '/api/undo') {
      return await handleUndoRequest(req, res);
    }

    if (req.method === 'GET' && pathname.startsWith('/images/')) {
      const imageName = decodeURIComponent(pathname.replace('/images/', ''));
      return serveImage(res, imageName);
    }

    if (STATIC_FILES.has(pathname)) {
      const relativePath = STATIC_FILES.get(pathname);
      const filePath = path.join(ROOT_DIR, relativePath);
      return serveStaticFile(res, filePath);
    }

    if (pathname === '/') {
      const filePath = path.join(ROOT_DIR, 'index.html');
      return serveStaticFile(res, filePath);
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (err) {
    console.error(err);
    sendError(res, 500, 'Server error');
  }
});

async function bootstrap() {
  try {
    await ensureDestinationDirectories();
    await ensureLogFile();
    await loadHistoryFromLog();
    server.listen(PORT, () => {
      console.log(`Image explorer running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
}

bootstrap();
