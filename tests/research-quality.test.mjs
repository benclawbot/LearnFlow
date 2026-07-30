import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChapterQueries, collectDossierResearch, scoreSource } from '../server/research.mjs';
import { buildChapterMessages, buildFallbackResearchPlan, buildResearchPlanMessages, normalizeAnalysisResult, validateChapterResult } from '../server/minimax.mjs';
import { cleanModelText, createPrintableReportHtml } from '../src/report.js';

const selectedItems = [
  { label: 'reverse engineering apps', path: ['reverse engineering apps'] },
  { label: 'Static Analysis', path: ['reverse engineering apps', 'Static Analysis'] },
  { label: 'Decompilation', path: ['reverse engineering apps', 'Static Analysis', 'Decompilation'] },
  { label: 'Control Flow', path: ['reverse engineering apps', 'Static Analysis', 'Control Flow'] },
  { label: 'Dynamic Analysis', path: ['reverse engineering apps', 'Dynamic Analysis'] },
  { label: 'Debugging', path: ['reverse engineering apps', 'Dynamic Analysis', 'Debugging'] },
  { label: 'Mobile App RE', path: ['reverse engineering apps', 'Mobile App RE'] },
  { label: 'APK Analysis', path: ['reverse engineering apps', 'Mobile App RE', 'APK Analysis'] }
];

test('fallback plan treats selected tree as scope and clusters related nodes into chapters', () => {
  const plan = buildFallbackResearchPlan({ topic: 'reverse engineering apps', selectedItems, options: { depth: 'Detailed' } });
  assert.deepEqual(plan.chapters.map(chapter => chapter.title), ['Static Analysis', 'Dynamic Analysis', 'Mobile App RE']);
  assert.ok(plan.chapters.length < selectedItems.length);
  assert.ok(plan.chapters[0].selectedTopics.includes('Decompilation'));
  assert.ok(plan.chapters[0].selectedTopics.includes('Control Flow'));
});

test('research planning prompt avoids one report section per selected node', () => {
  const prompt = buildResearchPlanMessages({ topic: 'reverse engineering apps', selectedItems, options: { depth: 'Detailed' } }).map(message => message.content).join('\n');
  assert.match(prompt, /not one section per mind-map node/i);
  assert.match(prompt, /combine parent and child nodes/i);
  assert.match(prompt, /at most 6 chapters/i);
});

test('chapter queries combine parent scope, child topics, mechanisms, and limitations', () => {
  const plan = buildFallbackResearchPlan({ topic: 'reverse engineering apps', selectedItems, options: { depth: 'Detailed' } });
  const queries = buildChapterQueries({ topic: 'reverse engineering apps', chapter: plan.chapters[0], selectedItems, depth: 'Detailed' });
  assert.ok(queries.length >= 4);
  assert.ok(queries.some(query => /mechanisms workflow/i.test(query)));
  assert.ok(queries.some(query => /limitations/i.test(query)));
  assert.ok(queries.some(query => /decompilation|control flow/i.test(query)));
});

test('relevance scoring rejects psychology collisions and retains software evidence', () => {
  const chapter = { title: 'Control Flow Recovery', selectedTopics: ['Control Flow'], questions: ['How are control-flow graphs recovered?'] };
  const irrelevant = scoreSource({ title: 'Heuristics in psychology', note: 'The general flow of events produces escalation of commitment in cognitive psychology.', sourceType: 'encyclopedia' }, { topic: 'reverse engineering apps', chapter });
  const relevant = scoreSource({ title: 'Recovering control-flow graphs from binaries', note: 'Static binary analysis identifies basic blocks, branches, indirect jumps, and possible execution paths in software.', sourceType: 'research paper' }, { topic: 'reverse engineering apps', chapter });
  assert.ok(irrelevant < 0.38);
  assert.ok(relevant >= 0.38);
});

test('dossier collector researches chapters rather than every selected node', async () => {
  const plan = buildFallbackResearchPlan({ topic: 'reverse engineering apps', selectedItems, options: { depth: 'Quick' } });
  const fakeFetch = async url => {
    const target = String(url);
    if (target.includes('prop=extracts')) return jsonResponse({ query: { pages: { 1: { title: 'Static program analysis', fullurl: 'https://en.wikipedia.org/wiki/Static_program_analysis', extract: 'Static program analysis examines software without executing it and includes control-flow and data-flow analysis.' } } } });
    if (target.includes('wikipedia.org')) return jsonResponse({ query: { search: [{ pageid: 1, title: 'Static program analysis', snippet: 'Analysis of software without execution.' }] } });
    if (target.includes('duckduckgo.com/html')) return textResponse('');
    if (target.includes('duckduckgo.com')) return jsonResponse({ RelatedTopics: [] });
    if (target.includes('semanticscholar.org')) return jsonResponse({ data: [{ title: 'Practical Binary Analysis', year: 2024, venue: 'Software Analysis', url: 'https://example.com/binary-analysis', abstract: 'Reverse engineering binaries combines disassembly, control-flow recovery, and decompilation to understand program behavior.' }] });
    if (target.includes('openalex.org')) return jsonResponse({ results: [] });
    if (target.includes('r.jina.ai')) return textResponse('');
    return jsonResponse({});
  };
  const dossier = await collectDossierResearch({ topic: 'reverse engineering apps', selectedItems, researchPlan: plan, options: { depth: 'Quick' } }, { fetchImpl: fakeFetch, timeoutMs: 1000 });
  assert.equal(dossier.chapters.length, plan.chapters.length);
  assert.ok(dossier.chapters.length < selectedItems.length);
  assert.ok(dossier.chapters[0].sources.every(source => !/psychology/i.test(source.title)));
  assert.ok(dossier.chapters[0].sources.every(source => source.id.startsWith(`${plan.chapters[0].id}-s`)));
});

