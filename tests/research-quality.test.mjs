import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResearchQueries, collectResearchPacks, scoreSource } from '../server/research.mjs';
import { buildAnalyzeMessages, getSelectionKind, normalizeAnalysisResult, validateAnalysisResult } from '../server/minimax.mjs';
import { cleanModelText, createPrintableReportHtml } from '../src/report.js';

const selectedItems = [
  { label: 'Static Analysis', path: ['making a proper application clone', 'Code Reverse Engineering', 'Static Analysis'] },
  { label: 'Control Flow Analysis', path: ['making a proper application clone', 'Code Reverse Engineering', 'Static Analysis', 'Control Flow Analysis'] }
];

test('research queries remove duplicate root terms and add software intent', () => {
  const queries = buildResearchQueries({ topic: 'making a proper application clone', item: selectedItems[0] });
  assert.ok(queries.length >= 2);
  assert.equal((queries[0].match(/making a proper application clone/gi) || []).length, 1);
  assert.ok(queries.some((query) => /software binary program analysis/i.test(query)));
});

test('relevance scoring rejects psychology collisions and retains program-analysis material', () => {
  const item = selectedItems[1];
  const irrelevant = scoreSource({
    title: 'Heuristics in psychology',
    note: 'The general flow of events produces escalation of commitment in cognitive psychology.',
    sourceType: 'encyclopedia'
  }, { topic: 'making a proper application clone', item });
  const relevant = scoreSource({
    title: 'Control-flow graph',
    note: 'A control-flow graph represents basic blocks, branches, calls, and possible execution paths in a software program.',
    sourceType: 'encyclopedia'
  }, { topic: 'making a proper application clone', item });
  assert.ok(irrelevant < 0.38);
  assert.ok(relevant >= 0.38);
});

test('collector retries queries and keeps only directly relevant sources', async () => {
  const fakeFetch = async (url) => {
    if (url.includes('prop=extracts')) {
      return jsonResponse({ query: { pages: {
        1: { title: 'Control-flow graph', fullurl: 'https://en.wikipedia.org/wiki/Control-flow_graph', extract: 'In software engineering, a control-flow graph represents basic blocks and execution paths in a program.' },
        2: { title: 'Heuristic (psychology)', fullurl: 'https://en.wikipedia.org/wiki/Heuristic_(psychology)', extract: 'Cognitive psychology studies the flow of decisions and escalation of commitment.' }
      } } });
    }
    if (url.includes('wikipedia.org')) {
      return jsonResponse({ query: { search: [
        { pageid: 1, title: 'Control-flow graph', snippet: 'Software program basic blocks and branches.' },
        { pageid: 2, title: 'Heuristic (psychology)', snippet: 'General flow of events in psychology.' }
      ] } });
    }
    if (url.includes('duckduckgo.com')) return jsonResponse({ RelatedTopics: [] });
    if (url.includes('semanticscholar.org')) return jsonResponse({ data: [{
      title: 'Recovering Control Flow from Binaries', year: 2024, venue: 'Program Analysis', url: 'https://example.com/cfg-paper', abstract: 'Static binary analysis recovers control-flow graphs, indirect branches, and basic blocks.'
    }] });
    if (url.includes('openalex.org')) return jsonResponse({ results: [] });
    return jsonResponse({});
  };
  const packs = await collectResearchPacks({ topic: 'making a proper application clone', selectedItems: [selectedItems[1]] }, { fetchImpl: fakeFetch, timeoutMs: 1000 });
  assert.equal(packs.length, 1);
  assert.ok(packs[0].sources.length >= 2);
  assert.ok(packs[0].sources.every((source) => !/psychology/i.test(source.title)));
  assert.ok(packs[0].sources.every((source) => source.id.startsWith('control-flow-analysis-s')));
});

