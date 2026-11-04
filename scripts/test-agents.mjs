/**
 * Checks the AI agent matcher that the edge function and the stats endpoint
 * share (netlify/shared/agents.mjs). Runs in CI because a bad pattern here
 * either hides agents we want to count or, worse, counts every Chrome visitor
 * as a bot and buries the signal.
 */
import assert from 'node:assert/strict';
import { identifyAgent, hitKey, parseHitKey, AGENTS } from '../netlify/shared/agents.mjs';

const cases = [
  // Real user-agent strings, as published by each vendor.
  ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot', 'ChatGPT-User', 'user'],
  ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)', 'GPTBot', 'train'],
  ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot', 'OAI-SearchBot', 'search'],
  ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ClaudeBot/1.0; +claudebot@anthropic.com', 'ClaudeBot', 'train'],
  ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; Claude-User/1.0; +Claude-User@anthropic.com', 'Claude-User', 'user'],
  ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; Claude-SearchBot/1.0; +Claude-SearchBot@anthropic.com', 'Claude-SearchBot', 'search'],
  ['Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)', 'PerplexityBot', 'search'],
  ['Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)', 'Perplexity-User', 'user'],
  ['Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/W.X.Y.Z Mobile Safari/537.36 (compatible; GoogleOther)', 'GoogleOther', 'train'],
  ['meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)', 'Meta-ExternalAgent', 'train'],
  ['meta-externalfetcher/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)', 'Meta-ExternalFetcher', 'user'],
  ['Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)', 'Bytespider', 'train'],
  ['DuckAssistBot/1.1; (+http://duckduckgo.com/duckassistbot.html)', 'DuckAssistBot', 'user'],
  ['Mozilla/5.0 (compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)', 'Amazonbot', 'train'],
];
for (const [ua, name, kind] of cases) {
  const got = identifyAgent(ua);
  assert.ok(got, `expected ${name} for: ${ua}`);
  assert.equal(got.name, name, `wrong agent for: ${ua}`);
  assert.equal(got.kind, kind, `wrong kind for ${name}`);
}

// Not agents: people, Googlebot, link previewers, our own uptime check (Node's default UA).
const notAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'node',
  '',
];
for (const ua of notAgents) {
  assert.equal(identifyAgent(ua), null, `should not match: ${ua || '(empty)'}`);
}
assert.equal(identifyAgent(undefined), null);

// A Web Bot Auth signature identifies an agent we have no pattern for.
const signed = identifyAgent('Mozilla/5.0 Chrome/130', '"https://agent.example.com"');
assert.deepEqual(signed, { name: 'signed:agent.example.com', vendor: 'agent.example.com', kind: 'signed' });

// Every pattern is reachable: the agent's own name must match its own pattern.
for (const a of AGENTS) assert.equal(identifyAgent(a.name)?.name, a.name, `${a.name} does not match itself`);

// A hit's key round-trips, including a path with characters that need escaping.
const hit = { ts: '2026-11-04T15:30:00.000Z', agent: 'ChatGPT-User', kind: 'user', path: '/services/kitchen-remodels/?a=b c' };
const key = hitKey(hit);
assert.ok(key.startsWith('2026-11/04/ChatGPT-User/user/'), key);
const back = parseHitKey(key);
assert.equal(back.month, '2026-11');
assert.equal(back.day, '04');
assert.equal(back.agent, 'ChatGPT-User');
assert.equal(back.kind, 'user');
assert.equal(back.path, hit.path);
assert.equal(parseHitKey('garbage'), null);

console.log(`agents: ${cases.length} agents recognised, ${notAgents.length + 1} non-agents ignored, keys round-trip.`);
