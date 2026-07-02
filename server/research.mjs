const DEFAULT_TIMEOUT_MS = 3500;
const MAX_SOURCES_PER_TOPIC = 5;
const MAX_NOTE_LENGTH = 520;
const MAX_RESEARCH_CONCURRENCY = 4;

export async function collectResearchPacks({ topic = '', selectedItems = [] } = {}, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!fetchImpl || !Array.isArray(selectedItems) || selectedItems.length === 0) return [];

  return mapWithConcurrency(
    selectedItems.slice(0, 8),
    options.concurrency || MAX_RESEARCH_CONCURRENCY,
    (item) => collectResearchForItem({ topic, item, fetchImpl, timeoutMs: options.timeoutMs })
  );
}

async function collectResearchForItem({ topic, item, fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const path = Array.isArray(item.path) ? item.path : [];
  const query = compact([item.label, path.slice(0, -1).join(' '), topic]).join(' ');
  const searches = await Promise.allSettled([
    fetchWikipediaSources(query, fetchImpl, timeoutMs),
    fetchDuckDuckGoSources(query, fetchImpl, timeoutMs),
    fetchSemanticScholarSources(query, fetchImpl, timeoutMs)
  ]);
  const sources = dedupeSources(searches.flatMap((result) => result.status === 'fulfilled' ? result.value : []))
    .slice(0, MAX_SOURCES_PER_TOPIC);

  return {
    title: item.label,
    path,
    query,
    fetchedAt: new Date().toISOString(),
    sources
  };
}

async function fetchWikipediaSources(query, fetchImpl, timeoutMs) {
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=2&format=json&origin=*&srsearch=${encodeURIComponent(query)}`;
  const payload = await fetchJson(searchUrl, fetchImpl, timeoutMs);
  const hits = Array.isArray(payload?.query?.search) ? payload.query.search : [];
  return hits.map((hit) => {
    const title = String(hit.title || '').trim();
    return {
      title: title ? `Wikipedia: ${title}` : 'Wikipedia result',
      url: title ? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}` : 'https://en.wikipedia.org',
      sourceType: 'encyclopedia',
      note: truncate(cleanText(hit.snippet || ''), MAX_NOTE_LENGTH)
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
      sourceType: 'web summary',
      note: truncate(cleanText(payload.AbstractText), MAX_NOTE_LENGTH)
    });
  }
  for (const topic of flattenRelatedTopics(payload?.RelatedTopics).slice(0, 2)) {
    if (!topic?.Text) continue;
    sources.push({
      title: topic.FirstURL ? readableUrlTitle(topic.FirstURL) : 'DuckDuckGo related topic',
      url: topic.FirstURL || 'https://duckduckgo.com',
      sourceType: 'web result',
      note: truncate(cleanText(topic.Text), MAX_NOTE_LENGTH)
    });
  }
  return sources;
}

async function fetchSemanticScholarSources(query, fetchImpl, timeoutMs) {
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?limit=2&fields=title,year,abstract,url,venue&query=${encodeURIComponent(query)}`;
  const payload = await fetchJson(url, fetchImpl, timeoutMs);
  const papers = Array.isArray(payload?.data) ? payload.data : [];
  return papers.map((paper) => {
    const year = paper.year ? ` (${paper.year})` : '';
    const venue = paper.venue ? `${paper.venue}: ` : '';
    return {
      title: `${paper.title || 'Semantic Scholar paper'}${year}`,
      url: paper.url || 'https://www.semanticscholar.org',
      sourceType: 'research paper',
      note: truncate(cleanText(`${venue}${paper.abstract || ''}`), MAX_NOTE_LENGTH)
    };
  }).filter((source) => source.note);
}

async function fetchJson(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'LearnFlow/1.0 educational research' },
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

function dedupeSources(sources) {
  const seen = new Set();
  const unique = [];
  for (const source of sources) {
    const url = String(source.url || '').trim();
    const note = cleanText(source.note || '');
    if (!url || !note || seen.has(url)) continue;
    seen.add(url);
    unique.push({ ...source, note });
  }
  return unique;
}

function flattenRelatedTopics(items = []) {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => Array.isArray(item.Topics) ? flattenRelatedTopics(item.Topics) : item);
}

function cleanText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value, maxLength) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function compact(values) {
  return values.map((value) => String(value || '').trim()).filter(Boolean);
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