test('chapter prompt requires substantial synthesis while keeping evidence internal', () => {
  const plan = buildFallbackResearchPlan({ topic: 'reverse engineering apps', selectedItems, options: { depth: 'Detailed' } });
  const prompt = buildChapterMessages({ topic: 'reverse engineering apps', chapter: plan.chapters[0], evidencePack: { sources: [] }, options: { depth: 'Detailed' } }).map(message => message.content).join('\n');
  assert.match(prompt, /700 to 1100 words/i);
  assert.match(prompt, /causal mechanisms/i);
  assert.match(prompt, /Do not expose sources/i);
});

test('chapter validation rejects markup and invented internal source IDs', () => {
  const chapter = { id: 'chapter-1', title: 'Static Analysis' }, evidencePack = { sources: [{ id: 'chapter-1-s1', title: 'Source', note: 'Evidence' }] };
  const bad = { id: 'chapter-1', title: 'Static Analysis', thesis: '<p>Thesis</p>', opening: ['One', 'Two'], sections: [{ heading: 'Mechanisms', paragraphs: ['A', 'B'], takeaways: [], sourceIds: ['invented-s9'] }, { heading: 'Workflow', paragraphs: ['C'], takeaways: [], sourceIds: [] }], comparisonTable: null, practicalImplications: [], limitations: [], sourceIds: ['invented-s9'] };
  const validation = validateChapterResult(bad, { chapter, evidencePack, depth: 'Detailed' });
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some(error => /markup/i.test(error)));
  assert.ok(validation.errors.some(error => /unknown source ID/i.test(error)));
});

test('normalization removes all internal evidence metadata', () => {
  const plan = buildFallbackResearchPlan({ topic: 'reverse engineering apps', selectedItems, options: { depth: 'Detailed' } });
  const rawChapter = { id: plan.chapters[0].id, title: plan.chapters[0].title, thesis: 'Thesis', opening: ['Opening'], sections: [{ heading: 'Mechanisms', paragraphs: ['Analysis'], takeaways: ['Takeaway'], sourceIds: ['chapter-1-s1'] }], comparisonTable: null, practicalImplications: ['Implication'], limitations: ['Limit'], sourceIds: ['chapter-1-s1'] };
  const normalized = normalizeAnalysisResult({ title: 'Dossier', subtitle: 'Subtitle', executiveSummary: ['Answer'], keyFindings: [], chapters: [rawChapter], conclusion: ['Conclusion'], recommendations: ['Recommendation'], openQuestions: ['Question'] }, { topic: 'reverse engineering apps', researchPlan: plan });
  assert.equal(normalized.chapters[0].sourceIds, undefined);
  assert.equal(normalized.chapters[0].sections[0].sourceIds, undefined);
  assert.equal(normalized.chapters[0].sources, undefined);
});

test('reader-facing report is a deep dossier and never renders sources or coverage scores', () => {
  const analysis = { title: 'Reverse Engineering Apps', subtitle: 'How analysts reconstruct application behavior', researchQuestion: 'How should application reverse engineering be approached?', scopeSummary: 'A focused technical investigation.', executiveSummary: ['A substantial answer-first summary.'], keyFindings: [{ title: 'Integrated workflow', explanation: 'Static and dynamic analysis reinforce one another.' }], chapters: [{ id: 'chapter-1', title: 'Static and Dynamic Analysis', thesis: 'The strongest workflow combines both modes.', opening: ['Opening context.'], sections: [{ heading: 'Mechanisms', paragraphs: ['Detailed mechanism explanation.'], takeaways: ['Use complementary evidence.'] }, { heading: 'Workflow', paragraphs: ['Detailed workflow explanation.'], takeaways: [] }], comparisonTable: { title: 'Methods', columns: ['Dimension', 'Static', 'Dynamic'], rows: [['Execution', 'No', 'Yes']] }, practicalImplications: ['Start with static triage, then validate behavior dynamically.'], limitations: ['Anti-analysis controls can distort observations.'] }], conclusion: ['Integrated analysis produces the most reliable reconstruction.'], recommendations: ['Define the target behavior before selecting tools.'], openQuestions: ['How should results be validated?'] };
  const html = createPrintableReportHtml({ topic: 'reverse engineering apps', selectedItems, analysis, options: { language: 'English', includeReferences: true, depth: 'Detailed', audience: 'Advanced' } });
  assert.match(html, /Executive Summary/);
  assert.match(html, /Key Findings/);
  assert.match(html, /Practical Implications/);
  assert.match(html, /Limitations and Boundary Conditions/);
  assert.doesNotMatch(html, /Sources consulted|Evidence coverage|sourceIds|https:\/\//i);
  assert.equal(cleanModelText('&lt;p&gt;Safe&lt;/p&gt;'), 'Safe');
});

function jsonResponse(payload) { return { ok: true, async json() { return payload; }, async text() { return JSON.stringify(payload); } }; }
function textResponse(text) { return { ok: true, async text() { return text; }, async json() { return {}; } }; }
