// imports for the various eleventy plugins (navigation & image)
const eleventyNavigationPlugin = require('@11ty/eleventy-navigation');
const { DateTime } = require('luxon');
// eleventy-img v7 is ESM-only; Node 22 can require() it, and the function is the default export.
const Image = require('@11ty/eleventy-img').default;
const path = require('path');

// allows the use of {% image... %} to create responsive, optimised images
// CHANGE DEFAULT MEDIA QUERIES AND WIDTHS
//   src       './src/…' file path, or a site URL like '/assets/images/…' (what
//             front matter uses) — URLs are resolved to their source under src/
//   imgClass  classes for the <img> itself (className goes on <picture>)
//   loading   'lazy', or 'eager' for above-the-fold heroes (also sets fetchpriority)
async function imageShortcode(src, alt, className, loading, sizes = '(max-width: 600px) 400px, 850px', imgClass = '') {
  // don't pass an alt? chuck it out. passing an empty string is okay though
  if (alt === undefined) {
    throw new Error(`Missing \`alt\` on responsiveimage from: ${src}`);
  }
  if (src.startsWith('/')) src = `./src${src}`;

  // create the metadata for an optimised image
  let metadata = await Image(`${src}`, {
    widths: [200, 400, 850, 1920, 2500],
    formats: ['webp', 'jpeg'],
    urlPath: '/images/',
    outputDir: './public/images',
    filenameFormat: function (id, src, width, format, options) {
      const extension = path.extname(src);
      // Spaces would break srcset (a space separates the URL from its width
      // descriptor), so the browser would fall back to the tiny src image.
      const name = path.basename(src, extension).trim().replace(/\s+/g, '-');
      return `${name}-${width}w.${format}`;
    },
  });

  // get the smallest and biggest image for picture/image attributes
  let lowsrc = metadata.jpeg[0];
  let highsrc = metadata.jpeg[metadata.jpeg.length - 1];

  // when {% image ... %} is used, this is what's returned
  return `<picture class="${className}">
    ${Object.values(metadata)
      .map((imageFormat) => {
        return `  <source type="${imageFormat[0].sourceType}" srcset="${imageFormat
          .map((entry) => entry.srcset)
          .join(', ')}" sizes="${sizes}">`;
      })
      .join('\n')}
      <img${imgClass ? ` class="${imgClass}"` : ''}
        src="${lowsrc.url}"
        width="${highsrc.width}"
        height="${highsrc.height}"
        alt="${alt}"
        loading="${loading}"${loading === 'eager' ? '\n        fetchpriority="high"' : ''}
        decoding="async">
    </picture>`;
}

module.exports = function (eleventyConfig) {
  // adds the navigation plugin for easy navs
  eleventyConfig.addPlugin(eleventyNavigationPlugin);

  // allows css, assets, robots.txt and CMS config files to be passed into /public
  eleventyConfig.addPassthroughCopy('./src/css/**/*.css');
  eleventyConfig.addPassthroughCopy('./src/assets');
  eleventyConfig.addPassthroughCopy('./src/admin');
  eleventyConfig.addPassthroughCopy('./src/_redirects');
  eleventyConfig.addPassthroughCopy({ './src/images': '/images' });
  eleventyConfig.addPassthroughCopy({ './src/robots.txt': '/robots.txt' });
  // Source must be src/, not public/ — public/ is the build OUTPUT and is
  // gitignored, so this silently copied nothing on a clean checkout and
  // /favicon.ico 404'd on every page.
  eleventyConfig.addPassthroughCopy({ './src/assets/favicons/favicon.ico': '/favicon.ico' });

  // `npm start` serves the site with live reload. CSS is passthrough-copied,
  // so watch it explicitly to reload on stylesheet edits.
  eleventyConfig.addWatchTarget('./src/css/');

  // allows the {% image %} shortcode to be used for optimised iamges (in webp if possible)
  eleventyConfig.addNunjucksAsyncShortcode('image', imageShortcode);

  // normally, 11ty will render dates on blog posts in full JSDate format (Fri Dec 02 18:00:00 GMT-0600). That's ugly
  // this filter allows dates to be converted into a normal, locale format. view the docs to learn more (https://moment.github.io/luxon/api-docs/index.html#datetime)
  eleventyConfig.addFilter('postDate', (dateObj) => {
    return DateTime.fromJSDate(dateObj).toLocaleString(DateTime.DATE_MED);
  });

  return {
    dir: {
      input: 'src',
      includes: '_includes',
      layouts: "_layouts",
      output: 'public',
    },
    // allows .html files to contain nunjucks templating language
    htmlTemplateEngine: 'njk',
  };
};
