import { pathsToNestedList } from './tree.js';

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function list(items = []) {
  if (!items.length) return '<p class="footer-note">No items provided.</p>';
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function sourceList(sources = []) {
  if (!sources.length) return '<p class="footer-note">No source snippets were available for this section.</p>';
  return `<ol class="source-list">${sources.map((source) => {
    const url = safeUrl(source.url);
    const label = source.title || source.url || 'Source';
    const note = source.note ? `<span>${escapeHtml(source.note)}</span>` : '';
    return `<li><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>${note}</li>`;
  }).join('')}</ol>`;
}

function nestedTree(node) {
  if (!node?.children?.length) return '';
  return `<ul>${node.children.map((child) => `<li><strong>${escapeHtml(child.label)}</strong>${nestedTree(child)}</li>`).join('')}</ul>`;
}

function normalizeSources(sources = []) {
  if (!Array.isArray(sources)) return [];
  return sources.map((source) => ({
    title: source?.title || source?.url || 'Source',
    url: source?.url || '',
    note: source?.note || ''
  })).filter((source) => source.url || source.note);
}

export function normalizeAnalysisPayload(payload, selectedItems, options = {}) {
  const title = payload?.title || options.topic || selectedItems?.[0]?.path?.[0] || 'Learning Analysis';
  const summary = payload?.summary || 'Detailed analysis generated from the selected recursive subject levels.';
  const sections = Array.isArray(payload?.sections) ? payload.sections : [];
  const byTitle = new Map(sections.map((section) => [String(section.title || '').toLowerCase(), section]));
  const normalizedSections = selectedItems.map((item) => {
    const fallback = byTitle.get(item.label.toLowerCase()) || {};
    return {
      title: fallback.title || item.label,
      path: fallback.path || item.path,
      simpleDefinition: fallback.simpleDefinition || fallback.definition || `A plain-language definition for ${item.label} was not provided by the analysis model.`,
      currentDetails: fallback.currentDetails || fallback.currentState || fallback.whyItMatters || 'Current source-grounded details were not provided for this section.',
      researchOverview: fallback.researchOverview || fallback.description || fallback.overview || `A focused explanation of ${item.label} in the context of ${item.path.join(' > ')}.`,
      keyTakeaways: fallback.keyTakeaways || [],
      examples: fallback.examples || [],
      sources: normalizeSources(fallback.sources)
    };
  });
  return { title, summary, sections: normalizedSections };
}

export function createPrintableReportHtml({ topic, selectedItems, analysis, options = {} }) {
  const normalized = normalizeAnalysisPayload(analysis, selectedItems, { ...options, topic });
  const tree = pathsToNestedList(selectedItems);
  const created = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const depth = options.depth || 'Detailed';
  const audience = options.audience || 'Intermediate';
  const includeExamples = options.includeExamples !== false;

  const tocRows = normalized.sections.map((section, index) => `
    <div class="toc-row">
      <span>${index + 1}. ${escapeHtml(section.title)}</span>
      <span class="dots"></span>
      <span class="section-label">Section ${index + 1}</span>
    </div>`).join('');

  const sections = normalized.sections.map((section, index) => `
    <section class="section-page report-section" id="report-section-${index + 1}">
      <h2>${index + 1}. ${escapeHtml(section.title)}</h2>
      <div class="topic-path">${escapeHtml((section.path || []).join(' > '))}</div>
      <h3>Simple definition</h3>
      <p>${escapeHtml(section.simpleDefinition)}</p>
      <div class="research-card">
        <h3>Current details</h3>
        <p>${escapeHtml(section.currentDetails)}</p>
      </div>
      <h3>Research overview</h3>
      <p>${escapeHtml(section.researchOverview)}</p>
      ${includeExamples && section.examples?.length ? `<h3>Concrete examples</h3>${list(section.examples)}` : ''}
      <div class="note-card key-takeaways">
        <h4>Key takeaways</h4>
        ${list(section.keyTakeaways)}
      </div>
      <h3>Sources consulted</h3>
      ${sourceList(section.sources)}
    </section>`).join('');

  return `
    <article class="print-doc">
      <section class="cover-page report-section" id="report-cover">
        <h1>${escapeHtml(normalized.title)}</h1>
        <div class="summary-block">
          <h2>Summary</h2>
          <p>${escapeHtml(normalized.summary)}</p>
        </div>
        <p class="meta">Generated ${escapeHtml(created)} - ${escapeHtml(depth)} depth - ${escapeHtml(audience)} audience - ${selectedItems.length} selected topics</p>
      </section>
      <section class="toc-page report-section" id="report-toc">
        <h2>Table of Contents</h2>
        ${tocRows || '<p>No selected sections.</p>'}
      </section>
      <section class="toc-page report-section" id="report-tree">
        <h2>Selected Subject Tree</h2>
        <p>This is the same selected content map used to generate the report.</p>
        <div class="tree-list">${nestedTree(tree)}</div>
      </section>
      ${sections}
    </article>`;
}

export function createReportDownload(reportHtml, title = 'LearnFlow Analysis', styles = '') {
  const safeTitle = String(title)
    .replace(/[_]+/g, ' ')
    .replace(/[^a-z0-9 \-]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'LearnFlow Analysis';
  const styleTag = styles ? `<style>${styles}</style>` : '<link rel="stylesheet" href="styles.css">';
  const fullDocument = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(safeTitle)}</title>${styleTag}</head><body>${reportHtml}</body></html>`;
  return { filename: `${safeTitle}.html`, content: fullDocument };
}

function safeUrl(url) {
  const value = String(url || '').trim();
  if (/^https?:\/\//i.test(value)) return value;
  return '#';
}
