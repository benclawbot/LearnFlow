import { initialTree, palette } from './data.js';
import {
  cloneTree,
  getSelectedNodes,
  toggleSelected,
  clearSelected,
  getVisibleColumns,
  getVisibleEdges,
  findNode,
  setAllSelected,
  setChildren,
  setExpandedToDepth,
  walkTree,
  makeNode
} from './tree.js';
import { exploreTopic, analyzeTopics } from './api.js';
import { createPrintableReportHtml, createReportDownload } from './report.js';

const icons = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 10.8 9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>',
  explore: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M19.1 4.9l-2.8 2.8M7.7 16.3l-2.8 2.8"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.3 7A2 2 0 1 1 7.1 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 21l-1.9-7.8L4 11l6.1-2.2Z"/><path d="M19 3v4M17 5h4"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 14.8A8.2 8.2 0 0 1 9.2 3a7 7 0 1 0 11.8 11.8Z"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.7 2.7 0 0 1 5 1.4c0 1.9-2.5 2.2-2.5 4"/><path d="M12 18h.01"/></svg>',
  fullscreen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/><path d="M9 9 3 3M15 9l6-6M9 15l-6 6M15 15l6 6"/></svg>',
  brandLogo: '<img src="/assets/learnflow-mark.png" alt="" aria-hidden="true" />'
};

const storageKeys = {
  topics: 'learnflow-topic-library',
  analyses: 'learnflow-analyses'
};

let progressTimer = null;

