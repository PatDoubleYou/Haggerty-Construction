# Operations

## What happened in July 2026

On 2026-07-21, commit `030a210` added forced `apex -> www` rules to
`src/_redirects`. Netlify's Domain management already had the apex
(`haggertyutah.com`) set as the **primary domain**, so Netlify was redirecting
`www -> apex` at the domain layer, before `_redirects` is consulted.

The two redirects pointed at each other:

```
https://www.haggertyutah.com/  ->  301  ->  https://haggertyutah.com/
https://haggertyutah.com/      ->  301  ->  https://www.haggertyutah.com/
```

Every URL on the site returned `ERR_TOO_MANY_REDIRECTS`. It stayed that way for
**five weeks**. Nobody noticed, because nothing was checking. Google Analytics
showed "No data received" — correctly, since no page ever rendered — and that
was read as an analytics problem rather than an outage.

A second, older bug surfaced during the same investigation: `src/pages/success.html`
had no `permalink`, so Eleventy built it to `/pages/success/` while the contact
form posted to `/success/`. Every form submission landed on a 404, and the
Google Ads and GA4 conversion events that live on that page never fired.

## The invariants

Three rules. Breaking any of them takes the site or the lead pipeline down
silently, which is the dangerous kind.

1. **One source of truth for the canonical host.** `src/_data/client.json`
   → `domain` feeds the canonical tag, `og:url`, the sitemap, and the schema
   block. It must match Netlify's **primary domain** setting. If you want to
   switch between apex and www, change *both*, or neither. Changing one
   recreates the outage.

2. **`_redirects` must never redirect the canonical host away from itself.**
   Netlify already handles the non-canonical host. Adding your own rule for it
   is how you get a loop.

3. **`/success/` must exist.** It is the `action` target of the contact form
   and the only place conversion events fire. If it 404s, leads still reach the
   Netlify forms inbox but you are flying blind on where they came from.

## The checks

| Command | What it does | Where it runs |
| --- | --- | --- |
| `npm run verify` | Build, then check the output | Locally, before you push |
| `npm run check` | Build-output checks only | CI, on every PR (`.github/workflows/ci.yml`) |
| `npm run smoke` | Hits the **live site** and fails if it is broken | Every 15 min (`.github/workflows/uptime.yml`) |

`npm run check` (`scripts/check-build.mjs`) catches: redirect rules that fight
the canonical host, unreachable rules shadowed by an earlier wildcard, missing
or wrong-host canonical tags, pages missing the GA4 tag, form actions pointing
at pages the build does not produce, and broken internal links.

`npm run smoke` (`scripts/smoke.mjs`) is the one that would have caught the
July outage. The bug existed only in the interaction between this repo and a
Netlify dashboard setting — nothing you can build or lint locally can see it.
Only asking the real internet for a real page can. It checks both hosts for
loops, requires HTTP 200 on the key pages, and verifies the GA4 tag is actually
present in the served HTML.

On failure the uptime workflow opens a single issue labelled `outage` (it will
not file duplicates) and closes it automatically when the site recovers.

## Recommended, not yet done

- **Branch protection on `main`:** require the `Build and check` status check
  to pass before merging. Settings → Branches → Add rule. Without this, CI can
  fail and the merge button still works.
- **An external uptime monitor.** GitHub disables scheduled workflows after 60
  days of repo inactivity and delays them under load. A free UptimeRobot or
  Better Stack monitor on `https://haggertyutah.com/` with SMS alerts is a
  better primary alarm; treat the workflow as the backup.
- **Netlify deploy notifications** to email or SMS, so a failed build is
  visible without opening the dashboard.

## Gotchas

- `public/` is the build output and is gitignored — **except** `public/images/blog/`,
  which is committed. A `rm -rf public` before rebuilding will delete those
  tracked files. Restore with `git checkout -- public/images/blog/`.
- Netlify `_redirects` is **first match wins**. Specific rules must appear above
  wildcards. `npm run check` enforces this.
