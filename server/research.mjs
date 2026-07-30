const DEFAULT_TIMEOUT_MS = 6500;
const MAX_SOURCES_PER_TOPIC = 6;
const MAX_NOTE_LENGTH = 900;
const MAX_RESEARCH_CONCURRENCY = 3;
const MIN_RELEVANCE_SCORE = 0.38;

const GENERIC_TERMS = new Set([
  'a', 'an', 'and', 'application', 'applications', 'analysis', 'code', 'current', 'for', 'flow',
  'in', 'making', 'methods', 'of', 'overview', 'proper', 'software', 'the', 'to', 'tools', 'with'
]);

const SOFTWARE_CONTEXT_TERMS = new Set([
  'api', 'assembly', 'binary', 'compiler', 'control', 'data', 'decompilation', 'disassembly',
  'executable', 'program', 'programming', 'reverse', 'runtime', 'software', 'source', 'static'
]);

const UNRELATED_DOMAIN_TERMS = new Set([
  'behavioural', 'biology', 'cell', 'cognition', 'cognitive', 'mitochondria', 'organelle',
  'psychology', 'psychological', 'therapy'
]);

export async function collectResearchPacks({ topic = '', selectedItems = [] } = {}, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!fetchImpl || !Array.isArray(selectedItems) || selectedItems.length === 0) return [];

  return mapWithConcurrency(
    selectedItems,
    options.concurrency || MAX_RESEARCH_CONCURRENCY,
    (item) => collectResearchForItem({ topic, item, fetchImpl, timeoutMs: options.timeoutMs })
  );
}

export function buildResearchQueries({ topic = '', item = {} } = {}) {
  const label = cleanText(item.label || item.title || '');
  const path = dedupeTerms(Array.isArray(item.path) ? item.path : []);
  const ancestors = path.filter((part) => normalizePhrase(part) !== normalizePhrase(label));
  const nearestContext = ancestors.slice(-2).join(' ');
  const root = cleanText(topic || path[0] || '');
  const domainHint = inferDomainHint([root, ...path, label].join(' '));

  return dedupeTerms([
    compact([label, nearestContext]).join(' '),
    compact([label, domainHint]).join(' '),
    compact([label, nearestContext, 'methods tools']).join(' ')
  ]).filter(Boolean);
}

