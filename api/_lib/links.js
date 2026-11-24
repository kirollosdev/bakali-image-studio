// One-time links for joining the team or resetting a password. Only a SHA-256 of the
// token is stored, so the links can't be rebuilt from the stored data.
import { createHash, randomBytes, randomUUID } from 'node:crypto';

export const LINK_DAYS = 7;
export const tokenHash = (t) => createHash('sha256').update(String(t)).digest('base64url');

export function newLink(fields) {
  const token = randomBytes(24).toString('base64url');
  const link = { id: randomUUID(), hash: tokenHash(token), createdAt: Date.now(), expiresAt: Date.now() + LINK_DAYS * 864e5, ...fields };
  return { token, link };
}

export const liveLinks = (d) => (d.links || []).filter((l) => l.expiresAt > Date.now());

export function linkUrl(req, token) {
  const u = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') || u.host;
  const proto = req.headers.get('x-forwarded-proto') || u.protocol.replace(':', '');
  return `${proto}://${host}/?link=${token}`;
}
