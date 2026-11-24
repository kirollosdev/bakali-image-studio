import { randomUUID } from 'node:crypto';
import { route, json, body, HttpError } from './_lib/http.js';
import { readUsersDoc, updateUsers, hashPassword, validPassword, normEmail, adminEmail, sessionCookie, publicUser } from './_lib/auth.js';
import { tokenHash, liveLinks } from './_lib/links.js';

// Public: opening a join or reset link. The link token is the only credential.
const find = (d, t) => liveLinks(d).find((l) => l.hash === tokenHash(t));
const GONE = 'This link is invalid, already used, or expired. Ask the developer for a new one.';

export const GET = route(async (req) => {
  const t = new URL(req.url).searchParams.get('t');
  const d = await readUsersDoc();
  const l = t && find(d, t);
  if (!l) throw new HttpError(404, GONE);
  const u = l.kind === 'reset' ? d.users.find((x) => x.email === l.email) : null;
  return json({ kind: l.kind, role: l.role || u?.role || null, label: l.label || '', name: u?.name || '', email: l.email || '' });
});

// Join: { t, name, email, password }. Reset: { t, password }. Signs the person in.
export const POST = route(async (req) => {
  const b = await body(req);
  validPassword(b.password);
  const hash = await hashPassword(b.password);
  const user = await updateUsers((d) => {
    const l = b.t && find(d, b.t);
    if (!l) throw new HttpError(404, GONE);
    d.links = liveLinks(d).filter((x) => x.id !== l.id); // single use
    if (l.kind === 'reset') {
      const u = d.users.find((x) => x.email === l.email);
      if (!u) throw new HttpError(404, GONE);
      Object.assign(u, { hash, v: randomUUID() }); // ends old sessions
      return u;
    }
    const email = normEmail(b.email);
    const name = String(b.name || '').trim().slice(0, 80);
    if (!name) throw new HttpError(400, 'Enter your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email.');
    if (email === adminEmail() || d.users.some((u) => u.email === email)) throw new HttpError(409, 'That email already has an account. Log in instead.');
    const u = { email, name, role: l.role, hash, v: randomUUID(), createdAt: new Date().toISOString(), addedBy: l.createdBy };
    d.users.push(u);
    return u;
  });
  return json({ user: publicUser(user) }, 200, { 'set-cookie': sessionCookie(user) });
});
