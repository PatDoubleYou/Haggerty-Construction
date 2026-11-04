/**
 * GET /api/agent-stats            this month's AI agent traffic, as plain text
 * GET /api/agent-stats?month=2026-10
 * GET /api/agent-stats?format=json
 *
 * Reads the hits that netlify/edge-functions/agent-log.js wrote to Netlify
 * Blobs. The summary of each hit is in its key, so one key listing is enough;
 * no blob bodies are read. Nothing here is sensitive (counts of bot fetches,
 * no IPs), so the endpoint is public and read-only.
 */
import { getStore } from '@netlify/blobs';
import { parseHitKey, AGENTS } from '../shared/agents.mjs';

const STORE = 'agent-hits';
const VENDOR = Object.fromEntries(AGENTS.map((a) => [a.name, a.vendor]));

export const config = { path: '/api/agent-stats' };

export default async (request) => {
  const url = new URL(request.url);
  const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return new Response('month must look like 2026-11\n', { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  const hits = [];
  const store = getStore(STORE);
  for await (const page of store.list({ prefix: `${month}/`, paginate: true })) {
    for (const blob of page.blobs) {
      const hit = parseHitKey(blob.key);
      if (hit) hits.push(hit);
    }
  }

  const stats = summarise(month, hits);
  const headers = { 'cache-control': 'public, max-age=300' };

  if (url.searchParams.get('format') === 'json') {
    return new Response(JSON.stringify(stats, null, 2), { headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });
  }
  return new Response(renderText(stats), { headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' } });
};

export function summarise(month, hits) {
  const count = (map, key) => { map[key] = (map[key] || 0) + 1; };
  const byAgent = {};
  const byKind = {};
  const byPage = {};
  const byDay = {};
  for (const h of hits) {
    const a = (byAgent[h.agent] ||= { vendor: VENDOR[h.agent] || h.agent.replace(/^signed:/, ''), kind: h.kind, fetches: 0, lastDay: '00', pages: {} });
    a.fetches += 1;
    if (h.day > a.lastDay) a.lastDay = h.day;
    count(a.pages, h.path);
    count(byKind, h.kind);
    count(byPage, h.path);
    count(byDay, h.day);
  }
  return {
    month,
    generatedAt: new Date().toISOString(),
    total: hits.length,
    agents: Object.keys(byAgent).length,
    byKind,
    byAgent: sortObject(byAgent, (a) => a.fetches),
    byPage: sortObject(byPage, (n) => n),
    byDay: Object.fromEntries(Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b))),
  };
}

function sortObject(obj, score) {
  return Object.fromEntries(Object.entries(obj).sort(([, a], [, b]) => score(b) - score(a)));
}

export function renderText(s) {
  const lines = [];
  const pad = (v, n) => String(v).padEnd(n);
  const num = (v, n = 7) => String(v).padStart(n);
  lines.push(`AI agent traffic on haggertyutah.com, ${s.month}`);
  lines.push(`${s.total} fetches by ${s.agents} agent${s.agents === 1 ? '' : 's'}. Generated ${s.generatedAt.slice(0, 16).replace('T', ' ')} UTC.`);
  lines.push('');
  lines.push('By kind (user = a person asked an assistant about us; search = AI search index; train = training crawler)');
  for (const kind of ['user', 'search', 'train', 'signed']) {
    if (s.byKind[kind]) lines.push(`  ${pad(kind, 8)}${num(s.byKind[kind])}`);
  }
  lines.push('');
  const rows = Object.entries(s.byAgent);
  const wName = Math.max(6, ...rows.map(([name]) => name.length)) + 2;
  const wVendor = Math.max(7, ...rows.map(([, a]) => a.vendor.length)) + 2;
  lines.push(`  ${pad('Agent', wName)}${pad('Vendor', wVendor)}${pad('Kind', 8)}${num('Fetches')}  Last seen`);
  for (const [name, a] of rows) {
    lines.push(`  ${pad(name, wName)}${pad(a.vendor, wVendor)}${pad(a.kind, 8)}${num(a.fetches)}  ${s.month}-${a.lastDay}`);
  }
  lines.push('');
  lines.push('Pages read');
  for (const [path, n] of Object.entries(s.byPage).slice(0, 25)) {
    lines.push(`  ${num(n, 5)}  ${path}`);
  }
  lines.push('');
  lines.push('By day');
  lines.push('  ' + Object.entries(s.byDay).map(([d, n]) => `${d}:${n}`).join('  '));
  lines.push('');
  lines.push('Other months: ?month=YYYY-MM   Machine-readable: ?format=json');
  lines.push('Agentic browsers (Comet, Claude for Chrome, ChatGPT Agent) look like Chrome and are not counted here;');
  lines.push('the "AI assistant" option on the estimate form is how those show up.');
  return lines.join('\n') + '\n';
}
