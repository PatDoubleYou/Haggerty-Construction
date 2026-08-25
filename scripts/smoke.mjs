#!/usr/bin/env node
/**
 * Production smoke test. Hits the LIVE site and fails loudly if it is broken.
 *
 * This is the check that matters. The July 2026 outage was caused by a rule in
 * src/_redirects colliding with Netlify's primary-domain setting — a bug that
 * existed only in the interaction between the repo and the hosting dashboard.
 * No amount of building or linting the repo can see it. Only asking the real
 * internet for a real page can.
 *
 * Usage:  node scripts/smoke.mjs [--host https://haggertyutah.com]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANONICAL_HOST = JSON.parse(readFileSync('src/_data/client.json', 'utf8')).domain;
const GA_ID = 'G-JCE28PJHNE';
const MAX_REDIRECTS = 4;

const hostArg = process.argv.indexOf('--host');
const BASE = hostArg > -1 ? process.argv[hostArg + 1].replace(/\/$/, '') : `https://${CANONICAL_HOST}`;

/** Pages that must return 200. /success/ is the conversion page — if it 404s,
 *  form submissions stop being recorded, which is its own silent outage. */
const PATHS = [
  '/',
  '/services/',
  '/services/kitchen-remodels/',
  '/services/custom-cabinetry/',
  '/services/bathroom-remodels/',
  '/gallery/',
  '/about/',
  '/success/',
  '/sitemap.xml',
  '/robots.txt',
];

/** Both hosts must terminate on a real page. Whichever one is not canonical
 *  should 301 to the canonical one — exactly once, not forever. */
const HOSTS = [`https://${CANONICAL_HOST}`, `https://www.${CANONICAL_HOST.replace(/^www\./, '')}`];

const tmp = mkdtempSync(join(tmpdir(), 'smoke-'));
const failures = [];

function fetchUrl(url) {
  const body = join(tmp, 'body');
  try {
    const out = execFileSync(
      'curl',
      ['-sS', '-L', '--max-redirs', String(MAX_REDIRECTS), '--max-time', '30',
       '-o', body, '-w', '%{http_code} %{num_redirects} %{url_effective}', url],
      { encoding: 'utf8' }
    );
    const [code, redirects, effective] = out.trim().split(' ');
    return { ok: true, code: Number(code), redirects: Number(redirects), effective, body: readFileSync(body, 'utf8') };
  } catch (err) {
    // curl exit 47 = "Maximum redirects followed" — i.e. a redirect loop.
    const loop = err.status === 47;
    return { ok: false, loop, status: err.status, stderr: String(err.stderr || err.message).trim() };
  }
}

console.log(`Smoke testing ${BASE}\n`);

/* 1. Every page must load. */
for (const path of PATHS) {
  const url = `${BASE}${path}`;
  const r = fetchUrl(url);

  if (!r.ok) {
    failures.push(
      r.loop
        ? `REDIRECT LOOP at ${url} — more than ${MAX_REDIRECTS} hops. The site is DOWN for every visitor.`
        : `${url} — request failed (curl exit ${r.status}): ${r.stderr}`
    );
    console.log(`  ✗ ${path}`);
    continue;
  }
  if (r.code !== 200) {
    failures.push(`${url} returned HTTP ${r.code} (expected 200), landed on ${r.effective}`);
    console.log(`  ✗ ${path} → ${r.code}`);
    continue;
  }
  if (path.endsWith('/') && !r.body.includes(GA_ID)) {
    failures.push(`${url} is missing the GA4 tag ${GA_ID} — analytics is not recording this page`);
    console.log(`  ✗ ${path} (no analytics)`);
    continue;
  }
  console.log(`  ✓ ${path}${r.redirects ? ` (${r.redirects} redirect)` : ''}`);
}

/* 2. Both hosts must resolve, and land on the canonical one. */
console.log('');
for (const host of [...new Set(HOSTS)]) {
  const r = fetchUrl(`${host}/`);
  if (!r.ok) {
    failures.push(
      r.loop
        ? `REDIRECT LOOP on ${host} — apex/www are pointing at each other. Check that src/_redirects does not fight Netlify's primary-domain setting.`
        : `${host} — request failed (curl exit ${r.status}): ${r.stderr}`
    );
    console.log(`  ✗ ${host}`);
    continue;
  }
  if (r.code !== 200) {
    failures.push(`${host} returned HTTP ${r.code} (expected 200)`);
    console.log(`  ✗ ${host} → ${r.code}`);
    continue;
  }
  const landed = new URL(r.effective).host;
  if (landed !== CANONICAL_HOST) {
    failures.push(`${host} landed on ${landed}, expected the canonical host ${CANONICAL_HOST}`);
    console.log(`  ✗ ${host} → ${landed}`);
    continue;
  }
  console.log(`  ✓ ${host} → ${landed}${r.redirects ? ` (${r.redirects} redirect)` : ''}`);
}

if (failures.length) {
  console.error(`\n✗ SITE CHECK FAILED — ${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`\n✓ ${BASE} is healthy.`);
