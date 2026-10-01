#!/usr/bin/env node
/**
 * Source-level conventions. Runs on src/ directly (no build needed), so it is
 * fast enough to run before every push: `npm run lint`.
 *
 * check-build.mjs asks "is the built site broken?". This asks "is the source
 * drifting back into the habits that broke it?" Each rule exists because the
 * problem it prevents actually happened in this repo — see OPERATIONS.md.
 *
 * Pages switched off with `permalink: false`, and stylesheets only those pages
 * load, are skipped. The moment a page is switched back on, it and its
 * stylesheet have to pass.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { execSync } from 'node:child_process';

const SRC = 'src';
const failures = [];
const fail = (rule, file, msg) => failures.push({ rule, msg: `${file}: ${msg}` });

/* Netlify CMS writes blog uploads here (admin/config.yml media_folder). The
 * blog is unpublished; retire or repoint the CMS, then remove this. */
const TRACKED_OUTPUT_ALLOWED = ['public/images/blog/'];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(SRC).filter((f) => !f.startsWith(join(SRC, 'admin')));
const isTemplate = (f) => ['.html', '.md', '.njk'].includes(extname(f));
const frontMatter = (text) => (text.startsWith('---') ? text.split(/^---\s*$/m)[1] ?? '' : '');
const fmValue = (text, key) => frontMatter(text).match(new RegExp(`^${key}:\\s*['"]?([^'"\\n]+?)['"]?\\s*$`, 'm'))?.[1];
const isUnpublished = (text) => fmValue(text, 'permalink') === 'false';

const LAYOUTS = join(SRC, '_layouts');
const INCLUDES = join(SRC, '_includes');
const all = files.filter(isTemplate).map((f) => ({ f, text: readFileSync(f, 'utf8') }));

/* A page's layout comes from its front matter or the nearest directory data
 * file (src/blog/blog.json -> "layout": "blog-post.html"). */
function layoutOf(f, text) {
  const own = fmValue(text, 'layout');
  if (own) return own;
  for (let dir = f.slice(0, f.lastIndexOf('/')); dir.startsWith(SRC); dir = dir.slice(0, dir.lastIndexOf('/'))) {
    try {
      const data = JSON.parse(readFileSync(join(dir, dir.split('/').pop() + '.json'), 'utf8'));
      if (data.layout) return data.layout;
    } catch { /* no directory data file here */ }
  }
  return null;
}

/* Published pages, plus the layouts they actually use (following each
 * layout's own `layout:` chain), plus includes. Pages switched off with
 * `permalink: false`, and layouts only they use, are skipped until a page
 * using them is switched back on. */
const pages = all.filter(({ f, text }) => !f.startsWith(LAYOUTS) && !f.startsWith(INCLUDES) && !isUnpublished(text));
const liveLayouts = new Set();
for (const { f, text } of pages) {
  for (let name = layoutOf(f, text); name && !liveLayouts.has(name); ) {
    liveLayouts.add(name);
    const layout = all.find((t) => t.f === join(LAYOUTS, name));
    name = layout && fmValue(layout.text, 'layout');
  }
}
const templates = all.filter(({ f }) =>
  f.startsWith(INCLUDES) || (f.startsWith(LAYOUTS) ? liveLayouts.has(relative(LAYOUTS, f)) : pages.some((p) => p.f === f))
);

const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;

/* A stylesheet is "live" if a live page, layout or include loads it. */
const liveText = templates.map(({ text }) => text).join('\n');
const isLiveStylesheet = (f) => liveText.includes('/' + relative(SRC, f));

/* ------------------------------------------------------------------ */
/* 1. Colors live in tokens.                                           */
/*    A raw color is allowed only as the value of a custom property    */
/*    (`--surface-card: #242424;`). Everything else uses var(--…), so  */
/*    a theme is one block of tokens, not a hunt through 1,000 lines.  */
/* ------------------------------------------------------------------ */
for (const f of files.filter((f) => f.endsWith('.css'))) {
  if (f.endsWith('.min.css') || !isLiveStylesheet(f)) continue;
  const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  css.split('\n').forEach((line, i) => {
    if (COLOR.test(line) && !/^\s*--[\w-]+\s*:/.test(line)) {
      fail('colors-in-tokens', `${f}:${i + 1}`, `raw color outside a token — define a --token in :root and use var(): ${line.trim()}`);
    }
  });
}