async function collectResearchForItem({ topic, item, fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const path = Array.isArray(item.path) ? item.path : [];
  const queries = buildResearchQueries({ topic, item });
  let candidates = [];
  let attemptedQueries = [];

  for (const query of queries) {
    attemptedQueries.push(query);
    const searches = await Promise.allSettled([
      fetchWikipediaSources(query, fetchImpl, timeoutMs),
      fetchDuckDuckGoSources(query, fetchImpl, timeoutMs),
      fetchSemanticScholarSources(query, fetchImpl, timeoutMs),
      fetchOpenAlexSources(query, fetchImpl, timeoutMs)
    ]);
    candidates.push(...searches.flatMap((result) => result.status === 'fulfilled' ? result.value : []));
    const relevant = scoreAndFilterSources(candidates, { topic, item });
    if (relevant.length >= 3 && relevant[0].relevanceScore >= 0.62) break;
  }

  const sources = scoreAndFilterSources(candidates, { topic, item })
    .slice(0, MAX_SOURCES_PER_TOPIC)
    .map((source, index) => ({
      ...source,
      id: `${slugify(item.label || item.title || 'topic')}-s${index + 1}`
    }));
  const coverage = coverageForSources(sources);

  return {
    title: item.label,
    path,
    queries: attemptedQueries,
    fetchedAt: new Date().toISOString(),
    coverage: coverage.level,
    confidence: coverage.confidence,
    sources
  };
}

export function scoreAndFilterSources(sources, { topic = '', item = {} } = {}) {
  return dedupeSources(sources)
    .map((source) => ({ ...source, relevanceScore: scoreSource(source, { topic, item }) }))
    .filter((source) => source.relevanceScore >= MIN_RELEVANCE_SCORE)
    .sort((a, b) => b.relevanceScore - a.relevanceScore || sourceQuality(b) - sourceQuality(a));
}

export function scoreSource(source, { topic = '', item = {} } = {}) {
  const label = cleanText(item.label || item.title || '');
  const labelPhrase = normalizePhrase(label.replace(/\banalysis\b/gi, ''));
  const labelTokens = meaningfulTokens(label);
  const contextTokens = meaningfulTokens([topic, ...(item.path || [])].join(' '));
  const text = normalizePhrase(`${source.title || ''} ${source.note || ''}`);
  const textTokens = new Set(tokenize(text));
  const distinctive = labelTokens.filter((token) => !GENERIC_TERMS.has(token));
  const labelCoverage = ratio(labelTokens.filter((token) => textTokens.has(token)).length, labelTokens.length);
  const contextCoverage = Math.min(1, ratio(contextTokens.filter((token) => textTokens.has(token)).length, Math.min(contextTokens.length, 4)));
  const phraseMatch = labelPhrase.length >= 4 && text.includes(labelPhrase);
  const distinctiveMatch = distinctive.some((token) => textTokens.has(token));

  if (distinctive.length && !distinctiveMatch && !phraseMatch) return 0;

  let score = 0;
  if (phraseMatch) score += 0.48;
  score += labelCoverage * 0.34;
  score += contextCoverage * 0.12;
  score += sourceQuality(source) * 0.06;

  const contextIsSoftware = contextTokens.some((token) => SOFTWARE_CONTEXT_TERMS.has(token));
  const textHasSoftware = [...SOFTWARE_CONTEXT_TERMS].some((token) => textTokens.has(token));
  const textHasUnrelatedDomain = [...UNRELATED_DOMAIN_TERMS].some((token) => textTokens.has(token));
  if (contextIsSoftware && textHasUnrelatedDomain && !textHasSoftware) score -= 0.45;
  if (labelCoverage < 0.34 && !phraseMatch) score -= 0.18;

  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

async function fetchWikipediaSources(query, fetchImpl, timeoutMs) {
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=4&format=json&origin=*&srsearch=${encodeURIComponent(query)}`;
  const payload = await fetchJson(searchUrl, fetchImpl, timeoutMs);
  const hits = Array.isArray(payload?.query?.search) ? payload.query.search : [];
  if (!hits.length) return [];

  const pageIds = hits.map((hit) => hit.pageid).filter(Boolean);
  let pages = {};
  if (pageIds.length) {
    const detailUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts|info&inprop=url&exintro=1&explaintext=1&format=json&origin=*&pageids=${pageIds.join('|')}`;
    const detailPayload = await fetchJson(detailUrl, fetchImpl, timeoutMs);
    pages = detailPayload?.query?.pages || {};
  }

  return hits.map((hit) => {
    const page = pages?.[hit.pageid] || {};
    const title = cleanText(page.title || hit.title || '');
    const note = truncate(page.extract || hit.snippet || '', MAX_NOTE_LENGTH);
    return {
      title: title ? `Wikipedia: ${title}` : 'Wikipedia result',
      url: page.fullurl || (title ? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}` : 'https://en.wikipedia.org'),
      publisher: 'Wikipedia',
      sourceType: 'encyclopedia',
      publishedAt: hit.timestamp || '',
      note,
      query
    };
  }).filter((source) => source.note);
}

async function fetchDuckDuckGoSources(query, fetchImpl, timeoutMs) {
  const url = `https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&no_redirect=1&q=${encodeURIComponent(query)}`;
  const payload = await fetchJson(url, fetchImpl, timeoutMs);
  const sources = [];
  if (payload?.AbstractText) {
    sources.push({
      title: payload.Heading ? `DuckDuckGo: ${payload.Heading}` : 'DuckDuckGo instant answer',
      url: payload.AbstractURL || 'https://duckduckgo.com',
      publisher: readableUrlTitle(payload.AbstractURL || 'https://duckduckgo.com'),
      sourceType: 'web summary',
      publishedAt: '',
      note: truncate(payload.AbstractText, MAX_NOTE_LENGTH),
      query
    });
  }
  for (const related of flattenRelatedTopics(payload?.RelatedTopics).slice(0, 4)) {
    if (!related?.Text) continue;
    sources.push({
      title: related.FirstURL ? readableUrlTitle(related.FirstURL) : 'DuckDuckGo related topic',
      url: related.FirstURL || 'https://duckduckgo.com',
      publisher: readableUrlTitle(related.FirstURL || 'https://duckduckgo.com'),
      sourceType: 'web result',
      publishedAt: '',
      note: truncate(related.Text, MAX_NOTE_LENGTH),
      query
    });
  }
  return sources;
}

async function fetchSemanticScholarSources(query, fetchImpl, timeoutMs) {
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?limit=4&fields=title,year,abstract,url,venue&query=${encodeURIComponent(query)}`;
  const payload = await fetchJson(url, fetchImpl, timeoutMs);
  const papers = Array.isArray(payload?.data) ? payload.data : [];
  return papers.map((paper) => ({
    title: `${paper.title || 'Semantic Scholar paper'}${paper.year ? ` (${paper.year})` : ''}`,
    url: paper.url || 'https://www.semanticscholar.org',
    publisher: paper.venue || 'Semantic Scholar',
    sourceType: 'research paper',
    publishedAt: paper.year ? String(paper.year) : '',
    note: truncate(`${paper.venue ? `${paper.venue}: ` : ''}${paper.abstract || ''}`, MAX_NOTE_LENGTH),
    query
  })).filter((source) => source.note);
}

async function fetchOpenAlexSources(query, fetchImpl, timeoutMs) {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=4`;
  const payload = await fetchJson(url, fetchImpl, timeoutMs);
  const works = Array.isArray(payload?.results) ? payload.results : [];
  return works.map((work) => {
    const abstract = invertAbstract(work.abstract_inverted_index);
    const location = work.primary_location || {};
    return {
      title: `${work.display_name || 'OpenAlex work'}${work.publication_year ? ` (${work.publication_year})` : ''}`,
      url: work.doi || location.landing_page_url || work.id || 'https://openalex.org',
      publisher: location.source?.display_name || 'OpenAlex',
      sourceType: 'research paper',
      publishedAt: work.publication_date || (work.publication_year ? String(work.publication_year) : ''),
      note: truncate(abstract || work.display_name || '', MAX_NOTE_LENGTH),
      query
    };
  }).filter((source) => source.note);
}

async function fetchJson(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'LearnFlow/2.0 source-grounded research' },
      signal: controller.signal
    });
    if (!response.ok) return {};
    return await response.json();
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

function coverageForSources(sources) {
  if (!sources.length) return { level: 'insufficient', confidence: 0 };
  const confidence = Number((sources.slice(0, 3).reduce((sum, source) => sum + source.relevanceScore, 0) / Math.min(3, sources.length)).toFixed(2));
  if (sources.length >= 3 && confidence >= 0.58) return { level: 'good', confidence };
  return { level: 'partial', confidence };
}

function sourceQuality(source) {
  if (source.sourceType === 'research paper') return 1;
  if (source.sourceType === 'encyclopedia') return 0.72;
  if (source.sourceType === 'web summary') return 0.55;
  return 0.45;
}

function dedupeSources(sources) {
  const seen = new Set();
  const unique = [];
  for (const source of sources) {
    const url = canonicalUrl(source.url);
    const note = cleanText(source.note || '');
    const title = cleanText(source.title || '');
    const key = url || normalizePhrase(title);
    if (!key || !note || seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...source, url: source.url || '', title, note });
  }
  return unique;
}

function canonicalUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return '';
  }
}

function flattenRelatedTopics(items = []) {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => Array.isArray(item.Topics) ? flattenRelatedTopics(item.Topics) : item);
}

function invertAbstract(index) {
  if (!index || typeof index !== 'object') return '';
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions || []) words[position] = word;
  }
  return words.filter(Boolean).join(' ');
}

function inferDomainHint(value) {
  const tokens = new Set(tokenize(value));
  if ([...tokens].some((token) => SOFTWARE_CONTEXT_TERMS.has(token))) return 'software binary program analysis';
  return 'research overview';
}

function meaningfulTokens(value) {
  return [...new Set(tokenize(value).filter((token) => token.length > 2 && !GENERIC_TERMS.has(token)))];
}

function tokenize(value) {
  return normalizePhrase(value).split(' ').filter(Boolean).map(stemToken);
}

function stemToken(token) {
  if (token.length > 5 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function normalizePhrase(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value, maxLength) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function compact(values) {
  return values.map((value) => cleanText(value)).filter(Boolean);
}

function dedupeTerms(values) {
  const seen = new Set();
  return values.filter((value) => {
    const cleaned = cleanText(value);
    const key = normalizePhrase(cleaned);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(cleanText);
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function slugify(value) {
  return normalizePhrase(value).replaceAll(' ', '-').slice(0, 48) || 'topic';
}

function readableUrlTitle(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'Web result';
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
