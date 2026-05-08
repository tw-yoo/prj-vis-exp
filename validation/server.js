import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.VALIDATION_PORT || process.env.PORT || 8081);
const HOST = process.env.VALIDATION_HOST || '127.0.0.1';

const validationRoot = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(validationRoot, 'index.html');
const chartMapPath = path.join(validationRoot, 'chart_map.json');

const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
};

async function loadExpertIds() {
    const chartMap = JSON.parse(await readFile(chartMapPath, 'utf8'));
    return new Set(Object.keys(chartMap));
}

function getRouteParts(urlPathname) {
    return urlPathname.split('/').filter(Boolean);
}

function isViewerRoute(urlPathname, expertIds) {
    const parts = getRouteParts(urlPathname);

    if (parts.length === 0) {
        return true;
    }

    if (parts.length === 1) {
        return expertIds.has(parts[0]);
    }

    return parts.length === 2 && expertIds.has(parts[0]) && parts[1] === 'index.html';
}

function getStaticPath(urlPathname) {
    const decodedPath = decodeURIComponent(urlPathname);
    const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
    const staticPath = path.join(validationRoot, normalizedPath);

    if (!staticPath.startsWith(validationRoot)) {
        return null;
    }

    return staticPath;
}

async function sendFile(response, filePath) {
    const content = await readFile(filePath);
    const contentType = mimeTypes[path.extname(filePath)] || 'application/octet-stream';

    response.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store'
    });
    response.end(content);
}

async function createValidationServer() {
    const expertIds = await loadExpertIds();

    const server = createServer(async (request, response) => {
        try {
            const url = new URL(request.url || '/', `http://${request.headers.host || HOST}`);
            const staticPath = getStaticPath(url.pathname);

            if (staticPath) {
                const fileStat = await stat(staticPath).catch(() => null);

                if (fileStat?.isFile()) {
                    await sendFile(response, staticPath);
                    return;
                }
            }

            if (isViewerRoute(url.pathname, expertIds)) {
                await sendFile(response, indexPath);
                return;
            }

            response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('Not found');
        } catch (error) {
            console.error(error);
            response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('Internal server error');
        }
    });

    return { server, expertIds };
}

const { server, expertIds } = await createValidationServer();

server.listen(PORT, HOST, () => {
    const firstExpertId = expertIds.values().next().value || '';
    const samplePath = firstExpertId ? `/${firstExpertId}` : '/';
    console.log(`Validation viewer: http://${HOST}:${PORT}${samplePath}`);
});
