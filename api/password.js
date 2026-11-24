import { randomUUID } from 'node:crypto';
import { route, json, body, HttpError } from './_lib/http.js';
import { requireRole, verifyLogin, hashPassword, validPassword, updateUsers, sessionCookie, adminEmail } from './_lib/auth.js';

// Any signed-in person changes their own password.
export const POST = route(async (req) => {
  const me = await requireRole(req, 'viewer');
  const { current, next } = await body(req);
  if (!(await verifyLogin(me.email, current))) throw new HttpError(400, 'Your current password is wrong.');
  validPassword(next);
  const hash = await hashPassword(next);
  const v = randomUUID();
  await updateUsers((d) => {
    let rec = d.users.find((u) => u.email === me.email);
    if (!rec && me.email === adminEmail()) {
      rec = { email: me.email, name: me.name, role: 'developer', createdAt: new Date().toISOString() };
      d.users.push(rec);
    }
    if (!rec) throw new HttpError(404, 'Account not found.');
    Object.assign(rec, { hash, v });
  });
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie({ email: me.email, v }) });
});
