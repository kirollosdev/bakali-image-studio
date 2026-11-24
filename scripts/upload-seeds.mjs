// One-time import of the images that existed before the app (scripts/seed/<item id>.jpg)
// into the private Blob store. Items that already have an image are skipped.
// Usage: node --env-file=.env.local scripts/upload-seeds.mjs
import { readdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { get, put } from '@vercel/blob';

const dir = new URL('./seed/', import.meta.url);
const IMAGES = 'data/images.json';

async function readIndex() {
  const r = await get(IMAGES, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return { data: {}, etag: null };
  return { data: JSON.parse(await new Response(r.stream).text()), etag: r.blob.etag };
}

const { data, etag } = await readIndex();
const files = (await readdir(dir)).filter((f) => /^\d+\.jpe?g$/i.test(f));
let added = 0;
for (const f of files) {
  const id = f.split('.')[0];
  if (data[id]) {
    console.log(`skip ${id} (already has an image)`);
    continue;
  }
  const buf = await readFile(new URL(f, dir));
  const thumb = await sharp(buf).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  const opts = { access: 'private', addRandomSuffix: true };
  const [full, small] = await Promise.all([
    put(`images/${id}/original.jpg`, buf, { ...opts, contentType: 'image/jpeg' }),
    put(`images/${id}/thumb.webp`, thumb, { ...opts, contentType: 'image/webp' }),
  ]);
  data[id] = { path: full.pathname, thumb: small.pathname, type: 'image/jpeg', by: 'Drive import', at: Date.now() };
  added++;
  console.log(`added ${id}`);
}

await put(IMAGES, JSON.stringify(data), {
  access: 'private',
  contentType: 'application/json',
  addRandomSuffix: false,
  ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
});
console.log(`Done: ${added} added, ${files.length - added} skipped.`);
