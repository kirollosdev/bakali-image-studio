import { route, json, body, HttpError } from './_lib/http.js';
import { currentUser, verifyLogin, sessionCookie, clearCookie, publicUser } from './_lib/auth.js';

const fails = new Map(); // email -> { n, until } (per instance; slows down guessing)

export const GET = route(async (req) => {
  const u = await currentUser(req);
  return u ? json({ user: publicUser(u) }) : json({ user: null }, 401);
});

export const POST = route(async (req) => {
  const { email, password } = await body(req);
  const key = String(email || '').trim().toLowerCase();
  const f = fails.get(key);
  if (f && f.until > Date.now()) throw new HttpError(429, 'Too many tries. Wait a minute and try again.');

  const u = await verifyLogin(email, password);
  if (!u) {
    const n = (f?.n || 0) + 1;
    fails.set(key, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
    await new Promise((r) => setTimeout(r, 400));
    throw new HttpError(401, 'Wrong email or password.');
  }
  fails.delete(key);
  return json({ user: publicUser(u) }, 200, { 'set-cookie': sessionCookie(u) });
});

export const DELETE = route(async () => json({ ok: true }, 200, { 'set-cookie': clearCookie() }));
