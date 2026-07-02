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
  return [
    {
      role: 'system',
      content: 'You are a precise web research analyst. Return only strict JSON. Do not return HTML, markdown, citations in prose, or prose outside JSON. Use the supplied web research snippets as your source material and be explicit when source coverage is sparse.'
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'Create a source-grounded research brief for selected subjects in a recursive topic tree.',
        currentDate,
        topic,
        selectedItems,
        options,
        webResearch: researchPacks,
        schema: {
          title: 'Report title',
          summary: 'One paragraph source-grounded summary of the selected research scope',
          sections: [
            {
              title: 'Selected topic label',
              path: ['Root', 'Branch', 'Selected topic'],
              simpleDefinition: 'Plain-language definition in 1 to 2 sentences',
              currentDetails: 'What current public web sources say, including concrete details and uncertainty where needed, in 100 to 160 words',
              researchOverview: 'Longer source-grounded explanation in 180 to 280 words',
              keyTakeaways: ['4 to 6 source-grounded takeaways'],
              examples: ['2 to 3 concrete examples when useful'],
              sources: [
                {
                  title: 'Source title',
                  url: 'Source URL',
                  note: 'Short note on what this source contributed'
                }
              ]
            }
          ]
        },
        requirements: [
          'Create exactly one section per selected item.',
          'Preserve the selected item paths exactly.',
          'Use the webResearch sources that match each selected item; keep source URLs exactly as supplied.',
          'When source snippets are sparse, say what is known from the available snippets and what remains uncertain instead of inventing facts.',
          'Do not include a learning path, exercises, study instructions, or next learning steps.',
          'Avoid generic phrases such as "part of the broader learning map" or "turns a broad subject into a concrete learning target".',
          'Use the requested language if provided.',
          'Adapt explanation depth to the requested audience and depth.',
          'Do not use ellipses, placeholders, comments, markdown, or omitted sections.',
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

export async function analyzeWithMiniMax(payload, options) {
  let result;
  const researchProvider = options?.researchProvider || collectResearchPacks;
  const researchPacks = await researchProvider(payload, options).catch(() => []);
  const enrichedPayload = { ...payload, researchPacks };
  try {
    result = await callMiniMaxJson({ messages: buildAnalyzeMessages(enrichedPayload), temperature: 0.3, maxTokens: 12000 }, options);
  } catch (error) {
    if (!/valid JSON|Unexpected token/i.test(error.message || '')) throw error;
    return buildFallbackAnalysis(enrichedPayload);
  }
  if (!Array.isArray(result.sections)) throw new Error('MiniMax analysis response did not include a sections array.');
  return result;
}

function buildFallbackAnalysis({ topic = 'Learning Topic', selectedItems = [], options = {}, researchPacks = [] }) {
  const depth = options.depth || 'Detailed';
  const audience = options.audience || 'Intermediate';
  const sourceMap = new Map(researchPacks.map((pack) => [researchKey(pack), pack]));
  return {
    title: `${topic} Research Brief`,
    summary: `A ${depth.toLowerCase()} source-grounded research brief for ${audience.toLowerCase()} readers, based on the selected LearnFlow topics and any web snippets available during generation.`,
    sections: selectedItems.map((item) => {
      const pack = sourceMap.get(researchKey(item)) || { sources: [] };
      const sourceNotes = pack.sources.map((source) => source.note).filter(Boolean);
      const sourceSummary = sourceNotes.length ? sourceNotes.slice(0, 3).join(' ') : `No external source snippets were available for ${item.label} during this generation.`;
      return {
        title: item.label,
        path: item.path,
        simpleDefinition: `${item.label} is a subject area within ${item.path?.slice(0, -1).join(' > ') || topic}.`,
        currentDetails: sourceSummary,
        researchOverview: sourceNotes.length
          ? `${item.label} is best understood through the available source evidence rather than the tree label alone. The collected references describe the concept this way: ${sourceSummary}`
          : `${item.label} could not be enriched with live source snippets in this run, so the report preserves the selected topic context without adding unsupported current claims.`,
        keyTakeaways: sourceNotes.length
          ? pack.sources.slice(0, 5).map((source) => `${source.title}: ${source.note}`)
          : [
              'No external source snippet was available for this topic in the generation run.',
              'Treat this section as a placeholder until a source-backed regeneration succeeds.',
              'Avoid relying on generic learning-map text for factual detail.'
            ],
        examples: [],
        sources: pack.sources || []
      };
    })
  };
}

function researchKey(value) {
  const label = String(value?.title || value?.label || '').toLowerCase();
  const path = Array.isArray(value?.path) ? value.path.join(' > ').toLowerCase() : '';
  return `${label}|${path}`;
}
