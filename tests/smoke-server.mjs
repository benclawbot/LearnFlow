import assert from 'node:assert/strict';
import { createServer } from '../server/index.mjs';

const server = createServer();
await new Promise((resolve) => server.listen(0, resolve));
const { port } = server.address();
try {
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.model, process.env.MINIMAX_MODEL || 'MiniMax-M3');
  console.log(`Smoke server OK on port ${port}`);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
