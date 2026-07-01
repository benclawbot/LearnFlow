import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeWithMiniMax, buildExploreMessages, buildAnalyzeMessages, callMiniMaxJson, extractJson, getMiniMaxConfig } from '../server/minimax.mjs';

test('MiniMax config defaults to requested base URL and model', () => {
  const config = getMiniMaxConfig({ MINIMAX_API_KEY: 'k' });
  assert.equal(config.baseUrl, 'https://api.minimax.io/v1');
  assert.equal(config.model, 'MiniMax-M3');
});

test('prompt builders require strict JSON for the recursive tree and analysis', () => {
  const explore = buildExploreMessages({ topic: 'Physics', parentPath: ['Physics'], depth: 2 });
  const analyze = buildAnalyzeMessages({ topic: 'Physics', selectedItems: [{ label: 'Motion', path: ['Physics', 'Motion'] }] });
  assert.match(explore[0].content, /Return only strict JSON/);
  assert.match(analyze[0].content, /Return only strict JSON/);
  assert.match(explore[1].content, /subjects/);
  assert.match(analyze[1].content, /sections/);
});

test('extractJson accepts fenced JSON from model responses', () => {
  assert.deepEqual(extractJson('```json\n{"ok":true}\n```'), { ok: true });
});

test('extractJson removes standalone ellipsis placeholders from model JSON', () => {
  const parsed = extractJson(`{
    "sections": [
      { "title": "Regression" },
      ...
    ]
  }`);
  assert.deepEqual(parsed, { sections: [{ title: 'Regression' }] });
});

test('callMiniMaxJson calls the OpenAI-compatible chat completions endpoint', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      async text() {
        return JSON.stringify({ choices: [{ message: { content: '{"subjects":[{"label":"A"}]}' } }] });
      }
    };
  };
  const result = await callMiniMaxJson({ messages: [{ role: 'user', content: 'x' }] }, { env: { MINIMAX_API_KEY: 'secret' }, fetchImpl: fakeFetch });
  assert.deepEqual(result, { subjects: [{ label: 'A' }] });
  assert.equal(calls[0].url, 'https://api.minimax.io/v1/chat/completions');
  assert.equal(JSON.parse(calls[0].options.body).model, 'MiniMax-M3');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret');
});

test('analyzeWithMiniMax falls back when the model returns invalid JSON', async () => {
  const fakeFetch = async () => ({
    ok: true,
    async text() {
      return JSON.stringify({ choices: [{ message: { content: '{"sections":[...]}' } }] });
    }
  });
  const result = await analyzeWithMiniMax({
    topic: 'AI',
    selectedItems: [{ label: 'Machine Learning', path: ['AI', 'Machine Learning'] }]
  }, { env: { MINIMAX_API_KEY: 'secret' }, fetchImpl: fakeFetch });
  assert.equal(result.title, 'AI Research Brief');
  assert.equal(result.sections[0].title, 'Machine Learning');
});
