/**
 * The AI agents we can recognise from a request, and the shape of a logged hit.
 *
 * Shared by the edge function that records hits (netlify/edge-functions/agent-log.js,
 * runs on Deno) and the report endpoint that reads them back
 * (netlify/functions/agent-stats.mjs, runs on Node), so it must stay plain ESM
 * with no runtime-specific imports.
 *
 * `kind` is the useful signal:
 *   user    fetched because a person asked an assistant about us right now
 *           (the strongest signal; these are shortlists being built)
 *   search  an AI search index refreshing what it knows about us
 *   train   a model-training crawler
 *   signed  a request carrying a Web Bot Auth signature we did not otherwise
 *           recognise (an agent that proves who it is; see OPERATIONS.md)
 *
 * Agentic browsers (Perplexity Comet, Claude for Chrome, ChatGPT Agent in a
 * real browser) mostly present an ordinary Chrome user-agent and cannot be told
 * apart here. The form's "How did you hear about us" option covers that case.
 */

export const GA4_MEASUREMENT_ID = 'G-JCE28PJHNE';

/** Order matters: the first pattern to match wins, so put the specific
 *  user-driven agents before the broader crawler names they share a prefix with. */
export const AGENTS = [
  // OpenAI
  { name: 'ChatGPT-User', vendor: 'OpenAI', kind: 'user', pattern: /ChatGPT-User/i },
  { name: 'ChatGPT-Agent', vendor: 'OpenAI', kind: 'user', pattern: /ChatGPT-Agent/i },
  { name: 'OAI-SearchBot', vendor: 'OpenAI', kind: 'search', pattern: /OAI-SearchBot/i },
  { name: 'GPTBot', vendor: 'OpenAI', kind: 'train', pattern: /GPTBot/i },
  // Anthropic
  { name: 'Claude-User', vendor: 'Anthropic', kind: 'user', pattern: /Claude-User/i },
  { name: 'Claude-SearchBot', vendor: 'Anthropic', kind: 'search', pattern: /Claude-SearchBot/i },
  { name: 'ClaudeBot', vendor: 'Anthropic', kind: 'train', pattern: /ClaudeBot|anthropic-ai/i },
  // Perplexity
  { name: 'Perplexity-User', vendor: 'Perplexity', kind: 'user', pattern: /Perplexity-User/i },
  { name: 'PerplexityBot', vendor: 'Perplexity', kind: 'search', pattern: /PerplexityBot/i },
  // Google (AI Mode and Overviews fetch as plain Googlebot, which we do not
  // count: it would swamp everything and is not an AI-specific signal)
  { name: 'Google-CloudVertexBot', vendor: 'Google', kind: 'train', pattern: /Google-CloudVertexBot/i },
  { name: 'GoogleOther', vendor: 'Google', kind: 'train', pattern: /GoogleOther/i },
  // Microsoft (Copilot's own fetcher; Bingbot is shared with web search and not counted)
  { name: 'Microsoft-Copilot', vendor: 'Microsoft', kind: 'user', pattern: /Microsoft-?Copilot|MicrosoftPreview/i },
  // Meta
  { name: 'Meta-ExternalFetcher', vendor: 'Meta', kind: 'user', pattern: /meta-externalfetcher/i },
  { name: 'Meta-ExternalAgent', vendor: 'Meta', kind: 'train', pattern: /meta-externalagent|FacebookBot/i },
  // Apple (Siri and Spotlight)
  { name: 'Applebot', vendor: 'Apple', kind: 'search', pattern: /Applebot/i },
  // Others
  { name: 'Amazonbot', vendor: 'Amazon', kind: 'train', pattern: /Amazonbot/i },
  { name: 'DuckAssistBot', vendor: 'DuckDuckGo', kind: 'user', pattern: /DuckAssistBot/i },
  { name: 'MistralAI-User', vendor: 'Mistral', kind: 'user', pattern: /MistralAI-User/i },
  { name: 'YouBot', vendor: 'You.com', kind: 'search', pattern: /YouBot/i },
  { name: 'Bytespider', vendor: 'ByteDance', kind: 'train', pattern: /Bytespider|TikTokSpider/i },
  { name: 'CCBot', vendor: 'Common Crawl', kind: 'train', pattern: /CCBot/i },
  { name: 'cohere-ai', vendor: 'Cohere', kind: 'train', pattern: /cohere-ai|cohere-training/i },
  { name: 'Diffbot', vendor: 'Diffbot', kind: 'train', pattern: /Diffbot/i },
  { name: 'PetalBot', vendor: 'Huawei', kind: 'search', pattern: /PetalBot/i },
  { name: 'Timpibot', vendor: 'Timpi', kind: 'train', pattern: /Timpibot/i },
  { name: 'omgili', vendor: 'Webz.io', kind: 'train', pattern: /omgili|webzio/i },
];

/**
 * Identify the agent behind a request, or return null for everything else
 * (people, Googlebot, our own uptime check, link previewers).
 *
 * @param {string} userAgent        the User-Agent header
 * @param {string|null} [signatureAgent]  the Web Bot Auth `Signature-Agent` header, if any
 */
export function identifyAgent(userAgent, signatureAgent) {
  const ua = userAgent || '';
  for (const agent of AGENTS) {
    if (agent.pattern.test(ua)) return { name: agent.name, vendor: agent.vendor, kind: agent.kind };
  }
  if (signatureAgent) {
    // RFC 9421 style: Signature-Agent: "https://agent.example.com"
    const host = signatureAgent.replace(/^"|"$/g, '').replace(/^https?:\/\//, '').split('/')[0];
    if (host) return { name: `signed:${host}`, vendor: host, kind: 'signed' };
  }
  return null;
}

/**
 * Blob key for a hit. The summary lives in the key so the report can be built
 * from a key listing alone, without reading every blob:
 *   2026-11/04/ChatGPT-User/user/%2Fservices%2Fkitchen-remodels%2F/1762268400000-x7k2q
 */
export function hitKey({ ts, agent, kind, path }) {
  const d = new Date(ts);
  const month = d.toISOString().slice(0, 7);
  const day = d.toISOString().slice(8, 10);
  const id = `${d.getTime()}-${Math.random().toString(36).slice(2, 7)}`;
  return [month, day, agent, kind, encodeURIComponent(path), id].join('/');
}

/** Inverse of hitKey. Returns null for keys that do not fit the shape. */
export function parseHitKey(key) {
  const parts = key.split('/');
  if (parts.length !== 6) return null;
  const [month, day, agent, kind, pathEnc, id] = parts;
  let path;
  try { path = decodeURIComponent(pathEnc); } catch { return null; }
  return { month, day, agent, kind, path, id };
}
