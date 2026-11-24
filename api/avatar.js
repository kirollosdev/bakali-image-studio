import { createHash } from 'node:crypto';
import { put, del } from '@vercel/blob';
import { route, json, HttpError } from './_lib/http.js';
import { requireRole, updateUsers, ownRecord, publicUser } from './_lib/auth.js';

// Your own profile picture. The browser crops and shrinks it to a small WebP first,
// so the upload is tiny. Body: the image bytes.
const MAX = 1024 * 1024;
const TYPES = ['image/webp', 'image/jpeg', 'image/png'];

export const POST = route(async (req) => {
  const me = await requireRole(req, 'viewer');
  const type = (req.headers.get('content-type') || '').split(';')[0];
  if (!TYPES.includes(type)) throw new HttpError(400, 'Use a JPG, PNG or WebP image.');
  const bytes = Buffer.from(await req.arrayBuffer());
  if (!bytes.length) throw new HttpError(400, 'Empty image.');
  if (bytes.length > MAX) throw new HttpError(413, 'Image is too large.');

  const key = createHash('sha256').update(me.email).digest('hex').slice(0, 16);
  const blob = await put(`avatars/${key}.${type.split('/')[1]}`, bytes, { access: 'private', contentType: type, addRandomSuffix: true });
  let old = null;
  const user = await updateUsers((d) => {
    const rec = ownRecord(d, me);
    old = rec.avatar || null;
    rec.avatar = blob.pathname;
    return rec;
  });
  if (old) await del(old).catch(() => {});
  return json({ user: publicUser(user) });
});

export const DELETE = route(async (req) => {
  const me = await requireRole(req, 'viewer');
  let old = null;
  const user = await updateUsers((d) => {
    const rec = ownRecord(d, me);
    old = rec.avatar || null;
    delete rec.avatar;
    return rec;
  });
  if (old) await del(old).catch(() => {});
  return json({ user: publicUser(user) });
});
