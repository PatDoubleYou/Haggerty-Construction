#!/usr/bin/env node
/**
 * Source-level conventions. Runs on src/ directly (no build needed), so it is
 * fast enough to run before every push: `npm run lint`.
 *
 * check-build.mjs asks "is the built site broken?". This asks "is the source
 * drifting back into the habits that broke it?" Each rule exists because the
 * problem it prevents actually happened in this repo — see OPERATIONS.md.
 *
 * Grandfathered files are listed explicitly. The lists should only shrink:
 * when you clean one of those files up, delete it from the list.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { execSync } from 'node:child_process';

const SRC = 'src';
const failures = [];
const fail = (rule, file, msg) => failures.push({ rule, msg: `${file}: ${msg}` });

/* Older stylesheets that predate the design tokens. Fold each into main.css's
 * tokens, then remove it from this list. */
const LEGACY_CSS = new Set(['local.css', 'blog.css', 'projects.css', 'reviews.css']);

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
const isUnpublished = (text) => /^permalink:\s*false\s*$/m.test(text.split(/^---\s*$/m)[1] ?? '');

/* Templates that are actually published. Pages switched off with
 * `permalink: false` are skipped until they are switched back on. */
const templates = files
  .filter(isTemplate)
  .map((f) => ({ f, text: readFileSync(f, 'utf8') }))
  .filter(({ text }) => !isUnpublished(text));

const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;

/* ------------------------------------------------------------------ */
/* 1. Colors live in tokens.                                           */
/*    A raw color is allowed only as the value of a custom property    */
/*    (`--surface-card: #242424;`). Everything else uses var(--…), so  */
/*    a theme is one block of tokens, not a hunt through 1,000 lines.  */
/* ------------------------------------------------------------------ */
for (const f of files.filter((f) => f.endsWith('.css'))) {
  const name = f.split('/').pop();
  if (name.endsWith('.min.css') || LEGACY_CSS.has(name)) continue;
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