/* ------------------------------------------------------------------ */
/* 2. Text follows the theme.                                          */
/*    Bootstrap's text-white / text-light / bg-dark hard-code one       */
/*    theme into the markup. That is what made light mode a 50-class   */
/*    hunt. Use the tokens (or .text-strong for emphasis).             */
/* ------------------------------------------------------------------ */
const THEME_UTILITIES = ['text-white', 'text-light', 'text-dark', 'text-black', 'bg-dark', 'bg-light', 'bg-white', 'bg-black'];
for (const { f, text } of templates) {
  for (const m of text.matchAll(/class="([^"]*)"/g)) {
    const bad = m[1].split(/\s+/).filter((c) => THEME_UTILITIES.includes(c));
    if (bad.length) fail('theme-utilities', f, `uses ${bad.join(', ')} — let the theme tokens color it (or use .text-strong)`);
  }
}

/* ------------------------------------------------------------------ */
/* 3. No colors in inline styles. Same reason as 1, in the markup.     */
/* ------------------------------------------------------------------ */
for (const { f, text } of templates) {
  for (const m of text.matchAll(/style="([^"]*)"/g)) {
    if (/(?:^|;)\s*(?:color|background(?:-color)?|border(?:-[a-z]+)?-color)\s*:/.test(m[1]) || COLOR.test(m[1])) {
      fail('inline-colors', f, `inline color in style="${m[1]}" — use a class (.icon-accent, .panel, …)`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 4. Images go through the {% image %} shortcode.                     */
/*    /images/<name>-850w.webp only exists if some template runs that  */
/*    source through the shortcode. Hand-written references broke      */
/*    silently when the other template changed (the About page hero    */
/*    404'd for months). Reference the source in /assets/images/.      */
/* ------------------------------------------------------------------ */
const GENERATED = /(?<![\w/])\/images\/[^"'\s)]+-\d+w\.(?:webp|jpe?g|png|avif)/g;
for (const { f, text } of templates) {
  for (const m of text.matchAll(GENERATED)) {
    fail('image-shortcode', f, `links to generated file ${m[0]} — point at the original in /assets/images/ and use {% image %}`);
  }
}

/* ------------------------------------------------------------------ */
/* 5. Every stylesheet is used, and there are no uncompiled sources.   */
/*    Twelve .less files sat here for years; editing them did nothing. */
/* ------------------------------------------------------------------ */
const allTemplateText = files.filter(isTemplate).map((f) => readFileSync(f, 'utf8')).join('\n');
for (const f of files) {
  const rel = '/' + relative(SRC, f);
  if (f.endsWith('.css') && !allTemplateText.includes(rel)) {
    fail('unused-file', f, `no template loads ${rel} — delete it`);
  }
  if (['.less', '.scss', '.sass'].includes(extname(f))) {
    fail('unused-file', f, `nothing compiles ${extname(f)} files in this build — edit the .css instead`);
  }
}

/* ------------------------------------------------------------------ */
/* 6. Build output stays out of git.                                   */
/*    public/ is generated; committed files there get clobbered or     */
/*    deleted by a clean build.                                        */
/* ------------------------------------------------------------------ */
try {
  const tracked = execSync('git ls-files public', { encoding: 'utf8' }).split('\n').filter(Boolean);
  for (const t of tracked) {
    if (!TRACKED_OUTPUT_ALLOWED.some((p) => t.startsWith(p))) {
      fail('build-output', t, 'is committed, but public/ is build output — put the source under src/');
    }
  }
} catch {
  /* not a git checkout (e.g. a tarball build) — nothing to check */
}

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */
if (failures.length === 0) {
  console.log(`✓ conventions passed — ${templates.length} templates, ${files.filter((f) => f.endsWith('.css')).length} stylesheets`);
  process.exit(0);
}
const byRule = failures.reduce((acc, f) => ((acc[f.rule] ??= []).push(f.msg), acc), {});
console.error(`\n✗ ${failures.length} convention failure(s) — see "Conventions" in OPERATIONS.md:\n`);
for (const [rule, msgs] of Object.entries(byRule)) {
  console.error(`  [${rule}]`);
  for (const m of msgs) console.error(`    - ${m}`);
  console.error('');
}
process.exit(1);
