# haggertyutah.com

The website for Haggerty Construction, a family-owned remodeling contractor in
St. George, Utah. Static site built with [Eleventy](https://www.11ty.dev/),
deployed by Netlify from `main`.

## Working on it

```sh
npm ci
npm start          # dev server with live reload
npm run verify     # clean build + output checks — run before you push
```

Work on a branch and open a pull request. CI runs the checks on every PR, and
merging to `main` deploys.

## Where things live

| Path | What it is |
| --- | --- |
| `src/index.html` | Homepage |
| `src/services/*.md` | Service pages — content in front matter, rendered by `src/_layouts/service.html` |
| `src/projects/*.md` | Project write-ups, rendered by `src/_layouts/project.html` |
| `src/pages/` | About, gallery, success (form thank-you page) |
| `src/_includes/` | Header, footer, contact form, lead-magnet card |
| `src/_data/client.json` | Business name, phone, email, **canonical domain** |
| `src/css/main.css` | Design tokens (`:root`) and site styles |
| `src/css/light.css` | Light theme — a page opts in with `theme: 'light'` in front matter |
| `src/css/local.css` | Older service-page styles, to be folded into `main.css` |
| `src/assets/images/` | Original photos. Never link to these directly — see below |
| `messaging/` | Copywriting notes. Not published |
| `scripts/` | CI checks and the uptime monitor |

## Images

Put the original photo in `src/assets/images/` and render it with the
`image` shortcode, which writes resized WebP/JPEG files to `/images/` and the
`srcset` that picks between them:

```njk
{% image '/assets/images/projects/kitchen.jpg', 'Alt text', 'picture-class', 'lazy', '(min-width: 768px) 50vw, 100vw', 'img-class' %}
```

Front-matter fields such as `heroImage` and `galleryImages[].src` take the same
`/assets/images/...` path and are run through the shortcode by the layouts.
Use `'eager'` only for the image at the top of a page.

## Rules

`OPERATIONS.md` explains the rules that keep the site up and the leads
flowing, and the conventions the code follows. CI enforces both.
