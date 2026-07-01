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

export function buildAnalyzeMessages({ topic, selectedItems, options = {} }) {
  return [
    {
      role: 'system',
      content: 'You are a precise learning analyst. Return only strict JSON. Do not return HTML, markdown, or prose outside JSON. The application will create the final printable HTML.'
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'Create a detailed learning analysis for selected levels in a recursive subject tree.',
        topic,
        selectedItems,
        options,
        schema: {
          title: 'Report title',
          summary: 'One paragraph summary of the selected learning scope',
          sections: [
            {
              title: 'Selected topic label',
              path: ['Root', 'Branch', 'Selected topic'],
              overview: 'Clear explanation in 120-180 words',
              whyItMatters: 'Practical importance in 60-100 words',
              keyTakeaways: ['5 concise takeaways'],
              examples: ['3 concrete examples'],
              pitfalls: ['3 common misunderstandings'],
              nextSteps: ['3 suggested next learning steps']
            }
          ]
        },
        requirements: [
          'Create exactly one section per selected item.',
          'Preserve the selected item paths exactly.',
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
  try {
    result = await callMiniMaxJson({ messages: buildAnalyzeMessages(payload), temperature: 0.35, maxTokens: 9000 }, options);
  } catch (error) {
    if (!/valid JSON|Unexpected token/i.test(error.message || '')) throw error;
    return buildFallbackAnalysis(payload);
  }
  if (!Array.isArray(result.sections)) throw new Error('MiniMax analysis response did not include a sections array.');
  return result;
}

function buildFallbackAnalysis({ topic = 'Learning Topic', selectedItems = [], options = {} }) {
  const depth = options.depth || 'Detailed';
  const audience = options.audience || 'Intermediate';
  return {
    title: `${topic} Research Brief`,
    summary: `A structured ${depth.toLowerCase()} research brief for ${audience.toLowerCase()} learners, generated from the selected LearnFlow topic tree.`,
    sections: selectedItems.map((item) => ({
      title: item.label,
      path: item.path,
      overview: `${item.label} is part of the broader ${item.path[0] || topic} learning map. Study it by connecting the concept to its parent topics, identifying the core vocabulary, and mapping where it appears in real systems or workflows.`,
      whyItMatters: `${item.label} matters because it turns a broad subject into a concrete learning target. It gives the learner a smaller unit to investigate, compare, practice, and eventually connect back to the larger subject tree.`,
      keyTakeaways: [
        `Define ${item.label} in plain language.`,
        `Connect ${item.label} to ${item.path.slice(0, -1).join(' > ') || topic}.`,
        'Identify the inputs, outputs, and decisions involved.',
        'Look for one practical example and one counterexample.',
        'Use the topic path to decide what to learn next.'
      ],
      examples: [
        `A concept map showing where ${item.label} sits in the selected tree.`,
        `A short comparison between ${item.label} and a sibling topic.`,
        `A real-world scenario where ${item.label} affects an outcome.`
      ],
      pitfalls: [
        'Learning the label without understanding its parent context.',
        'Treating related sibling topics as interchangeable.',
        'Skipping examples before moving to more advanced branches.'
      ],
      nextSteps: [
        `Write a one-paragraph explanation of ${item.label}.`,
        'Find a worked example and annotate the important steps.',
        'Expand the tree one level deeper and compare the new branches.'
      ]
    }))
  };
}
