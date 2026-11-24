import { get } from '@vercel/blob';
import { route, HttpError } from './_lib/http.js';
import { requireRole } from './_lib/auth.js';

// Streams a private image to a signed-in person: /api/image?p=<blob path from /api/images>
// Each upload gets a new random path, so a path never changes content and can be cached for good.
export const GET = route(async (req) => {
  await requireRole(req, 'viewer');
  const p = new URL(req.url).searchParams.get('p') || '';
  if (!/^images\/\d+\/[\w.-]+$/.test(p)) throw new HttpError(400, 'Invalid image.');
  const r = await get(p, { access: 'private' });
  if (!r || r.statusCode !== 200) throw new HttpError(404, 'No image.');
  return new Response(r.stream, {
    headers: {
      'content-type': r.blob.contentType,
      'content-length': String(r.blob.size),
      'cache-control': 'private, max-age=31536000, immutable',
    },
  });
});
