import { pathsToNestedList } from './tree.js';

const LANGUAGE_CONFIG = {
  English: {
    locale: 'en-US',
    labels: {
      summary: 'Summary', contents: 'Table of Contents', tree: 'Selected Subject Tree', treeNote: 'This is the same selected content map used to generate the report.',
      definition: 'Simple definition', details: 'Current details', overview: 'Research overview', examples: 'Concrete examples',
      takeaways: 'Key takeaways', sources: 'Sources consulted', coverage: 'Evidence coverage', generated: 'Generated',
      depth: 'depth', audience: 'audience', topics: 'selected topics', noItems: 'No items provided.', noSources: 'No relevant source was retained for this section.'
    }
  },
  French: {
    locale: 'fr-FR',
    labels: {
      summary: 'Résumé', contents: 'Table des matières', tree: 'Arborescence sélectionnée', treeNote: 'Cette carte correspond aux sujets sélectionnés pour générer le rapport.',
      definition: 'Définition simple', details: 'Éléments actuels', overview: 'Vue d’ensemble', examples: 'Exemples concrets',
      takeaways: 'Points clés', sources: 'Sources consultées', coverage: 'Couverture des preuves', generated: 'Généré le',
      depth: 'niveau de détail', audience: 'public', topics: 'sujets sélectionnés', noItems: 'Aucun élément fourni.', noSources: 'Aucune source pertinente retenue pour cette section.'
    }
  },
  Spanish: {
    locale: 'es-ES',
    labels: {
      summary: 'Resumen', contents: 'Índice', tree: 'Árbol de temas seleccionado', treeNote: 'Este es el mismo mapa de contenido seleccionado para generar el informe.',
      definition: 'Definición sencilla', details: 'Detalles actuales', overview: 'Descripción de la investigación', examples: 'Ejemplos concretos',
      takeaways: 'Conclusiones clave', sources: 'Fuentes consultadas', coverage: 'Cobertura de evidencia', generated: 'Generado',
      depth: 'profundidad', audience: 'audiencia', topics: 'temas seleccionados', noItems: 'No se proporcionaron elementos.', noSources: 'No se retuvo ninguna fuente relevante para esta sección.'
    }
  },
  German: {
    locale: 'de-DE',
    labels: {
      summary: 'Zusammenfassung', contents: 'Inhaltsverzeichnis', tree: 'Ausgewählter Themenbaum', treeNote: 'Dies ist dieselbe Inhaltsstruktur, die zur Erstellung des Berichts verwendet wurde.',
      definition: 'Einfache Definition', details: 'Aktuelle Erkenntnisse', overview: 'Forschungsüberblick', examples: 'Konkrete Beispiele',
      takeaways: 'Wichtigste Erkenntnisse', sources: 'Verwendete Quellen', coverage: 'Evidenzabdeckung', generated: 'Erstellt',
      depth: 'Detailtiefe', audience: 'Zielgruppe', topics: 'ausgewählte Themen', noItems: 'Keine Elemente angegeben.', noSources: 'Für diesen Abschnitt wurde keine relevante Quelle beibehalten.'
    }
  }
};

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function cleanModelText(value) {
  return decodeEntities(String(value ?? ''))
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<\/p\s*>/gi, ' ')
    .replace(/<p(?:\s[^>]*)?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[`*_#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeParagraphs(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.flatMap((entry) => {
    const decoded = decodeEntities(String(entry ?? ''))
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/p\s*>/gi, '\n\n')
      .replace(/<p(?:\s[^>]*)?>/gi, '');
    return decoded.split(/\n\s*\n+/).map(cleanModelText).filter(Boolean);
  }))];
}

function normalizeList(items = []) {
  const values = Array.isArray(items) ? items : items ? [items] : [];
  return [...new Set(values.map(cleanModelText).filter(Boolean))];
}

function list(items = [], emptyLabel = 'No items provided.') {
  if (!items.length) return `<p class="footer-note">${escapeHtml(emptyLabel)}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function paragraphList(paragraphs = []) {
  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('');
}

function sourceList(sources = [], labels) {
  if (!sources.length) return `<p class="footer-note">${escapeHtml(labels.noSources)}</p>`;
  return `<ol class="source-list">${sources.map((source) => {
    const url = safeUrl(source.url);
    const label = cleanModelText(source.title || source.url || 'Source');
    const details = [source.publisher, source.publishedAt, source.sourceType].map(cleanModelText).filter(Boolean).join(' · ');
    const note = cleanModelText(source.note || '');
    return `<li><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>${details ? `<span>${escapeHtml(details)}</span>` : ''}${note ? `<span>${escapeHtml(note)}</span>` : ''}</li>`;
  }).join('')}</ol>`;
}

function nestedTree(node) {
  if (!node?.children?.length) return '';
  return `<ul>${node.children.map((child) => `<li><strong>${escapeHtml(child.label)}</strong>${nestedTree(child)}</li>`).join('')}</ul>`;
}

function normalizeSources(sources = []) {
  if (!Array.isArray(sources)) return [];
  const seen = new Set();
  return sources.map((source) => ({
    id: cleanModelText(source?.id || ''),
    title: cleanModelText(source?.title || source?.url || 'Source'),
    url: source?.url || '',
    note: cleanModelText(source?.note || ''),
    publisher: cleanModelText(source?.publisher || ''),
    publishedAt: cleanModelText(source?.publishedAt || ''),
    sourceType: cleanModelText(source?.sourceType || '')
  })).filter((source) => {
    const key = source.id || source.url || source.title;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return Boolean(source.url || source.note);
  });
}

export function normalizeAnalysisPayload(payload, selectedItems, options = {}) {
  const title = cleanModelText(payload?.title || options.topic || selectedItems?.[0]?.path?.[0] || 'Learning Analysis');
  const summary = cleanModelText(payload?.summary || 'Detailed analysis generated from the selected recursive subject levels.');
  const sections = Array.isArray(payload?.sections) ? payload.sections : [];
  const byTitle = new Map(sections.map((section) => [String(section.title || '').toLowerCase(), section]));
  const normalizedSections = selectedItems.map((item, index) => {
    const fallback = sections[index] || byTitle.get(item.label.toLowerCase()) || {};
    return {
      title: cleanModelText(fallback.title || item.label),
      path: item.path,
      sectionKind: fallback.sectionKind || selectionKind(item, selectedItems),
      simpleDefinition: cleanModelText(fallback.simpleDefinition || fallback.definition || `A plain-language definition for ${item.label} was not provided by the analysis model.`),
      currentDetails: normalizeParagraphs(fallback.currentDetails || fallback.currentState || fallback.whyItMatters),
      researchOverview: normalizeParagraphs(fallback.researchOverview || fallback.description || fallback.overview || `A focused explanation of ${item.label} in the context of ${item.path.join(' > ')}.`),
      keyTakeaways: normalizeList(fallback.keyTakeaways),
      examples: normalizeList(fallback.examples),
      sources: normalizeSources(fallback.sources),
      coverage: ['good', 'partial', 'insufficient'].includes(fallback.coverage) ? fallback.coverage : (fallback.sources?.length ? 'partial' : 'insufficient'),
      confidence: Number.isFinite(Number(fallback.confidence)) ? Number(fallback.confidence) : 0,
      coverageNote: cleanModelText(fallback.coverageNote || '')
    };
  });
  return { title, summary, sections: normalizedSections };
}

export function createPrintableReportHtml({ topic, selectedItems, analysis, options = {} }) {
  const normalized = normalizeAnalysisPayload(analysis, selectedItems, { ...options, topic });
  const tree = pathsToNestedList(selectedItems);
  const language = LANGUAGE_CONFIG[options.language] || LANGUAGE_CONFIG.English;
  const labels = language.labels;
  const created = new Date().toLocaleDateString(language.locale, { year: 'numeric', month: 'long', day: 'numeric' });
  const depth = options.depth || 'Detailed';
  const audience = options.audience || 'Intermediate';
  const includeExamples = options.includeExamples !== false;
  const includeReferences = options.includeReferences !== false;
  const forest = buildSectionForest(normalized.sections);
  const coverageCounts = normalized.sections.reduce((counts, section) => {
    counts[section.coverage] = (counts[section.coverage] || 0) + 1;
    return counts;
  }, { good: 0, partial: 0, insufficient: 0 });

  const tocRows = normalized.sections.map((section, index) => {
    const level = selectedAncestorCount(section, normalized.sections);
    return `
    <div class="toc-row ${level ? 'nested' : ''}" style="padding-left:${level * 18}px">
      <span>${level ? '↳ ' : ''}${index + 1}. ${escapeHtml(section.title)}</span>
      <span class="dots"></span>
      <span class="section-label">${escapeHtml(labels.coverage)}: ${escapeHtml(section.coverage)}</span>
    </div>`;
  }).join('');

  const sections = forest.map((node) => renderSectionNode(node, {
    labels,
    includeExamples,
    includeReferences,
    normalizedSections: normalized.sections
  })).join('');

  return `
    <article class="print-doc">
      <section class="cover-page report-section" id="report-cover">
        <h1>${escapeHtml(normalized.title)}</h1>
        <div class="summary-block">
          <h2>${escapeHtml(labels.summary)}</h2>
          <p>${escapeHtml(normalized.summary)}</p>
        </div>
        <div class="takeaway" aria-label="${escapeHtml(labels.coverage)}">
          <strong>${escapeHtml(labels.coverage)}:</strong>
          ${coverageCounts.good} good · ${coverageCounts.partial} partial · ${coverageCounts.insufficient} insufficient
        </div>
        <p class="meta">${escapeHtml(labels.generated)} ${escapeHtml(created)} - ${escapeHtml(depth)} ${escapeHtml(labels.depth)} - ${escapeHtml(audience)} ${escapeHtml(labels.audience)} - ${selectedItems.length} ${escapeHtml(labels.topics)}</p>
      </section>
      <section class="toc-page report-section" id="report-toc">
        <h2>${escapeHtml(labels.contents)}</h2>
        ${tocRows || '<p>No selected sections.</p>'}
      </section>
      <section class="toc-page report-section" id="report-tree">
        <h2>${escapeHtml(labels.tree)}</h2>
        <p>${escapeHtml(labels.treeNote)}</p>
        <div class="tree-list">${nestedTree(tree)}</div>
      </section>
      ${sections}
    </article>`;
}

function renderSectionNode(node, context, depth = 0) {
  const { section, children, index } = node;
  const { labels, includeExamples, includeReferences } = context;
  const wrapperClass = depth === 0 ? 'section-page report-section' : 'report-subsection';
  const headingTag = depth === 0 ? 'h2' : depth === 1 ? 'h3' : 'h4';
  const blockTag = depth === 0 ? 'h3' : 'h4';
  const coverage = section.coverage || 'insufficient';
  const details = section.currentDetails.length ? `${tag(blockTag, labels.details)}${paragraphList(section.currentDetails)}` : '';
  const overview = section.researchOverview.length ? `${tag(blockTag, labels.overview)}${paragraphList(section.researchOverview)}` : '';
  const examples = includeExamples && section.examples.length ? `${tag(blockTag, labels.examples)}${list(section.examples, labels.noItems)}` : '';
  const takeaways = section.keyTakeaways.length ? `<div class="note-card key-takeaways">${tag('h4', labels.takeaways)}${list(section.keyTakeaways, labels.noItems)}</div>` : '';
  const sources = includeReferences && section.sources.length ? `${tag(blockTag, labels.sources)}${sourceList(section.sources, labels)}` : '';
  const coverageNote = section.coverageNote || (coverage === 'insufficient' ? labels.noSources : '');

  return `
    <section class="${wrapperClass} coverage-${escapeHtml(coverage)}" id="report-section-${index + 1}">
      <${headingTag}>${index + 1}. ${escapeHtml(section.title)}</${headingTag}>
      <div class="topic-path">${escapeHtml((section.path || []).join(' > '))}</div>
      <div class="status-line ${coverage === 'insufficient' ? 'error' : coverage === 'good' ? 'ok' : ''}">${escapeHtml(labels.coverage)}: ${escapeHtml(coverage)}${section.confidence ? ` (${Math.round(section.confidence * 100)}%)` : ''}</div>
      ${coverageNote ? `<div class="takeaway"><strong>${escapeHtml(labels.coverage)}:</strong> ${escapeHtml(coverageNote)}</div>` : ''}
      ${tag(blockTag, labels.definition)}
      <p>${escapeHtml(section.simpleDefinition)}</p>
      ${details}
      ${overview}
      ${examples}
      ${takeaways}
      ${sources}
      ${children.map((child) => renderSectionNode(child, context, depth + 1)).join('')}
    </section>`;
}

function buildSectionForest(sections) {
  const nodes = sections.map((section, index) => ({ section, index, children: [], parent: null }));
  for (const node of nodes) {
    let parent = null;
    for (const candidate of nodes) {
      if (candidate === node || !isPathPrefix(candidate.section.path, node.section.path)) continue;
      if (!parent || candidate.section.path.length > parent.section.path.length) parent = candidate;
    }
    if (parent) {
      node.parent = parent;
      parent.children.push(node);
    }
  }
  return nodes.filter((node) => !node.parent);
}

function selectedAncestorCount(section, sections) {
  return sections.filter((candidate) => candidate !== section && isPathPrefix(candidate.path, section.path)).length;
}

function selectionKind(item, selectedItems) {
  return selectedItems.some((candidate) => candidate !== item && isPathPrefix(item.path, candidate.path)) ? 'overview' : 'detail';
}

function isPathPrefix(parentPath = [], childPath = []) {
  return childPath.length > parentPath.length && parentPath.every((part, index) => cleanModelText(part).toLowerCase() === cleanModelText(childPath[index]).toLowerCase());
}

function tag(name, text) {
  return `<${name}>${escapeHtml(text)}</${name}>`;
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

function decodeEntities(value) {
  return String(value || '')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&amp;/gi, '&');
}
