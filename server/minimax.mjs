import { collectResearchPacks } from './research.mjs';

const DEFAULT_BASE_URL = 'https://api.minimax.io/v1';
const DEFAULT_MODEL = 'MiniMax-M3';

export function getMiniMaxConfig(env = process.env) {
  return {
    apiKey: env.MINIMAX_API_KEY || '',
    baseUrl: (env.MINIMAX_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    model: env.MINIMAX_MODEL || DEFAULT_MODEL
  };
}

export function extractJson(text) {
  if (!text || typeof text !== 'string') throw new Error('MiniMax returned an empty response.');
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const parseCandidate = (value) => {
    try {
      return JSON.parse(value);
    } catch {
      const withoutPlaceholders = value
        .replace(/^\s*\.{3}\s*,?\s*$/gm, '')
        .replace(/,\s*([}\]])/g, '$1');
      if (withoutPlaceholders !== value) return JSON.parse(withoutPlaceholders);
      throw new Error('MiniMax response was not valid JSON.');
    }
  };
  try {
    return parseCandidate(candidate);
  } catch {
    const first = candidate.indexOf('{');
    const last = candidate.lastIndexOf('}');
    if (first >= 0 && last > first) return parseCandidate(candidate.slice(first, last + 1));
    throw new Error('MiniMax response was not valid JSON.');
  }
}

function responseText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => typeof part === 'string' ? part : part?.text || '').join('\n');
  }
  return '';
}

export async function callMiniMaxJson({ messages, temperature = 0.35, maxTokens = 4096 }, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const config = getMiniMaxConfig(env);
  if (!config.apiKey) {
    throw new Error('MINIMAX_API_KEY is missing. Add it to your .env before using live MiniMax M3 generation.');
  }
  if (!fetchImpl) throw new Error('Fetch is not available in this Node.js runtime. Use Node 18 or newer.');

  const endpoint = `${config.baseUrl}/chat/completions`;
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false
    })
  });

  const raw = await response.text();
  let payload = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw }; }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.base_resp?.status_msg || raw || `MiniMax request failed with status ${response.status}`;
    throw new Error(message);
  }

  return extractJson(responseText(payload));
}

export function buildExploreMessages({ topic, parentPath = [], depth = 1 }) {
  return [
    {
      role: 'system',
      content: 'You are an expert curriculum cartographer. Return only strict JSON. Do not include markdown. Keep labels concise and useful for a recursive subject-learning tree.'
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'Generate related subjects for a recursive learning tree.',
        topic,
        parentPath,
        depth,
        schema: {
          subjects: [
            {
              label: 'Concise subject name',
              children: ['Optional concise sub subject names when depth is greater than 1']
            }
          ]
        },
        requirements: [
          'Return 4 to 6 subjects at the current level.',
          'For depth greater than 1, include 2 to 4 children per subject.',
          'Avoid duplicates and avoid overly broad siblings.',
          'Keep every label under 36 characters.',
          'Return JSON object exactly with key subjects.'
        ]
      })
    }
  ];
}

