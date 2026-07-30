import test from 'node:test';
import assert from 'node:assert/strict';
import { initialTree } from '../src/data.js';
import { getSelectedNodes } from '../src/tree.js';
import { createPrintableReportHtml, createReportDownload, escapeHtml, normalizeAnalysisPayload } from '../src/report.js';

test('escapeHtml prevents raw script injection in generated report', () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
});

test('normalizeAnalysisPayload creates a dossier chapter model and supports legacy sections', () => {
  const selectedItems = getSelectedNodes(initialTree).slice(0, 3);
  const normalized = normalizeAnalysisPayload({ title: 'AI', sections: [{ title: 'Machine Learning', simpleDefinition: 'Definition', researchOverview: 'Overview' }] }, selectedItems, { topic: 'AI' });
  assert.equal(normalized.title, 'AI');
  assert.equal(normalized.chapters.length, 1);
  assert.equal(normalized.chapters[0].title, 'Machine Learning');
});

test('createPrintableReportHtml includes dossier contents and selected research scope without evidence UI', () => {
  const selectedItems = getSelectedNodes(initialTree).slice(0, 2);
  const html = createPrintableReportHtml({ topic: 'Artificial Intelligence', selectedItems, analysis: { title: 'Artificial Intelligence', researchQuestion: 'How should AI be understood?', executiveSummary: ['Answer.'], chapters: [] }, options: { depth: 'Detailed', audience: 'Intermediate', includeExamples: true, includeReferences: true } });
  assert.match(html, /Executive Summary/);
  assert.match(html, /Contents/);
  assert.match(html, /Research Scope/);
  assert.match(html, /id="report-cover"/);
  assert.match(html, /Machine Learning/);
  assert.doesNotMatch(html, /Evidence coverage/);
  assert.doesNotMatch(html, /Sources consulted/);
});

test('createPrintableReportHtml renders a substantial analytical chapter and comparison table', () => {
  const selectedItems = [{ label: 'Agent Architecture', path: ['AI Agents', 'Agent Architecture'] }];
  const html = createPrintableReportHtml({ topic: 'AI Agents', selectedItems, analysis: {
    title: 'AI Agent Architecture', subtitle: 'How reliable agents are assembled', researchQuestion: 'Which architecture choices matter?', scopeSummary: 'Planning, memory, tools, orchestration, and evaluation.', executiveSummary: ['Reliable systems separate concerns and instrument every loop.'], keyFindings: [{ title: 'Separation of concerns', explanation: 'Planning, memory, and action should be independently observable.' }],
    chapters: [{ id: 'chapter-1', title: 'Core Architecture', thesis: 'Architecture determines controllability and failure isolation.', opening: ['An agent is a controlled loop, not merely a model call.'], sections: [{ heading: 'Planning loop', paragraphs: ['A planning loop converts goals into bounded actions and evaluates results.'], takeaways: ['Keep plans inspectable.'] }, { heading: 'Memory and tools', paragraphs: ['Memory and tools need explicit contracts, permissions, and failure handling.'], takeaways: [] }], comparisonTable: { title: 'Architecture patterns', columns: ['Pattern', 'Strength', 'Risk'], rows: [['Single loop', 'Simple', 'Coupled failures']] }, practicalImplications: ['Instrument each boundary.'], limitations: ['No architecture eliminates model uncertainty.'] }],
    conclusion: ['Reliable agents depend on observable boundaries.'], recommendations: ['Define tool contracts.'], openQuestions: ['How should long-term memory be evaluated?']
  }, options: { includeExamples: true, includeReferences: true } });
  assert.match(html, /Core Architecture/);
  assert.match(html, /Planning loop/);
  assert.match(html, /Architecture patterns/);
  assert.match(html, /Practical Implications/);
  assert.match(html, /Open Questions/);
  assert.doesNotMatch(html, /Sources consulted|Evidence coverage|https:\/\//i);
});

test('createReportDownload embeds styles and keeps filenames readable', () => {
  const download = createReportDownload('<article class="print-doc"></article>', 'AI_Analysis Report', '.print-doc{color:red}');
  assert.equal(download.filename, 'AI Analysis Report.html');
  assert.match(download.content, /<style>\.print-doc\{color:red\}<\/style>/);
  assert.doesNotMatch(download.filename, /_/);
});
