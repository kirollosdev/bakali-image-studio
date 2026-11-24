// JSON documents and image files live in a private Vercel Blob store.
// Writes use the blob ETag (ifMatch) so two people saving at once can't overwrite each other.
import { get, put, BlobPreconditionFailedError } from '@vercel/blob';

export async function readJSON(pathname, fallback) {
  const r = await get(pathname, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return { data: structuredClone(fallback), etag: null };
  const text = await new Response(r.stream).text();
  return { data: JSON.parse(text), etag: r.blob.etag };
}

async function writeJSON(pathname, data, etag) {
  return put(pathname, JSON.stringify(data), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    cacheControlMaxAge: 60,
    ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
  });
}

// Read-modify-write with retries. `fn` mutates `data` in place and may return a value.
export async function updateJSON(pathname, fallback, fn) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, etag } = await readJSON(pathname, fallback);
    const result = await fn(data);
    try {
      await writeJSON(pathname, data, etag);
      return { data, result };
    } catch (e) {
      const conflict = e instanceof BlobPreconditionFailedError || /already exists|precondition/i.test(e?.message || '');
      if (!conflict || attempt === 4) throw e;
    }
  }
}