export function buildAnalyzeMessages({ topic, selectedItems, options = {}, researchPacks = [] }) {
  const currentDate = new Date().toISOString().slice(0, 10);
  const selectedWithRoles = selectedItems.map((item) => ({
    ...item,
    sectionKind: getSelectionKind(item, selectedItems)
  }));
  return [
    {
      role: 'system',
      content: 'You are a precise research analyst. Return only strict JSON. Every prose field must contain plain text only: no HTML, XML, markdown, links, tags, or citations embedded in prose. Use only source IDs from the matching research pack. Never discuss rejected or irrelevant search results.'
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'Create a concise, useful, evidence-bound research brief for selected subjects in a recursive topic tree.',
        currentDate,
        topic,
        selectedItems: selectedWithRoles,
        options,
        webResearch: researchPacks,
        schema: {
          title: 'Report title in the requested language',
          summary: 'One concise plain-text paragraph describing the useful findings and evidence coverage',
          sections: [
            {
              title: 'Selected topic label',
              path: ['Root', 'Branch', 'Selected topic'],
              simpleDefinition: 'Plain-text definition in 1 to 2 sentences',
              currentDetails: ['Zero to three plain-text evidence-backed paragraphs'],
              researchOverview: ['One to four plain-text explanatory paragraphs without repetition'],
              keyTakeaways: ['Two to six non-redundant takeaways'],
              examples: ['Zero to three concrete examples supported by the matching sources'],
              sourceIds: ['Only IDs from the matching webResearch pack'],
              coverageNote: 'One short sentence only when coverage is partial or insufficient'
            }
          ]
        },
        requirements: [
          'Create exactly one section per selected item and preserve item order.',
          'Preserve each selected item path exactly.',
          'Use only source IDs from the matching webResearch pack; never invent or copy URLs.',
          'Definitions may use stable domain knowledge, but current claims and examples must be supported by the selected source IDs.',
          'When coverage is insufficient, keep the section short: provide a definition, one useful overview paragraph, one coverageNote, and at most two takeaways. Do not repeat the lack of sources in multiple fields.',
          'When an item has sectionKind overview, introduce the branch briefly and leave detailed methods to its selected descendants.',
          'Do not repeat the same explanation, caveat, source note, or example across parent and child sections.',
          'Do not mention off-topic search results, failed queries, internal webResearch arrays, or the phrase supplied snippets.',
          'Prefer specific mechanisms, workflows, limitations, tradeoffs, and concrete examples over generic framing.',
          'Use the requested language for all prose.',
          'Adapt detail to the requested audience and depth, but do not pad to a word count.',
          'Do not include learning paths, exercises, study instructions, or next learning steps.',
          'Return complete JSON that can be parsed directly with JSON.parse.',
          'Return JSON object exactly with title, summary, and sections.'
        ]
      })
    }
  ];
}

export async function exploreWithMiniMax(payload, options) {
  const result = await callMiniMaxJson({ messages: buildExploreMessages(payload), temperature: 0.25, maxTokens: 2500 }, options);
  if (!Array.isArray(result.subjects)) throw new Error('MiniMax explore response did not include a subjects array.');
  return result;
}

export async function analyzeWithMiniMax(payload, options = {}) {
  const researchProvider = options.researchProvider || collectResearchPacks;
  const researchPacks = await researchProvider(payload, options).catch(() => []);
  const enrichedPayload = { ...payload, researchPacks };
  const baseMessages = buildAnalyzeMessages(enrichedPayload);
  let result;

  try {
    result = await callMiniMaxJson({ messages: baseMessages, temperature: 0.2, maxTokens: 12000 }, options);
  } catch (error) {
    if (!/valid JSON|Unexpected token/i.test(error.message || '')) throw error;
    return buildFallbackAnalysis(enrichedPayload);
  }

  let validation = validateAnalysisResult(result, enrichedPayload);
  if (!validation.valid) {
    try {
      const repairMessages = [
        ...baseMessages,
        { role: 'assistant', content: JSON.stringify(result) },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Repair the previous JSON response.',
            validationErrors: validation.errors,
            requirements: [
              'Return the complete corrected JSON object only.',
              'Keep every path exact and every prose field plain text.',
              'Remove unknown source IDs and HTML or markdown.',
              'Do not add unsupported claims.'
            ]
          })
        }
      ];
      result = await callMiniMaxJson({ messages: repairMessages, temperature: 0.1, maxTokens: 12000 }, options);
      validation = validateAnalysisResult(result, enrichedPayload);
    } catch {
      return buildFallbackAnalysis(enrichedPayload);
    }
  }

  if (!validation.valid) return buildFallbackAnalysis(enrichedPayload);
  return normalizeAnalysisResult(result, enrichedPayload);
}

