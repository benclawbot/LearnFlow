export const MAX_BODY_BYTES = 256 * 1024;
export const MAX_TOPIC_LENGTH = 240;
export const MAX_SELECTED_ITEMS = 80;

const buckets = new Map();

export function applySecurityHeaders(response, origin = '') {
  const allowedOrigin = resolveAllowedOrigin(origin);
  response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
}

export function enforceRateLimit(key, { limit = 30, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  current.count += 1;
  return { allowed: current.count <= limit, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
}

export async function readJsonBody(request, maxBytes = MAX_BODY_BYTES) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') {
    if (Buffer.byteLength(request.body, 'utf8') > maxBytes) throw httpError(413, 'Request body is too large.');
    return request.body ? parseJson(request.body) : {};
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw httpError(413, 'Request body is too large.');
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? parseJson(raw) : {};
}

export function validateExploreBody(body) {
  const topic = typeof body?.topic === 'string' ? body.topic.trim() : '';
  if (!topic) throw httpError(400, 'topic is required');
  if (topic.length > MAX_TOPIC_LENGTH) throw httpError(400, `topic must be ${MAX_TOPIC_LENGTH} characters or fewer`);
  return { ...body, topic };
}

export function validateAnalyzeBody(body) {
  if (!Array.isArray(body?.selectedItems) || body.selectedItems.length === 0) {
    throw httpError(400, 'selectedItems is required');
  }
  if (body.selectedItems.length > MAX_SELECTED_ITEMS) {
    throw httpError(400, `selectedItems must contain ${MAX_SELECTED_ITEMS} items or fewer`);
  }
  const selectedItems = body.selectedItems
    .filter((item) => typeof item === 'string' || (item && typeof item === 'object'))
    .slice(0, MAX_SELECTED_ITEMS);
  if (selectedItems.length === 0) throw httpError(400, 'selectedItems contains no valid items');
  return { ...body, selectedItems };
}

export function getClientKey(request) {
  const forwarded = request.headers?.['x-forwarded-for'];
  const ip = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || request.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  return `${ip}:${request.url || 'unknown'}`;
}

export function toHttpError(error, fallbackMessage = 'Unexpected server error') {
  return {
    status: Number.isInteger(error?.status) ? error.status : 500,
    message: Number.isInteger(error?.status) ? error.message : fallbackMessage
  };
}

function resolveAllowedOrigin(origin) {
  const configured = String(process.env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (configured.length === 0) return origin || '*';
  return configured.includes(origin) ? origin : configured[0];
}

function parseJson(raw) {
  try { return JSON.parse(raw); }
  catch { throw httpError(400, 'Request body must be valid JSON.'); }
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
