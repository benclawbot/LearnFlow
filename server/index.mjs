import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exploreWithMiniMax, analyzeWithMiniMax } from './minimax.mjs';
import {
  applySecurityHeaders,
  enforceRateLimit,
  getClientKey,
  readJsonBody,
  toHttpError,
  validateAnalyzeBody,
  validateExploreBody
} from './security.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const srcDir = path.join(rootDir, 'src');
const port = Number(process.env.PORT || 4173);

await loadDotEnv(path.join(rootDir, '.env'));

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp']
]);

export function createServer() {
  return http.createServer(async (request, response) => {
    applySecurityHeaders(response, String(request.headers.origin || ''));
    try {
      if (request.method === 'OPTIONS') return sendJson(response, 204, {});
      if (request.url === '/health') return sendJson(response, 200, { ok: true, app: 'LearnFlow', model: process.env.MINIMAX_MODEL || 'MiniMax-M3' });

      if (request.url?.startsWith('/api/')) {
        const rate = enforceRateLimit(getClientKey(request), {
          limit: Number(process.env.RATE_LIMIT_PER_MINUTE || 30)
        });
        response.setHeader('X-RateLimit-Remaining', String(rate.remaining));
        response.setHeader('X-RateLimit-Reset', String(Math.ceil(rate.resetAt / 1000)));
        if (!rate.allowed) return sendJson(response, 429, { error: 'Too many requests. Please try again shortly.' });
      }

      if (request.method === 'POST' && request.url === '/api/explore') return await handleExplore(request, response);
      if (request.method === 'POST' && request.url === '/api/analyze') return await handleAnalyze(request, response);
      if (request.method === 'GET') return serveStatic(request, response);
      sendJson(response, 405, { error: 'Method not allowed' });
    } catch (error) {
      const failure = toHttpError(error);
      sendJson(response, failure.status, { error: failure.message });
    }
  });
}

async function handleExplore(request, response) {
  const body = validateExploreBody(await readJsonBody(request));
  const result = await exploreWithMiniMax(body);
  sendJson(response, 200, result);
}

async function handleAnalyze(request, response) {
  const body = validateAnalyzeBody(await readJsonBody(request));
  const result = await analyzeWithMiniMax(body);
  sendJson(response, 200, result);
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const rawPath = decodeURIComponent(url.pathname);
  let filePath;
  if (rawPath === '/') filePath = path.join(publicDir, 'index.html');
  else if (rawPath.startsWith('/src/')) filePath = path.join(srcDir, rawPath.replace('/src/', ''));
  else filePath = path.join(publicDir, rawPath);

  const normalized = path.normalize(filePath);
  const allowed = normalized.startsWith(publicDir) || normalized.startsWith(srcDir);
  if (!allowed || !existsSync(normalized)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  const ext = path.extname(normalized);
  response.setHeader('Cache-Control', rawPath === '/' ? 'no-cache' : 'public, max-age=3600');
  response.writeHead(200, { 'Content-Type': mimeTypes.get(ext) || 'application/octet-stream' });
  createReadStream(normalized).pipe(response);
}

function sendJson(response, status, payload) {
  if (!response.headersSent) response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.statusCode = status;
  response.end(status === 204 ? '' : JSON.stringify(payload));
}

async function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  const text = await readFile(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (!process.env[key]) process.env[key] = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
  }
}

const isEntryPoint = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isEntryPoint) {
  const server = createServer();
  server.listen(port, () => {
    console.log(`LearnFlow running at http://localhost:${port}`);
    console.log(`MiniMax base URL: ${process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1'}`);
    console.log(`MiniMax model: ${process.env.MINIMAX_MODEL || 'MiniMax-M3'}`);
  });
}
