import { randomUUID } from 'node:crypto';
import { route, json, body, HttpError } from './_lib/http.js';
import { readUsersDoc, updateUsers, hashPassword, validPassword, adminEmail, sessionCookie, publicUser } from './_lib/auth.js';
import { tokenHash, liveLinks } from './_lib/links.js';

// Public: opening a join or reset link. The link token is the only credential.
// The developer sets the name, email and role when creating the link, so the
// person only chooses a password.
const find = (d, t) => liveLinks(d).find((l) => l.hash === tokenHash(t));
const GONE = 'This link is invalid, already used, or expired. Ask the developer for a new one.';

export const GET = route(async (req) => {
  const t = new URL(req.url).searchParams.get('t');
  const d = await readUsersDoc();
  const l = t && find(d, t);
  if (!l) throw new HttpError(404, GONE);
  const u = l.kind === 'reset' ? d.users.find((x) => x.email === l.email) : null;
  return json({ kind: l.kind, role: l.role || u?.role || null, name: l.name || u?.name || '', email: l.email });
});

// { t, password }. Signs the person in.
export const POST = route(async (req) => {
  const b = await body(req);
  validPassword(b.password);
  const hash = await hashPassword(b.password);
  const user = await updateUsers((d) => {
    const l = b.t && find(d, b.t);
    if (!l) throw new HttpError(404, GONE);
    d.links = liveLinks(d).filter((x) => x.id !== l.id); // single use
    const existing = d.users.find((x) => x.email === l.email);
    if (l.kind === 'reset') {
      if (!existing) throw new HttpError(404, GONE);
      Object.assign(existing, { hash, v: randomUUID() }); // ends old sessions
      return existing;
    }
    if (!l.email || !l.name) throw new HttpError(404, GONE);
    if (existing || l.email === adminEmail()) throw new HttpError(409, 'This account already exists. Log in instead.');
    const u = { email: l.email, name: l.name, role: l.role, hash, v: randomUUID(), createdAt: new Date().toISOString(), addedBy: l.createdBy };
    d.users.push(u);
    return u;
  });
  return json({ user: publicUser(user) }, 200, { 'set-cookie': sessionCookie(user) });
});