export function validateAnalysisResult(result, { selectedItems = [], researchPacks = [] } = {}) {
  const errors = [];
  if (!result || typeof result !== 'object') return { valid: false, errors: ['Response must be an object.'] };
  if (!Array.isArray(result.sections)) errors.push('sections must be an array.');
  if (containsMarkup(result.title) || containsMarkup(result.summary)) errors.push('Title and summary must be plain text.');
  if (!Array.isArray(result.sections)) return { valid: false, errors };
  if (result.sections.length !== selectedItems.length) errors.push(`Expected ${selectedItems.length} sections, received ${result.sections.length}.`);

  selectedItems.forEach((item, index) => {
    const section = result.sections[index];
    if (!section) return;
    if (normalizeKey(section.title) !== normalizeKey(item.label)) errors.push(`Section ${index + 1} title does not match ${item.label}.`);
    if (!samePath(section.path, item.path)) errors.push(`Section ${item.label} path was changed.`);
    const proseValues = [section.simpleDefinition, section.coverageNote, ...asArray(section.currentDetails), ...asArray(section.researchOverview), ...asArray(section.keyTakeaways), ...asArray(section.examples)];
    if (proseValues.some(containsMarkup)) errors.push(`Section ${item.label} contains HTML or markdown-like markup.`);

    const pack = findResearchPack(item, researchPacks);
    const allowedIds = new Set((pack?.sources || []).map((source) => source.id));
    const sourceIds = asArray(section.sourceIds).map(String);
    for (const id of sourceIds) {
      if (!allowedIds.has(id)) errors.push(`Section ${item.label} contains unknown source ID ${id}.`);
    }
    if ((pack?.coverage === 'good' || pack?.coverage === 'partial') && sourceIds.length === 0) {
      errors.push(`Section ${item.label} must cite at least one matching source ID.`);
    }
    if (pack?.coverage === 'insufficient' && sourceIds.length > 0) {
      errors.push(`Section ${item.label} cannot cite sources when coverage is insufficient.`);
    }
  });

  return { valid: errors.length === 0, errors };
}

export function normalizeAnalysisResult(result, { topic = 'Learning Topic', selectedItems = [], researchPacks = [] } = {}) {
  const sections = selectedItems.map((item, index) => {
    const raw = result.sections?.[index] || {};
    const pack = findResearchPack(item, researchPacks) || { coverage: 'insufficient', confidence: 0, sources: [] };
    const allowed = new Map((pack.sources || []).map((source) => [source.id, source]));
    const sourceIds = uniqueStrings(raw.sourceIds).filter((id) => allowed.has(id));
    return {
      title: cleanPlainText(raw.title || item.label),
      path: item.path,
      sectionKind: getSelectionKind(item, selectedItems),
      simpleDefinition: cleanPlainText(raw.simpleDefinition || `${item.label} is a topic within ${item.path?.slice(0, -1).join(' > ') || topic}.`),
      currentDetails: cleanParagraphs(raw.currentDetails),
      researchOverview: cleanParagraphs(raw.researchOverview),
      keyTakeaways: cleanList(raw.keyTakeaways, pack.coverage === 'insufficient' ? 2 : 6),
      examples: cleanList(raw.examples, 3),
      sourceIds,
      sources: sourceIds.map((id) => allowed.get(id)),
      coverage: pack.coverage || 'insufficient',
      confidence: Number(pack.confidence || 0),
      coverageNote: cleanPlainText(raw.coverageNote || defaultCoverageNote(pack.coverage))
    };
  });
  return {
    title: cleanPlainText(result.title || `${topic} Research Brief`),
    summary: cleanPlainText(result.summary || 'Source-grounded research generated from the selected topics.'),
    sections
  };
}

