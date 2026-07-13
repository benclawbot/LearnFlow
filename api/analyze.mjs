import { analyzeWithMiniMax } from '../server/minimax.mjs';
import {
  applySecurityHeaders,
  enforceRateLimit,
  getClientKey,
  readJsonBody,
  toHttpError,
  validateAnalyzeBody
} from '../server/security.mjs';

export default async function handler(request, response) {
  applySecurityHeaders(response, String(request.headers?.origin || ''));
  if (request.method === 'OPTIONS') return response.status(204).end();
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });

  const rate = enforceRateLimit(getClientKey(request), {
    limit: Number(process.env.RATE_LIMIT_PER_MINUTE || 30)
  });
  response.setHeader('X-RateLimit-Remaining', String(rate.remaining));
  response.setHeader('X-RateLimit-Reset', String(Math.ceil(rate.resetAt / 1000)));
  if (!rate.allowed) return response.status(429).json({ error: 'Too many requests. Please try again shortly.' });

  try {
    const body = validateAnalyzeBody(await readJsonBody(request));
    const result = await analyzeWithMiniMax(body);
    return response.status(200).json(result);
  } catch (error) {
    const failure = toHttpError(error, 'Unexpected analysis error');
    return response.status(failure.status).json({ error: failure.message });
  }
}
