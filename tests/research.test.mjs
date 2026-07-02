import test from 'node:test';
import assert from 'node:assert/strict';
import { collectResearchPacks } from '../server/research.mjs';

test('collectResearchPacks gathers and cleans public web research sources', async () => {
  const fakeFetch = async (url) => {
    if (url.includes('wikipedia.org')) {
      return jsonResponse({
        query: {
          search: [
            { title: 'Agent architecture', snippet: '<span>Systems for coordinating autonomous agents.</span>' }
          ]
        }
      });
    }
    if (url.includes('duckduckgo.com')) {
      return jsonResponse({
        Heading: 'Agent architecture',
        AbstractURL: 'https://example.com/agent-architecture',
        AbstractText: 'Agent architecture describes how agent components cooperate.',
        RelatedTopics: []
      });
    }
    if (url.includes('semanticscholar.org')) {
      return jsonResponse({
        data: [
          {
            title: 'Architectures for Language Agents',
            year: 2025,
            venue: 'AI Systems',
            url: 'https://example.com/paper',
            abstract: 'A recent paper comparing planning, memory, and tool-use components.'
          }
        ]
      });
    }
    return jsonResponse({});
  };

  const packs = await collectResearchPacks({
    topic: 'AI agents',
    selectedItems: [{ label: 'Agent Architecture', path: ['AI agents', 'Agent Architecture'] }]
  }, { fetchImpl: fakeFetch, timeoutMs: 1000 });

  assert.equal(packs.length, 1);
  assert.equal(packs[0].title, 'Agent Architecture');
  assert.equal(packs[0].sources.length, 3);
  assert.match(packs[0].sources[0].note, /Systems for coordinating autonomous agents/);
  assert.ok(packs[0].sources.some((source) => source.sourceType === 'research paper'));
});

function jsonResponse(payload) {
  return {
    ok: true,
    async json() {
      return payload;
    }
  };
}
