#!/usr/bin/env node
/**
 * Removes location (and all other) metadata from photos under src/.
 * Phone photos record GPS coordinates of where they were taken, usually a
 * client's home, and src/assets is published as-is.
 *
 * Only files that actually contain GPS data are rewritten. Orientation is
 * baked into the pixels first, since the tag that stores it goes too.
 *
 *   npm run strip-photo-metadata
 */
import exifr from 'exifr';
import sharp from 'sharp';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const walk = (d, o = []) => {
  for (const e of readdirSync(d)) {
    const f = join(d, e);
    if (statSync(f).isDirectory()) walk(f, o);
    else if (/\.(jpe?g|png|webp)$/i.test(e)) o.push(f);
  }
  return o;
};

let fixed = 0;
for (const f of walk('src')) {
  let gps = null;
  try { gps = await exifr.gps(f); } catch { /* no EXIF */ }
  if (!gps || gps.latitude == null) continue;
  const img = sharp(f).rotate();
  const ext = extname(f).toLowerCase();
  const out = ext === '.png' ? await img.png().toBuffer()
    : ext === '.webp' ? await img.webp({ quality: 92 }).toBuffer()
    : await img.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  writeFileSync(f, out);
  console.log(`stripped ${f}`);
  fixed++;
}
console.log(fixed ? `✓ removed location data from ${fixed} photo(s)` : '✓ no photos with location data');