test('analysis validation rejects markup and unknown source IDs', () => {
  const packs = [{ title: 'Static Analysis', path: selectedItems[0].path, coverage: 'partial', confidence: 0.6, sources: [{ id: 'static-analysis-s1', title: 'Source', url: 'https://example.com', note: 'Relevant source.' }] }];
  const bad = {
    title: 'Report', summary: 'Summary', sections: [{
      title: 'Static Analysis', path: selectedItems[0].path, simpleDefinition: '<p>Definition</p>', currentDetails: ['Details'], researchOverview: ['Overview'], keyTakeaways: [], examples: [], sourceIds: ['invented-s9']
    }]
  };
  const validation = validateAnalysisResult(bad, { selectedItems: [selectedItems[0]], researchPacks: packs });
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => /markup/i.test(error)));
  assert.ok(validation.errors.some((error) => /unknown source ID/i.test(error)));
});

test('normalization resolves source metadata server-side', () => {
  const pack = { title: 'Static Analysis', path: selectedItems[0].path, coverage: 'partial', confidence: 0.66, sources: [{ id: 'static-analysis-s1', title: 'Official source', url: 'https://example.com', note: 'Relevant source.' }] };
  const normalized = normalizeAnalysisResult({
    title: 'Report', summary: 'Summary', sections: [{
      title: 'Static Analysis', path: selectedItems[0].path, simpleDefinition: 'Definition', currentDetails: ['Details'], researchOverview: ['Overview'], keyTakeaways: ['Takeaway'], examples: [], sourceIds: ['static-analysis-s1']
    }]
  }, { topic: 'Clone', selectedItems: [selectedItems[0]], researchPacks: [pack] });
  assert.equal(normalized.sections[0].sources[0].title, 'Official source');
  assert.equal(normalized.sections[0].sources[0].url, 'https://example.com');
});

test('prompt requires plain text, source IDs, concise gaps, and overview hierarchy', () => {
  const messages = buildAnalyzeMessages({ topic: 'Clone', selectedItems, researchPacks: [] });
  const prompt = messages.map((message) => message.content).join('\n');
  assert.match(prompt, /plain text only/i);
  assert.match(prompt, /sourceIds/);
  assert.match(prompt, /keep the section short/i);
  assert.equal(getSelectionKind(selectedItems[0], selectedItems), 'overview');
  assert.equal(getSelectionKind(selectedItems[1], selectedItems), 'detail');
});

test('report strips model HTML, honors reference toggle, localizes headings, and nests descendants', () => {
  const analysis = {
    title: 'Rapport',
    summary: 'Résumé utile.',
    sections: [
      {
        title: 'Static Analysis', path: selectedItems[0].path, simpleDefinition: 'Definition',
        currentDetails: ['<p>Useful details.</p>'], researchOverview: ['&lt;p&gt;Useful overview.&lt;/p&gt;'],
        keyTakeaways: ['One'], examples: [], coverage: 'partial', confidence: 0.6, coverageNote: 'Partial.',
        sources: [{ id: 's1', title: 'Source', url: 'https://example.com', note: 'Note' }]
      },
      {
        title: 'Control Flow Analysis', path: selectedItems[1].path, simpleDefinition: 'Definition',
        currentDetails: [], researchOverview: ['Child overview.'], keyTakeaways: [], examples: [], coverage: 'insufficient', coverageNote: 'Insufficient.', sources: []
      }
    ]
  };
  const html = createPrintableReportHtml({ topic: 'Clone', selectedItems, analysis, options: { language: 'French', includeReferences: false, includeExamples: true } });
  assert.match(html, /Table des matières/);
  assert.match(html, /Useful details\./);
  assert.match(html, /Useful overview\./);
  assert.doesNotMatch(html, /&lt;p&gt;/);
  assert.doesNotMatch(html, /Sources consultées/);
  assert.doesNotMatch(html, /https:\/\/example\.com/);
  assert.match(html, /class="report-subsection/);
  assert.ok(html.indexOf('Control Flow Analysis') > html.indexOf('Static Analysis'));
  assert.equal(cleanModelText('&lt;p&gt;Safe&lt;/p&gt;'), 'Safe');
});

function jsonResponse(payload) {
  return { ok: true, async json() { return payload; } };
}
