import test from 'node:test';
import assert from 'node:assert/strict';
import { initialTree } from '../src/data.js';
import { getSelectedNodes } from '../src/tree.js';
import { createPrintableReportHtml, createReportDownload, escapeHtml, normalizeAnalysisPayload } from '../src/report.js';

test('escapeHtml prevents raw script injection in generated report', () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
});

test('normalizeAnalysisPayload creates one section for each selected topic', () => {
  const selectedItems = getSelectedNodes(initialTree).slice(0, 3);
  const normalized = normalizeAnalysisPayload({ title: 'AI' }, selectedItems, { topic: 'AI' });
  assert.equal(normalized.sections.length, 3);
  assert.equal(normalized.sections[0].title, selectedItems[0].label);
});

test('createPrintableReportHtml includes table of contents and selected subject tree', () => {
  const selectedItems = getSelectedNodes(initialTree).slice(0, 2);
  const html = createPrintableReportHtml({
    topic: 'Artificial Intelligence',
    selectedItems,
    analysis: { title: 'Artificial Intelligence', summary: 'Summary', sections: [] },
    options: { depth: 'Detailed', audience: 'Intermediate', includeExamples: true }
  });
  assert.match(html, /Table of Contents/);
  assert.match(html, /Selected Subject Tree/);
  assert.match(html, /id="report-cover"/);
  assert.match(html, /class="summary-block"/);
  assert.match(html, /id="report-section-1"/);
  assert.match(html, /Machine Learning/);
  assert.match(html, /Supervised Learning/);
  assert.doesNotMatch(html, /Comprehensive Learning Analysis/);
  assert.doesNotMatch(html, /class="report-logo"/);
});

test('createReportDownload embeds styles and keeps filenames readable', () => {
  const download = createReportDownload('<article class="print-doc"></article>', 'AI_Analysis Report', '.print-doc{color:red}');
  assert.equal(download.filename, 'AI Analysis Report.html');
  assert.match(download.content, /<style>\.print-doc\{color:red\}<\/style>/);
  assert.doesNotMatch(download.filename, /_/);
});