function buildFallbackAnalysis({ topic = 'Learning Topic', selectedItems = [], options = {}, researchPacks = [] }) {
  const depth = options.depth || 'Detailed';
  const audience = options.audience || 'Intermediate';
  return {
    title: `${topic} Research Brief`,
    summary: `A ${depth.toLowerCase()} research brief for ${audience.toLowerCase()} readers. Sections with insufficient direct evidence are kept concise rather than padded with unrelated material.`,
    sections: selectedItems.map((item) => {
      const pack = findResearchPack(item, researchPacks) || { coverage: 'insufficient', confidence: 0, sources: [] };
      const sources = pack.sources || [];
      const sourceIds = sources.slice(0, 4).map((source) => source.id);
      const notes = sources.slice(0, 3).map((source) => cleanPlainText(source.note)).filter(Boolean);
      const insufficient = pack.coverage === 'insufficient' || notes.length === 0;
      return {
        title: item.label,
        path: item.path,
        sectionKind: getSelectionKind(item, selectedItems),
        simpleDefinition: `${item.label} is a topic within ${item.path?.slice(0, -1).join(' > ') || topic}.`,
        currentDetails: insufficient ? [] : notes.slice(0, 2),
        researchOverview: insufficient
          ? [`No directly relevant sources passed LearnFlow's relevance checks for this topic, so the report does not manufacture a detailed factual section.`]
          : [`The strongest retrieved evidence for ${item.label} is summarized above. Use the cited sources for the full context and limitations.`],
        keyTakeaways: insufficient
          ? ['Coverage is insufficient for a detailed source-grounded treatment.']
          : notes.slice(0, 4),
        examples: [],
        sourceIds: insufficient ? [] : sourceIds,
        sources: insufficient ? [] : sources.filter((source) => sourceIds.includes(source.id)),
        coverage: insufficient ? 'insufficient' : pack.coverage,
        confidence: Number(pack.confidence || 0),
        coverageNote: defaultCoverageNote(insufficient ? 'insufficient' : pack.coverage)
      };
    })
  };
}

export function getSelectionKind(item, selectedItems = []) {
  const path = Array.isArray(item?.path) ? item.path : [];
  const hasSelectedDescendant = selectedItems.some((candidate) => {
    const candidatePath = Array.isArray(candidate?.path) ? candidate.path : [];
    return candidatePath.length > path.length && path.every((part, index) => normalizeKey(part) === normalizeKey(candidatePath[index]));
  });
  return hasSelectedDescendant ? 'overview' : 'detail';
}

function findResearchPack(item, packs) {
  const key = researchKey(item);
  return packs.find((pack) => researchKey(pack) === key);
}

function researchKey(value) {
  const label = normalizeKey(value?.title || value?.label || '');
  const path = Array.isArray(value?.path) ? value.path.map(normalizeKey).join(' > ') : '';
  return `${label}|${path}`;
}

function samePath(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((part, index) => normalizeKey(part) === normalizeKey(b[index]));
}

function normalizeKey(value) {
  return cleanPlainText(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function cleanParagraphs(value) {
  const values = asArray(value).flatMap((entry) => splitParagraphs(entry));
  return [...new Set(values.map(cleanPlainText).filter(Boolean))].slice(0, 4);
}

function cleanList(value, maxItems) {
  return [...new Set(asArray(value).map(cleanPlainText).filter(Boolean))].slice(0, maxItems);
}

function uniqueStrings(value) {
  return [...new Set(asArray(value).map((item) => String(item || '').trim()).filter(Boolean))];
}

function splitParagraphs(value) {
  const decoded = decodeEntities(String(value || ''))
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<p(?:\s[^>]*)?>/gi, '');
  return decoded.split(/\n\s*\n+/).filter(Boolean);
}

function cleanPlainText(value) {
  return decodeEntities(String(value || ''))
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[`*_#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsMarkup(value) {
  return /<\/?[a-z][^>]*>|&lt;\/?[a-z]|```|\[[^\]]+\]\([^\)]+\)/i.test(String(value || ''));
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function defaultCoverageNote(coverage) {
  if (coverage === 'partial') return 'Evidence coverage is partial; conclusions are limited to the directly relevant sources listed below.';
  if (coverage === 'insufficient') return 'Direct evidence was insufficient, so this section is intentionally concise.';
  return '';
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}
