import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeWithMiniMax, buildAnalyzeMessages, buildExploreMessages, buildResearchPlanMessages, callMiniMaxJson, extractJson, getMiniMaxConfig } from '../server/minimax.mjs';

test('MiniMax config defaults to requested base URL and model', () => {
  const config = getMiniMaxConfig({ MINIMAX_API_KEY: 'k' });
  assert.equal(config.baseUrl, 'https://api.minimax.io/v1');
  assert.equal(config.model, 'MiniMax-M3');
});

test('prompt builders separate research planning from dossier synthesis', () => {
  const explore = buildExploreMessages({ topic: 'Physics', parentPath: ['Physics'], depth: 2 });
  const plan = buildResearchPlanMessages({ topic: 'Physics', selectedItems: [{ label: 'Motion', path: ['Physics', 'Motion'] }], options: { depth: 'Detailed' } });
  const analyze = buildAnalyzeMessages({ topic: 'Physics', selectedItems: [{ label: 'Motion', path: ['Physics', 'Motion'] }], researchPlan: { centralQuestion: 'How does motion work?', chapters: [] }, chapterDrafts: [] });
  assert.match(explore[0].content, /Return only strict JSON/);
  assert.match(plan[0].content, /research director/i);
  assert.match(plan[1].content, /centralQuestion/);
  assert.match(plan[1].content, /chapters/);
  assert.match(analyze[1].content, /executiveSummary/);
  assert.match(analyze[1].content, /keyFindings/);
  assert.doesNotMatch(analyze[1].content, /one section per selected item/i);
});

test('extractJson accepts fenced JSON from model responses', () => {
  assert.deepEqual(extractJson('```json\n{"ok":true}\n```'), { ok: true });
});

test('extractJson removes standalone ellipsis placeholders from model JSON', () => {
  const parsed = extractJson(`{
    "chapters": [
      { "title": "Regression" },
      ...
    ]
  }`);
  assert.deepEqual(parsed, { chapters: [{ title: 'Regression' }] });
});

test('callMiniMaxJson calls the endpoint with MiniMax M3 thinking controls', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, async text() { return JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }); } };
  };
  const result = await callMiniMaxJson({ messages: [{ role: 'user', content: 'x' }], thinking: true }, { env: { MINIMAX_API_KEY: 'secret' }, fetchImpl: fakeFetch });
  assert.deepEqual(result, { ok: true });
  const body = JSON.parse(calls[0].options.body);
  assert.equal(calls[0].url, 'https://api.minimax.io/v1/chat/completions');
  assert.equal(body.model, 'MiniMax-M3');
  assert.deepEqual(body.thinking, { type: 'enabled' });
});

test('analyzeWithMiniMax falls back to a coherent dossier when model JSON is invalid', async () => {
  const fakeFetch = async () => ({ ok: true, async text() { return JSON.stringify({ choices: [{ message: { content: '{"chapters":[...]}' } }] }); } });
  const result = await analyzeWithMiniMax({ topic: 'AI', selectedItems: [{ label: 'Machine Learning', path: ['AI', 'Machine Learning'] }], options: { depth: 'Quick' } }, {
    env: { MINIMAX_API_KEY: 'secret' }, fetchImpl: fakeFetch,
    researchProvider: async ({ researchPlan }) => ({ overview: { sources: [] }, chapters: researchPlan.chapters.map(chapter => ({ id: chapter.id, title: chapter.title, sources: [] })) })
  });
  assert.equal(result.title, 'AI Research Dossier');
  assert.ok(result.chapters.length >= 1);
  assert.ok(Array.isArray(result.executiveSummary));
});