function loadStoredList(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredList(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

const state = {
  screen: 'explore',
  topic: 'Artificial Intelligence',
  tree: cloneTree(initialTree),
  loading: false,
  message: '',
  error: '',
  options: {
    depth: 'Detailed',
    audience: 'Intermediate',
    includeExamples: true,
    includeReferences: true,
    language: 'English',
    outputFormat: 'Printable HTML'
  },
  reportHtml: '',
  reportTitle: 'Artificial Intelligence',
  theme: localStorage.getItem('learnflow-theme') || 'light',
  library: loadStoredList(storageKeys.topics),
  analyses: loadStoredList(storageKeys.analyses),
  progress: null,
  fullscreenTree: false
};

const app = document.getElementById('app');

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
}

function escapeAttr(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function navItem(name, label, icon) {
  return `<button class="${state.screen === name ? 'active' : ''}" data-nav="${name}">${icon}<span>${label}</span></button>`;
}

function shell(content) {
  return `
    <div class="workspace">
      <aside class="sidebar">
        <div class="brand">
          <div class="logo-mark">${icons.brandLogo}</div>
          <div><h1 class="brand-title">LearnFlow</h1><p class="brand-subtitle">Learn any subject, fast.</p></div>
        </div>
        <nav class="nav" aria-label="Main navigation">
          ${navItem('explore', 'Explore', icons.explore)}
          ${navItem('analyses', 'My Analyses', icons.doc)}
          ${navItem('library', 'Topics Library', icons.book)}
          ${navItem('settings', 'Settings', icons.settings)}
        </nav>
        <div class="sidebar-spacer"></div>
      </aside>
      <main class="main">
        ${content}
      </main>
    </div>
    ${renderProgressModal()}
    ${renderTreeFullscreen()}`;
}

function topbar(title, subtitle, actions = '') {
  return `
    <div class="topbar">
      <div class="title-block"><h1>${title}</h1><p>${subtitle}</p></div>
      <div class="icon-actions">
        <button class="icon-btn" data-action="toggle-theme" data-theme-mode="${state.theme}" aria-label="${state.theme === 'dark' ? 'Dark mode active' : 'Light mode active'}">${state.theme === 'dark' ? icons.moon : icons.sun}</button>
        ${actions}
      </div>
    </div>`;
}

function renderExploreScreen() {
  const selected = getSelectedNodes(state.tree);
  const researchAction = `<button class="report-btn" data-action="generate-research-html" ${state.loading || selected.length === 0 ? 'disabled' : ''}>${state.loading ? 'Generating...' : 'Generate Research HTML'}</button>`;
  return shell(`
    ${topbar('Explore Any Subject', 'Enter a topic and explore related subjects in a tree. Select multiple levels to generate a detailed analysis.', researchAction)}
    <section class="search-row">
      <label class="search-box" aria-label="Subject input">${icons.search}<input id="topic-input" value="${escapeAttr(state.topic)}" placeholder="Type a subject and press Enter" /></label>
    </section>
    <section class="explore-grid">
      <div class="tree-panel">
        <div class="panel-title-row">
          <h2>Subjects Tree</h2>
          <div class="tree-toolbar">
            <span class="toolbar-label">Expand levels</span>
            <div class="level-group">
              ${[1, 2, 3, 4, 5].map((level) => `<button class="level-btn" data-action="expand-level" data-level="${level}" ${state.loading ? 'disabled' : ''}>${level}</button>`).join('')}
            </div>
            <button class="secondary-btn compact-btn" data-action="select-tree" ${state.loading ? 'disabled' : ''}>Select all</button>
            ${state.loading ? '<span class="loading-pill">Loading...</span>' : ''}
            <div class="zoom-tools"><button class="tiny-btn" data-action="fullscreen-tree" title="Open fullscreen tree" aria-label="Open fullscreen tree">${icons.fullscreen}</button></div>
          </div>
        </div>
        <div class="tree-scroll"><div class="tree-content" id="tree-content">${renderTree()}</div></div>
        <div class="status-line ${state.error ? 'error' : ''}">${state.error || state.message || ''}</div>
      </div>
      <aside class="side-panel">
        <div class="side-head"><h2>Selected Topics (${selected.length})</h2><button class="text-btn" data-action="clear-selected">Clear all</button></div>
        <div class="selected-list">${selected.length ? selected.map(renderSelectedChip).join('') : '<div class="empty-state">Select any topic or subtopic to include it in the analysis.</div>'}</div>
        <div class="tip-card"><div class="bulb">💡</div><p><strong>Tip:</strong> Expand multiple levels to discover more specific topics to include in your analysis.</p></div>
      </aside>
    </section>`);
}

function renderTree(suffix = '') {
  const columns = getVisibleColumns(state.tree, 5);
  const idSuffix = suffix ? `-${suffix}` : '';
  return `
    <svg class="connector-layer" id="connector-layer${idSuffix}"></svg>
    <div class="tree-columns">
      ${columns.map((nodes, depth) => `<div class="tree-col depth-${depth}">${nodes.map((node) => renderNode(node, depth)).join('')}</div>`).join('')}
    </div>`;
}

function renderNode(node, depth) {
  const p = palette[node.color] || palette.blue;
  const canExpand = depth < 5;
  return `
    <div class="node-card ${node.selected ? 'selected' : ''}" data-node-id="${escapeAttr(node.id)}" data-depth="${depth}" style="--node-color:${p.color};--node-bg:${p.bg};--node-border:${p.border}">
      <div class="node-icon">${p.icon}</div>
      <div class="node-label">${node.label}</div>
      <button class="check" data-action="toggle-node" data-node-id="${escapeAttr(node.id)}" aria-label="Select ${escapeAttr(node.label)}">✓</button>
      ${canExpand ? `<button class="more" data-action="expand-node" data-node-id="${escapeAttr(node.id)}" title="Expand branch">${node.expanded ? '⋮' : '+'}</button>` : ''}
    </div>`;
}

function renderSelectedChip(item) {
  const p = palette[item.color] || palette.blue;
  return `<div class="selected-chip" style="--node-color:${p.color}"><span class="mini-icon">${p.icon}</span><span>${item.label}</span><button data-action="remove-selected" data-node-id="${escapeAttr(item.id)}">×</button></div>`;
}

function renderGenerateScreen() {
  const selected = getSelectedNodes(state.tree);
  return shell(`
    ${topbar('Generate Analysis', 'Review your selected topics and customize your analysis.')}
    <section class="form-screen">
      <div class="card">
        <h2>Selected Topics (${selected.length})</h2>
        <div class="selected-list">${selected.map(renderSelectedChip).join('')}</div>
      </div>
      <div class="card settings">
        <h2>Analysis Settings</h2>
        ${selectField('depth', 'Depth of Analysis', ['Quick', 'Detailed', 'Expert'])}
        ${selectField('audience', 'Audience Level', ['Beginner', 'Intermediate', 'Advanced'])}
        ${switchField('includeExamples', 'Include Examples')}
        ${switchField('includeReferences', 'Include References')}
        ${selectField('language', 'Language', ['English', 'French', 'Spanish', 'German'])}
        ${selectField('outputFormat', 'Output Format', ['Printable HTML'])}
        <button class="primary-btn" data-action="generate-report" ${state.loading || selected.length === 0 ? 'disabled' : ''}>▣ &nbsp; ${state.loading ? 'Generating…' : 'Generate HTML Report'}</button>
        <div class="estimated">Estimated time: ~45 seconds</div>
        <div class="status-line ${state.error ? 'error' : ''}">${state.error || state.message || ''}</div>
      </div>
    </section>`);
}

function selectField(key, label, choices) {
  return `<div class="field"><label for="${key}">${label}</label><select id="${key}" data-option="${key}">${choices.map((choice) => `<option ${state.options[key] === choice ? 'selected' : ''}>${choice}</option>`).join('')}</select></div>`;
}

function switchField(key, label) {
  return `<label class="switch-row"><span>${label}</span><span class="switch"><input type="checkbox" data-option="${key}" ${state.options[key] ? 'checked' : ''}/><span class="slider"></span></span></label>`;
}

function renderCompleteScreen() {
  return shell(`
    ${topbar('Analysis Complete!', 'Your detailed analysis is ready.')}
    <section class="complete-screen">
      <div class="cover-preview">
        <div class="eyebrow">Comprehensive Analysis Report</div>
        <h2>${state.reportTitle}</h2>
        <p>A Deep Dive into Selected Topics</p>
        <div class="network-art">${networkSvg()}</div>
        <p class="meta">Generated by LearnFlow</p>
      </div>
      <div class="card whats-inside">
        <h2>What’s Inside</h2>
        <ul>
          <li>▧ Selected Topics</li><li>☰ Detailed Explanations</li><li>◎ Real-world Examples</li><li>✦ Key Takeaways</li><li>⌁ References & Sources</li><li>☷ Visual Structure</li>
        </ul>
        <div class="action-stack">
          <button class="primary-btn" data-action="download-html">⇩ &nbsp; Download HTML</button>
          <button class="ghost-btn" data-action="view-report">▣ &nbsp; View / Print Report</button>
        </div>
      </div>
    </section>`);
}

function networkSvg() {
  return `<svg width="210" height="160" viewBox="0 0 210 160" fill="none"><g stroke="#7aa5ff" stroke-width="1"><path d="M33 82 72 40l42 27 55-18M72 40l-7 78 49-51 34 54M65 118l83 3 21-72M33 82l81-15"/></g><g>${[[33,82],[72,40],[114,67],[169,49],[65,118],[148,121],[92,101],[128,31]].map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="${i%2?5:4}" fill="${i%2?'#8b5cf6':'#2467e8'}" opacity=".9"/>`).join('')}</g></svg>`;
}

function renderReportScreen() {
  const fileTitle = reportFileTitle();
  return shell(`
    ${topbar(`${fileTitle}.html`, 'Printable HTML report view. Use the browser print dialog to save it as PDF.')}
    <section class="report-layout">
      <aside class="thumbs" aria-label="Report page previews">${renderReportThumbs()}</aside>
      <div class="report-viewer">
        <div class="viewer-bar"><span>${escapeAttr(fileTitle)}.html</span><div class="viewer-tools"><button data-action="back-complete">Back</button><button data-action="download-html">Download</button><button data-action="print-report">Print / Save as PDF</button></div></div>
        <div class="report-paper-wrap"><div class="report-paper">${state.reportHtml}</div></div>
      </div>
    </section>`);
}

function renderReportThumbs() {
  if (!state.reportHtml) return '';
  const doc = new DOMParser().parseFromString(state.reportHtml, 'text/html');
  const sections = [...doc.querySelectorAll('.print-doc > section')];
  return sections.map((section, index) => {
    const id = section.id || `report-section-${index + 1}`;
    const preview = section.outerHTML.replace(/\s+id="[^"]*"/, '');
    return `
      <button class="thumb ${index === 0 ? 'active' : ''}" data-action="jump-report-section" data-section-id="${escapeAttr(id)}" aria-label="Go to report section ${index + 1}">
        <span class="thumb-preview"><span class="thumb-doc">${preview}</span></span>
      </button>`;
  }).join('');
}

function renderProgressModal() {
  if (!state.progress) return '';
  return `
    <div class="modal-backdrop progress-backdrop" role="status" aria-live="polite">
      <section class="progress-modal" aria-label="${escapeAttr(state.progress.title)}">
        <div class="progress-heading">
          <h2>${escapeAttr(state.progress.title)}</h2>
          <span>${state.progress.percent}%</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${state.progress.percent}%"></div></div>
        <p>${escapeAttr(state.progress.label)}</p>
      </section>
    </div>`;
}

function renderTreeFullscreen() {
  if (!state.fullscreenTree) return '';
  return `
    <div class="modal-backdrop tree-fullscreen-backdrop">
      <section class="tree-fullscreen-modal" aria-label="Fullscreen subject tree">
        <div class="fullscreen-head">
          <div>
            <h2>${escapeAttr(state.topic)} subject tree</h2>
            <p>Scroll horizontally or vertically to inspect every loaded branch.</p>
          </div>
          <button class="icon-btn" data-action="close-fullscreen-tree" aria-label="Close fullscreen tree">x</button>
        </div>
        <div class="tree-scroll fullscreen-tree-scroll"><div class="tree-content" id="tree-content-fullscreen">${renderTree('fullscreen')}</div></div>
      </section>
    </div>`;
}

function renderAnalysesScreen() {
  const cards = state.analyses.length ? state.analyses.map((analysis) => `
    <article class="library-card">
      <div>
        <p class="card-eyebrow">${escapeAttr(formatDate(analysis.createdAt))}</p>
        <h2>${escapeAttr(analysis.title)}</h2>
        <p>${escapeAttr(analysis.topic)} · ${analysis.selectedItems?.length || 0} selected topics</p>
      </div>
      <div class="card-actions">
        <button class="primary-btn compact-action" data-action="view-analysis" data-id="${escapeAttr(analysis.id)}">View report</button>
        <button class="secondary-btn compact-action" data-action="download-analysis" data-id="${escapeAttr(analysis.id)}">Download HTML</button>
      </div>
    </article>`).join('') : renderEmptyPanel('No analyses yet', 'Generate a research HTML report and it will appear here.');

  return shell(`
    ${topbar('My Analyses', 'Recall generated research reports and reopen their full HTML preview.')}
    <section class="library-grid">${cards}</section>`);
}

function renderLibraryScreen() {
  state.library = loadStoredList(storageKeys.topics);
  const cards = state.library.length ? state.library.map((entry) => `
    <article class="library-card">
      <div>
        <p class="card-eyebrow">${escapeAttr(formatDate(entry.updatedAt))}</p>
        <h2>${escapeAttr(entry.topic)}</h2>
        <p>${countTreeNodes(entry.tree)} loaded topics · ${getSelectedNodes(entry.tree).length} selected</p>
      </div>
      <div class="card-actions">
        <button class="primary-btn compact-action" data-action="load-library-topic" data-id="${escapeAttr(entry.id)}">Open topic</button>
      </div>
    </article>`).join('') : renderEmptyPanel('No topics saved yet', 'Search for a topic from Explore and it will be added to this library.');

  return shell(`
    ${topbar('Topics Library', 'Recall previously searched topics and continue from the saved tree.')}
    <section class="library-grid">${cards}</section>`);
}

function renderEmptyPanel(title, text) {
  return `<div class="empty-panel"><h2>${escapeAttr(title)}</h2><p>${escapeAttr(text)}</p></div>`;
}

function formatDate(value) {
  if (!value) return 'Recently';
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function countTreeNodes(tree) {
  let count = 0;
  walkTree(tree, () => { count += 1; });
  return count;
}

function renderPlaceholder(name) {
  return shell(`${topbar(name, 'This section is reserved for the production workspace.')}<section class="card" style="margin-top:30px"><h2>${name}</h2><p class="status-line">The core requested Explore → Generate → Printable HTML flow is implemented.</p><button class="primary-btn" data-nav="explore">Return to Explore</button></section>`);
}

function render(options = {}) {
  const treeScroll = options.preserveTreeScroll ? captureTreeScroll() : null;
  applyTheme();
  updateDocumentTitle();
  if (state.screen === 'explore') app.innerHTML = renderExploreScreen();
  else if (state.screen === 'generate') app.innerHTML = renderGenerateScreen();
  else if (state.screen === 'complete') app.innerHTML = renderCompleteScreen();
  else if (state.screen === 'report') app.innerHTML = renderReportScreen();
  else if (state.screen === 'analyses') app.innerHTML = renderAnalysesScreen();
  else if (state.screen === 'library') app.innerHTML = renderLibraryScreen();
  else app.innerHTML = renderPlaceholder(state.screen[0].toUpperCase() + state.screen.slice(1));

  bindEvents();
  if (state.screen === 'explore' || state.fullscreenTree) {
    requestAnimationFrame(() => {
      restoreTreeScroll(treeScroll);
      drawConnectors();
      if (state.fullscreenTree) drawConnectors('fullscreen');
    });
  }
  if (state.screen === 'report') bindReportScroll();
}

function captureTreeScroll() {
  const main = app.querySelector('.explore-grid .tree-scroll:not(.fullscreen-tree-scroll)');
  const fullscreen = app.querySelector('.fullscreen-tree-scroll');
  return {
    main: main ? { top: main.scrollTop, left: main.scrollLeft } : null,
    fullscreen: fullscreen ? { top: fullscreen.scrollTop, left: fullscreen.scrollLeft } : null
  };
}

function restoreTreeScroll(scrollState) {
  if (!scrollState) return;
  const main = app.querySelector('.explore-grid .tree-scroll:not(.fullscreen-tree-scroll)');
  const fullscreen = app.querySelector('.fullscreen-tree-scroll');
  if (main && scrollState.main) {
    main.scrollTop = scrollState.main.top;
    main.scrollLeft = scrollState.main.left;
  }
  if (fullscreen && scrollState.fullscreen) {
    fullscreen.scrollTop = scrollState.fullscreen.top;
    fullscreen.scrollLeft = scrollState.fullscreen.left;
  }
}

function bindEvents() {
  app.querySelectorAll('[data-nav]').forEach((el) => el.addEventListener('click', () => {
    state.screen = el.dataset.nav;
    state.error = '';
    render();
  }));
  app.querySelectorAll('[data-option]').forEach((el) => el.addEventListener('change', () => {
    const key = el.dataset.option;
    state.options[key] = el.type === 'checkbox' ? el.checked : el.value;
  }));
  const topicInput = app.querySelector('#topic-input');
  topicInput?.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter' && !state.loading) {
      event.preventDefault();
      await handleExploreTopic();
    }
  });
  app.querySelectorAll('[data-action]').forEach((el) => el.addEventListener('click', async (event) => {
    const action = el.dataset.action;
    if (action === 'toggle-node') {
      event.stopPropagation();
      state.tree = toggleSelected(state.tree, el.dataset.nodeId);
      persistCurrentTopicTree();
      render({ preserveTreeScroll: true });
    }
    if (action === 'remove-selected') {
      state.tree = toggleSelected(state.tree, el.dataset.nodeId, false);
      persistCurrentTopicTree();
      render({ preserveTreeScroll: true });
    }
    if (action === 'clear-selected') {
      state.tree = clearSelected(state.tree);
      persistCurrentTopicTree();
      render({ preserveTreeScroll: true });
    }
    if (action === 'select-tree') {
      state.tree = setAllSelected(state.tree, true);
      persistCurrentTopicTree();
      state.message = 'Selected every topic currently in the tree.';
      state.error = '';
      render({ preserveTreeScroll: true });
    }
    if (action === 'toggle-theme') {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('learnflow-theme', state.theme);
      render({ preserveTreeScroll: true });
    }
    if (action === 'jump-report-section') {
      const target = document.getElementById(el.dataset.sectionId);
      const wrap = app.querySelector('.report-paper-wrap');
      if (target && wrap) {
        const paper = app.querySelector('.report-paper');
        const top = target.offsetTop + (paper?.offsetTop || 0) - 16;
        wrap.scrollTo({ top, behavior: 'smooth' });
      }
      app.querySelectorAll('.thumb').forEach((thumb) => thumb.classList.toggle('active', thumb === el));
    }
    if (action === 'fullscreen-tree') {
      state.fullscreenTree = true;
      render();
    }
    if (action === 'close-fullscreen-tree') {
      state.fullscreenTree = false;
      render();
    }
    if (action === 'load-library-topic') {
      const entry = state.library.find((item) => item.id === el.dataset.id);
      if (entry?.tree) {
        state.topic = entry.topic;
        state.tree = cloneTree(entry.tree);
        state.screen = 'explore';
        state.message = `${entry.topic} loaded from Topics Library.`;
        state.error = '';
        render();
      }
    }
    if (action === 'view-analysis') {
      const analysis = state.analyses.find((item) => item.id === el.dataset.id);
      if (analysis?.html) {
        state.topic = analysis.topic;
        state.reportTitle = analysis.title;
        state.reportHtml = analysis.html;
        state.screen = 'report';
        render();
      }
    }
    if (action === 'download-analysis') {
      const analysis = state.analyses.find((item) => item.id === el.dataset.id);
      if (analysis?.html) await downloadHtml(analysis);
    }
    if (action === 'open-generate') {
      state.screen = 'generate';
      render();
    }
    if (action === 'explore-topic') await handleExploreTopic();
    if (action === 'expand-node') await handleExpandNode(el.dataset.nodeId);
    if (action === 'expand-level') await handleExpandLevel(Number(el.dataset.level));
    if (action === 'generate-report') await handleGenerateReport();
    if (action === 'generate-research-html') await handleGenerateReport('report');
    if (action === 'view-report') { state.screen = 'report'; render(); }
    if (action === 'back-complete') { state.screen = 'complete'; render(); }
    if (action === 'print-report') {
      document.title = reportFileTitle();
      window.print();
    }
    if (action === 'download-html') await downloadHtml();
  }));
  app.querySelectorAll('.node-card').forEach((card) => card.addEventListener('dblclick', () => handleExpandNode(card.dataset.nodeId)));
}

function updateDocumentTitle() {
  document.title = state.screen === 'report' && state.reportTitle ? reportFileTitle() : 'LearnFlow - Explore Any Subject';
}

function reportFileTitle(analysis = null) {
  const value = analysis?.title || state.reportTitle || state.topic || 'LearnFlow Report';
  return cleanFileTitle(value);
}

function cleanFileTitle(value) {
  return String(value || 'LearnFlow Report')
    .replace(/[_]+/g, ' ')
    .replace(/[^a-z0-9 \-]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'LearnFlow Report';
}

function makeEntryId(value) {
  const slug = cleanFileTitle(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'entry';
  return `${Date.now()}-${slug}`;
}

function saveTopicToLibrary(topic, tree) {
  const normalized = topic.trim().toLowerCase();
  const entry = {
    id: makeEntryId(topic),
    topic,
    tree: cloneTree(tree),
    updatedAt: new Date().toISOString()
  };
  state.library = [entry, ...state.library.filter((item) => item.topic.toLowerCase() !== normalized)].slice(0, 24);
  saveStoredList(storageKeys.topics, state.library);
}

function persistCurrentTopicTree() {
  if (!state.topic || !state.tree) return;
  saveTopicToLibrary(state.topic, state.tree);
}

function saveAnalysisToLibrary({ title, topic, html, selectedItems }) {
  const entry = {
    id: makeEntryId(title || topic),
    title: title || topic,
    topic,
    html,
    selectedItems,
    createdAt: new Date().toISOString()
  };
  state.analyses = [entry, ...state.analyses].slice(0, 24);
  saveStoredList(storageKeys.analyses, state.analyses);
  return entry;
}

function startProgress(title) {
  stopProgressTimer();
  const started = Date.now();
  state.progress = { title, percent: 3, label: 'Preparing selected topics...' };
  progressTimer = setInterval(() => {
    const elapsed = (Date.now() - started) / 1000;
    const curved = Math.round(8 + 84 * (1 - Math.exp(-elapsed / 24)));
    const percent = Math.min(92, Math.max(state.progress?.percent || 0, curved));
    state.progress = { title, percent, label: progressLabel(percent) };
    render();
  }, 900);
}

async function completeProgress(label = 'Done.') {
  stopProgressTimer();
  if (state.progress) {
    state.progress = { ...state.progress, percent: 100, label };
    render();
    await delay(550);
  }
  state.progress = null;
}

function stopProgressTimer() {
  if (progressTimer) clearInterval(progressTimer);
  progressTimer = null;
}

function progressLabel(percent) {
  if (percent < 18) return 'Preparing selected topics...';
  if (percent < 42) return 'Collecting web research for each selected branch...';
  if (percent < 68) return 'Writing source-grounded definitions and current details...';
  if (percent < 88) return 'Building the styled HTML preview...';
  return 'Final checks before opening the report...';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bindReportScroll() {
  const wrap = app.querySelector('.report-paper-wrap');
  if (!wrap) return;
  const sections = [...wrap.querySelectorAll('.print-doc > section[id]')];
  const syncActiveThumb = () => {
    const wrapTop = wrap.getBoundingClientRect().top;
    let activeId = sections[0]?.id;
    for (const section of sections) {
      if (section.getBoundingClientRect().top - wrapTop <= 110) activeId = section.id;
    }
    app.querySelectorAll('.thumb').forEach((thumb) => {
      const active = thumb.dataset.sectionId === activeId;
      thumb.classList.toggle('active', active);
      if (active) thumb.scrollIntoView({ block: 'nearest' });
    });
  };
  wrap.addEventListener('scroll', syncActiveThumb, { passive: true });
  syncActiveThumb();
}

async function handleExploreTopic() {
  const input = app.querySelector('#topic-input');
  const topic = input?.value?.trim() || 'Artificial Intelligence';
  state.topic = topic;
  const pendingRoot = makeNode(topic, '', 0, 'violet');
  pendingRoot.expanded = true;
  saveTopicToLibrary(topic, pendingRoot);
  state.loading = true;
  state.error = '';
  state.message = 'Generating a fresh subject map with MiniMax M3…';
  render();
  try {
    const result = await exploreTopic({ topic, depth: 2, parentPath: [topic] });
    const root = makeNode(topic, '', 0, 'violet');
    root.expanded = true;
    root.children = (result.subjects || []).map((child, index) => ({
      ...makeNode(child.label || child, root.id, index, ['blue', 'green', 'orange', 'purple'][index % 4]),
      children: (child.children || []).map((grandChild, childIndex) => makeNode(grandChild.label || grandChild, `${root.id}-${index}`, childIndex, ['blue', 'green', 'orange', 'purple'][index % 4])),
      expanded: true
    }));
    state.tree = root;
    saveTopicToLibrary(topic, state.tree);
    state.message = 'Subject map generated.';
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    render();
  }
}

async function handleExpandNode(nodeId) {
  const node = findNode(state.tree, nodeId);
  if (!node) return;
  if (node.children?.length) {
    const next = cloneTree(state.tree);
    const target = findNode(next, nodeId);
    target.expanded = !target.expanded;
    state.tree = next;
    persistCurrentTopicTree();
    render({ preserveTreeScroll: true });
    return;
  }
  state.loading = true;
  state.error = '';
  state.message = `Expanding ${node.label} with MiniMax M3…`;
  render({ preserveTreeScroll: true });
  try {
    const result = await exploreTopic({ topic: node.label, depth: 1, parentPath: getNodePath(nodeId) });
    const children = (result.subjects || []).slice(0, 5).map((child, index) => makeNode(child.label || child, node.id, index, node.color || 'blue'));
    state.tree = setChildren(state.tree, nodeId, children);
    persistCurrentTopicTree();
    state.message = `${node.label} expanded.`;
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    render({ preserveTreeScroll: true });
  }
}

async function handleExpandLevel(level) {
  state.loading = true;
  state.error = '';
  state.message = `Expanding every branch to level ${level}...`;
  render({ preserveTreeScroll: true });
  try {
    let nextTree = setExpandedToDepth(state.tree, level);
    for (let depth = 0; depth < level; depth += 1) {
      const leaves = getLeavesMissingChildren(nextTree, depth);
      for (const node of leaves) {
        state.tree = setExpandedToDepth(nextTree, level);
        state.message = `Loading branches for ${node.label}...`;
        render({ preserveTreeScroll: true });
        const result = await exploreTopic({ topic: node.label, depth: 1, parentPath: node.path });
        const children = makeChildrenFromSubjects(result.subjects || [], node);
        nextTree = setChildren(nextTree, node.id, children);
        nextTree = setExpandedToDepth(nextTree, level);
      }
    }
    state.tree = setExpandedToDepth(nextTree, level);
    persistCurrentTopicTree();
    state.message = `Expanded every branch to level ${level}.`;
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    render({ preserveTreeScroll: true });
  }
}

function getLeavesMissingChildren(tree, depth) {
  const leaves = [];
  walkTree(tree, (node, path, nodeDepth) => {
    if (nodeDepth === depth && nodeDepth < 5 && !(node.children || []).length) {
      leaves.push({ ...node, path });
    }
  });
  return leaves;
}

function makeChildrenFromSubjects(subjects, parent) {
  return subjects.slice(0, 4).map((child, index) => {
    const node = makeNode(child.label || child, parent.id, index, parent.color || 'blue');
    node.children = (child.children || []).slice(0, 4).map((grandChild, childIndex) => makeNode(grandChild.label || grandChild, node.id, childIndex, node.color || 'blue'));
    return node;
  });
}

async function handleGenerateReport(nextScreen = 'complete') {
  const selectedItems = getSelectedNodes(state.tree);
  if (!selectedItems.length) return;
  state.loading = true;
  state.error = '';
  state.message = 'Generating printable HTML analysis with MiniMax M3…';
  startProgress('Generating research HTML');
  render();
  try {
    const analysis = await analyzeTopics({ topic: state.topic, selectedItems, options: state.options });
    state.reportTitle = analysis.title || state.topic;
    state.reportHtml = createPrintableReportHtml({ topic: state.topic, selectedItems, analysis, options: state.options });
    saveAnalysisToLibrary({ title: state.reportTitle, topic: state.topic, html: state.reportHtml, selectedItems });
    await completeProgress('HTML report ready.');
    state.message = 'Analysis generated.';
    state.screen = nextScreen;
  } catch (error) {
    stopProgressTimer();
    state.progress = null;
    state.error = error.message;
  } finally {
    state.loading = false;
    render();
  }
}

function getNodePath(nodeId) {
  let path = [];
  const walk = (node, current) => {
    if (node.id === nodeId) {
      path = [...current, node.label];
      return;
    }
    for (const child of node.children || []) walk(child, [...current, node.label]);
  };
  walk(state.tree, []);
  return path;
}

function drawConnectors(suffix = '') {
  const idSuffix = suffix ? `-${suffix}` : '';
  const content = document.getElementById(`tree-content${idSuffix}`);
  const svg = document.getElementById(`connector-layer${idSuffix}`);
  if (!content || !svg) return;
  const rect = content.getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
  svg.setAttribute('width', rect.width);
  svg.setAttribute('height', rect.height);
  const cards = new Map([...content.querySelectorAll('.node-card')].map((card) => [card.dataset.nodeId, card]));
  const colorMap = Object.fromEntries(Object.entries(palette).map(([key, value]) => [key, value.color]));
  const paths = getVisibleEdges(state.tree, 5).map((edge) => {
    const from = cards.get(edge.from);
    const to = cards.get(edge.to);
    if (!from || !to) return '';
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const x1 = a.right - rect.left;
    const y1 = a.top + a.height / 2 - rect.top;
    const x2 = b.left - rect.left;
    const y2 = b.top + b.height / 2 - rect.top;
    const mid = x1 + Math.max(35, (x2 - x1) * 0.48);
    const stroke = colorMap[edge.color] || colorMap.blue;
    return `<path d="M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}" fill="none" stroke="${stroke}" stroke-width="1.5" opacity="0.72"/>`;
  }).join('');
  svg.innerHTML = paths;
}

async function downloadHtml(analysis = null) {
  const reportHtml = analysis?.html || state.reportHtml;
  if (!reportHtml) return;
  const css = await fetch('/styles.css').then((response) => response.ok ? response.text() : '').catch(() => '');
  const { filename, content } = createReportDownload(reportHtml, reportFileTitle(analysis), css);
  const blob = new Blob([content], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

render();
