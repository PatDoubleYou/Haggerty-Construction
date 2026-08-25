#!/usr/bin/env node
/**
 * Build-time guardrails. Runs against ./public after `npm run build`.
 *
 * Context: on 2026-07-21 a forced apex -> www rule was added to src/_redirects.
 * Netlify's Domain management already redirected www -> apex, so the two formed
 * an infinite loop and the entire site served ERR_TOO_MANY_REDIRECTS for five
 * weeks before anyone noticed. Separately, src/pages/success.html had no
 * `permalink`, so it built to /pages/success/ while the contact form posted to
 * /success/ — every submission 404'd and no conversion event ever fired.
 *
 * These checks catch that class of mistake before it merges. They CANNOT see
 * Netlify's dashboard settings, so they cannot prove the live site resolves —
 * that is what scripts/smoke.mjs does against production.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const PUBLIC = 'public';
const CANONICAL_HOST = JSON.parse(readFileSync('src/_data/client.json', 'utf8')).domain;
const GA_ID = 'G-JCE28PJHNE';

const failures = [];
const fail = (check, msg) => failures.push({ check, msg });

/* ------------------------------------------------------------------ */
/* Collect built pages                                                 */
/* ------------------------------------------------------------------ */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}
const pages = walk(PUBLIC).filter((p) => !p.includes(`${PUBLIC}/admin/`));
if (pages.length === 0) fail('build', 'No HTML found in public/ — did the build run?');

/* ------------------------------------------------------------------ */
/* Parse _redirects                                                    */
/* ------------------------------------------------------------------ */
const redirectLines = existsSync('src/_redirects')
  ? readFileSync('src/_redirects', 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
  : [];

const rules = redirectLines.map((line) => {
  const [from, to, status] = line.split(/\s+/);
  return { from, to, status, line };
});

/* 1. No rule may send the canonical host somewhere else, and no rule may point
 *    at a host that is not the canonical host. Either direction is how you end
 *    up fighting Netlify's primary-domain redirect and looping. */
for (const { from, to, line } of rules) {
  const fromHost = from?.startsWith('http') ? new URL(from.replace('/*', '/')).host : null;
  const toHost = to?.startsWith('http') ? new URL(to.replace(/\/:splat$/, '/')).host : null;

  if (fromHost === CANONICAL_HOST && toHost && toHost !== CANONICAL_HOST) {
    fail(
      'redirect-loop',
      `Rule redirects the canonical host away from itself — this is what took the site down in July.\n` +
        `    ${line}\n` +
        `    canonical host is ${CANONICAL_HOST} (src/_data/client.json)`
    );
  }
  if (toHost && toHost !== CANONICAL_HOST) {
    fail(
      'redirect-loop',
      `Rule sends traffic to ${toHost}, which is not the canonical host ${CANONICAL_HOST}.\n    ${line}`
    );
  }
}

/* 2. Wildcard rules must not shadow more specific rules above them. */
const seenWildcards = [];
for (const { from, line } of rules) {
  const prefix = from?.endsWith('/*') ? from.slice(0, -1) : null;
  const shadowed = seenWildcards.find((w) => from?.startsWith(w.prefix));
  if (shadowed) {
    fail(
      'redirect-order',
      `Rule is unreachable — an earlier wildcard already matches it (Netlify uses first match wins).\n` +
        `    unreachable: ${line}\n    shadowed by: ${shadowed.line}`
    );
  }
  if (prefix) seenWildcards.push({ prefix, line });
}

/* ------------------------------------------------------------------ */
/* Per-page checks                                                     */
/* ------------------------------------------------------------------ */
const redirectSources = new Set(rules.map((r) => r.from));
const matchesRedirect = (url) =>
  redirectSources.has(url) ||
  rules.some((r) => r.from?.endsWith('/*') && url.startsWith(r.from.slice(0, -1)));

/** Does an internal URL path exist in the build output? */
function resolves(urlPath) {
  const clean = urlPath.split('#')[0].split('?')[0];
  if (clean === '' || clean === '/') return existsSync(join(PUBLIC, 'index.html'));
  const candidates = [
    join(PUBLIC, clean),
    join(PUBLIC, clean, 'index.html'),
    join(PUBLIC, `${clean}.html`),
  ];
  return candidates.some((c) => existsSync(c));
}

for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const url = '/' + relative(PUBLIC, file).replace(/index\.html$/, '').replace(/\.html$/, '');

  /* 3. Exactly one canonical, absolute, on the canonical host. */
  const canonicals = [...html.matchAll(/<link\s+rel="canonical"\s+href="([^"]+)"/g)].map((m) => m[1]);
  if (canonicals.length !== 1) {
    fail('canonical', `${url} has ${canonicals.length} canonical tags (expected exactly 1)`);
  } else {
    const href = canonicals[0];
    if (!href.startsWith('https://')) fail('canonical', `${url} canonical is not absolute https: ${href}`);
    else if (new URL(href).host !== CANONICAL_HOST)
      fail('canonical', `${url} canonical points at ${new URL(href).host}, expected ${CANONICAL_HOST}`);
  }

  /* 4. Analytics must be present on every page. Losing the tag silently is how
   *    you end up staring at "No data received" and not knowing why. */
  if (!html.includes(GA_ID)) fail('analytics', `${url} is missing the GA4 tag ${GA_ID}`);

  /* 5. Every form action must resolve to a real built page. This is the
   *    /success/ bug: the conversion events live on the action target, so a
   *    404 there means conversions are never recorded. */
  for (const m of html.matchAll(/<form[^>]+action="([^"]+)"/g)) {
    const action = m[1];
    if (action.startsWith('/') && !resolves(action) && !matchesRedirect(action)) {
      fail('form-action', `${url} posts to ${action}, which does not exist in the build`);
    }
  }

  /* 6. Internal links must resolve. */
  for (const m of html.matchAll(/\shref="(\/[^"]*)"/g)) {
    const href = m[1];
    if (href.startsWith('//')) continue;
    if (!resolves(href) && !matchesRedirect(href.split('#')[0].split('?')[0])) {
      fail('broken-link', `${url} links to ${href}, which does not exist in the build`);
    }
  }
}

/* 7. The conversion page must exist. Named explicitly so the failure message is
 *    obvious rather than buried in a link report. */
if (!existsSync(join(PUBLIC, 'success', 'index.html'))) {
  fail('conversion-page', '/success/ is missing — form submissions will 404 and no conversion will fire');
}

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */
if (failures.length === 0) {
  console.log(`✓ build checks passed — ${pages.length} pages, ${rules.length} redirect rules, canonical host ${CANONICAL_HOST}`);
  process.exit(0);
}
const byCheck = failures.reduce((acc, f) => ((acc[f.check] ??= []).push(f.msg), acc), {});
console.error(`\n✗ ${failures.length} build check failure(s):\n`);
for (const [check, msgs] of Object.entries(byCheck)) {
  console.error(`  [${check}]`);
  for (const m of msgs) console.error(`    - ${m}`);
  console.error('');
}
process.exit(1);
