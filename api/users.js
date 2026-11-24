import { randomUUID } from 'node:crypto';
import { route, json, body, HttpError } from './_lib/http.js';
import { requireRole, loadUsers, updateUsers, hashPassword, newPassword, normEmail, adminEmail, findUser } from './_lib/auth.js';

// People management: developer only. The developer can add editors and viewers.
const TEAM_ROLES = ['editor', 'viewer'];
const view = (u) => ({ email: u.email, name: u.name, role: u.role, createdAt: u.createdAt, addedBy: u.addedBy || null });

function checkRole(role) {
  if (!TEAM_ROLES.includes(role)) throw new HttpError(400, 'Role must be editor or viewer.');
}
function checkTarget(email) {
  if (!email) throw new HttpError(400, 'Email is required.');
  if (email === adminEmail()) throw new HttpError(400, 'The developer account can’t be changed here.');
}

export const GET = route(async (req) => {
  await requireRole(req, 'developer');
  const dev = await findUser(adminEmail(), true);
  const users = (await loadUsers(true)).filter((u) => u.email !== adminEmail());
  return json({ users: [view({ ...dev, createdAt: null }), ...users.map(view)] });
});

export const POST = route(async (req) => {
  const me = await requireRole(req, 'developer');
  const b = await body(req);
  const email = normEmail(b.email);
  const name = String(b.name || '').trim().slice(0, 80);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email.');
  if (!name) throw new HttpError(400, 'Name is required.');
  checkRole(b.role);
  checkTarget(email);
  const password = newPassword();
  const hash = await hashPassword(password);
  await updateUsers((d) => {
    if (d.users.some((u) => u.email === email)) throw new HttpError(409, 'That email is already on the team.');
    d.users.push({ email, name, role: b.role, hash, v: randomUUID(), createdAt: new Date().toISOString(), addedBy: me.email });
  });
  return json({ user: { email, name, role: b.role }, password }, 201);
});

// Change role and/or reset password.
export const PATCH = route(async (req) => {
  await requireRole(req, 'developer');
  const b = await body(req);
  const email = normEmail(b.email);
  checkTarget(email);
  if (b.role) checkRole(b.role);
  const password = b.resetPassword ? newPassword() : null;
  const hash = password ? await hashPassword(password) : null;
  await updateUsers((d) => {
    const u = d.users.find((x) => x.email === email);
    if (!u) throw new HttpError(404, 'Person not found.');
    if (b.role) u.role = b.role;
    if (hash) Object.assign(u, { hash, v: randomUUID() }); // signs them out everywhere
  });
  return json({ ok: true, ...(password ? { password } : {}) });
});

export const DELETE = route(async (req) => {
  await requireRole(req, 'developer');
  const email = normEmail((await body(req)).email);
  checkTarget(email);
  await updateUsers((d) => {
    const before = d.users.length;
    d.users = d.users.filter((u) => u.email !== email);
    if (d.users.length === before) throw new HttpError(404, 'Person not found.');
  });
  return json({ ok: true });
});
