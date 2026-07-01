import { exploreWithMiniMax } from '../server/minimax.mjs';

export default async function handler(request, response) {
  setCors(response);
  if (request.method === 'OPTIONS') return response.status(204).end();
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });

  try {
    const body = await readJsonBody(request);
    if (!body.topic || typeof body.topic !== 'string') return response.status(400).json({ error: 'topic is required' });
    const result = await exploreWithMiniMax(body);
    return response.status(200).json(result);
  } catch (error) {
    return response.status(500).json({ error: error.message || 'Unexpected explore error' });
  }
}

function setCors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') return request.body ? JSON.parse(request.body) : {};
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}
