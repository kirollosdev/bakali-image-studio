import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readJSON, updateJSON } from './store.js';
import { HttpError } from './http.js';

const scrypt = promisify(scryptCb);
export const USERS_PATH = 'data/users.json';
export const ROLES = { viewer: 1, editor: 2, developer: 3 };
const COOKIE = 'bis_session';
const SESSION_DAYS = 7;

const env = (k) => {
  const v = process.env[k];
  if (!v) throw new HttpError(500, `Server is missing the ${k} setting.`);
  return v;
};
export const adminEmail = () => env('ADMIN_EMAIL').trim().toLowerCase();
export const normEmail = (e) => String(e || '').trim().toLowerCase();

// ---------- passwords ----------
export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 32);
  return `${salt.toString('base64url')}.${key.toString('base64url')}`;
}

async function checkHash(pw, stored) {
  const [s, k] = String(stored || '').split('.');
  if (!s || !k) return false;
  const want = Buffer.from(k, 'base64url');
  const got = await scrypt(pw, Buffer.from(s, 'base64url'), want.length);
  return timingSafeEqual(got, want);
}

function sameText(a, b) {
  const x = createHmac('sha256', 'cmp').update(String(a)).digest();
  const y = createHmac('sha256', 'cmp').update(String(b)).digest();
  return timingSafeEqual(x, y);
}

export function validPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  if (pw.length > 200) throw new HttpError(400, 'Password is too long.');
}

// ---------- users ----------
// The developer account comes from ADMIN_EMAIL / ADMIN_PASSWORD; a record for it is stored
// only after the developer changes their password in the app.
// data/users.json holds { users: [...], links: [...] }.
const EMPTY = { users: [], links: [] };
let cache = { at: 0, users: null };
export async function readUsersDoc() {
  const { data } = await readJSON(USERS_PATH, EMPTY);
  data.users ??= [];
  data.links ??= [];
  cache = { at: Date.now(), users: data.users };
  return data;
}
export async function loadUsers(fresh = false) {
  if (!fresh && cache.users && Date.now() - cache.at < 10_000) return cache.users;
  return (await readUsersDoc()).users;
}
export const updateUsers = async (fn) => {
  const { data, result } = await updateJSON(USERS_PATH, EMPTY, (d) => {
    d.users ??= [];
    d.links ??= [];
    return fn(d);
  });
  cache = { at: Date.now(), users: data.users };
  return result;
};

export async function findUser(email, fresh = false) {
  const e = normEmail(email);
  const users = await loadUsers(fresh);
  const rec = users.find((u) => u.email === e);
  if (e === adminEmail()) {
    return { email: e, name: rec?.name || 'Developer', role: 'developer', hash: rec?.hash || null, v: rec?.v || 'env' };
  }
  return rec || null;
}

export async function verifyLogin(email, password) {
  const u = await findUser(email, true);
  if (!u || typeof password !== 'string') return null;
  const ok = u.role === 'developer' && !u.hash ? sameText(password, env('ADMIN_PASSWORD')) : await checkHash(password, u.hash);
  return ok ? u : null;
}

// ---------- sessions ----------
const sign = (data) => createHmac('sha256', env('SESSION_SECRET')).update(data).digest('base64url');

export function sessionCookie(user) {
  const payload = Buffer.from(JSON.stringify({ e: user.email, v: user.v, x: Date.now() + SESSION_DAYS * 864e5 })).toString('base64url');
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

function readCookie(req) {
  const raw = req.headers.get('cookie') || '';
  const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}

// Returns the signed-in user, or null. Removing a user or resetting their password
// changes their `v`, which ends existing sessions.
export async function currentUser(req) {
  const token = readCookie(req);
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !sameText(sig, sign(payload))) return null;
  let s;
  try {
    s = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return null;
  }
  if (!s.x || s.x < Date.now()) return null;
  const u = await findUser(s.e);
  if (!u || u.v !== s.v) return null;
  return u;
}

export async function requireRole(req, role) {
  const u = await currentUser(req);
  if (!u) throw new HttpError(401, 'Please log in.');
  if (ROLES[u.role] < ROLES[role]) throw new HttpError(403, 'Your role does not allow this.');
  return u;
}

export const publicUser = (u) => ({ email: u.email, name: u.name, role: u.role });
