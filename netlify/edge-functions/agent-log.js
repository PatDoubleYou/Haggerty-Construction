/**
 * Records every page fetch by a known AI agent (ChatGPT, Claude, Perplexity,
 * Gemini's crawlers, and the rest; see netlify/shared/agents.mjs) so we can
 * see how much assistant and agent traffic the site gets, which pages they
 * read, and whether it grows. Human visitors and Googlebot are untouched.
 *
 * Read the numbers at /api/agent-stats (netlify/functions/agent-stats.mjs).
 *
 * Runs on Netlify's edge (Deno) in front of every page. It never changes the
 * request or the response: a matched hit is written to Netlify Blobs, then the
 * request continues to the page exactly as before. Anything that goes wrong in
 * here is logged and ignored, and `onError: 'bypass'` below means a crash
 * still serves the page. The site must never go down because of a counter.
 *
 * Optional: if the GA4_API_SECRET environment variable is set in the Netlify
 * dashboard (GA4 Admin -> Data streams -> Measurement Protocol API secrets),
 * each hit is also sent to GA4 as an `ai_agent_fetch` event, so it shows up
 * next to the human traffic Jayden already looks at.
 */
import { getStore } from '@netlify/blobs';
import { identifyAgent, hitKey, GA4_MEASUREMENT_ID } from '../shared/agents.mjs';

const STORE = 'agent-hits';
const WRITE_TIMEOUT_MS = 1500;

export default async (request, context) => {
  // Only page reads. Form POSTs go straight through so the lead pipeline is
  // never in this code path (OPERATIONS.md, invariant 3).
  if (request.method !== 'GET' && request.method !== 'HEAD') return context.next();

  let agent = null;
  try {
    agent = identifyAgent(request.headers.get('user-agent'), request.headers.get('signature-agent'));
  } catch (err) {
    console.log('agent-log: identify failed', String(err));
  }
  if (!agent) return context.next();

  const url = new URL(request.url);
  const hit = {
    ts: new Date().toISOString(),
    agent: agent.name,
    vendor: agent.vendor,
    kind: agent.kind,
    path: url.pathname,
    query: url.search || undefined,
    ua: request.headers.get('user-agent') || '',
    signatureAgent: request.headers.get('signature-agent') || undefined,
    referer: request.headers.get('referer') || undefined,
    country: context.geo?.country?.code,
    // Deliberately no IP address: counts, not surveillance.
  };

  try {
    await Promise.race([
      Promise.all([record(hit), sendToGa4(hit)]),
      new Promise((resolve) => setTimeout(resolve, WRITE_TIMEOUT_MS)),
    ]);
  } catch (err) {
    console.log('agent-log: record failed', String(err));
  }

  return context.next();
};

async function record(hit) {
  const store = getStore(STORE);
  await store.setJSON(hitKey(hit), hit);
}

async function sendToGa4(hit) {
  const secret = Netlify.env.get('GA4_API_SECRET');
  if (!secret) return;
  const endpoint = `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${encodeURIComponent(secret)}`;
  await fetch(endpoint, {
    method: 'POST',
    body: JSON.stringify({
      client_id: `agent.${hit.agent}`,
      events: [{
        name: 'ai_agent_fetch',
        params: {
          agent_name: hit.agent,
          agent_vendor: hit.vendor,
          agent_kind: hit.kind,
          page_path: hit.path,
          page_location: `https://haggertyutah.com${hit.path}`,
        },
      }],
    }),
  });
}

export const config = {
  path: '/*',
  // Static assets are not "reads"; the CMS and our own API are not public pages.
  excludedPath: ['/images/*', '/assets/*', '/css/*', '/admin/*', '/api/*', '/favicon.ico', '/.netlify/*'],
  // If this function ever throws before returning, serve the page anyway.
  onError: 'bypass',
};
