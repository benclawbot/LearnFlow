import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exploreWithMiniMax, analyzeWithMiniMax } from './minimax.mjs';

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
  ['.png', 'image/png']
]);

export function createServer() {
  return http.createServer(async (request, response) => {
    try {
      if (request.method === 'OPTIONS') return sendJson(response, 204, {});
      if (request.url === '/health') return sendJson(response, 200, { ok: true, app: 'LearnFlow', model: process.env.MINIMAX_MODEL || 'MiniMax-M3' });
      if (request.method === 'POST' && request.url === '/api/explore') return await handleExplore(request, response);
      if (request.method === 'POST' && request.url === '/api/analyze') return await handleAnalyze(request, response);
      if (request.method === 'GET') return serveStatic(request, response);
      sendJson(response, 405, { error: 'Method not allowed' });
    } catch (error) {
      sendJson(response, 500, { error: error.message || 'Unexpected server error' });
    }
  });
}

async function handleExplore(request, response) {
  const body = await readJsonBody(request);
  if (!body.topic || typeof body.topic !== 'string') return sendJson(response, 400, { error: 'topic is required' });
  const result = await exploreWithMiniMax(body);
  sendJson(response, 200, result);
}

async function handleAnalyze(request, response) {
  const body = await readJsonBody(request);
  if (!Array.isArray(body.selectedItems) || body.selectedItems.length === 0) return sendJson(response, 400, { error: 'selectedItems is required' });
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
  response.writeHead(200, { 'Content-Type': mimeTypes.get(ext) || 'application/octet-stream' });
  createReadStream(normalized).pipe(response);
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  response.end(status === 204 ? '' : JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch { throw new Error('Request body must be valid JSON.'); }
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
