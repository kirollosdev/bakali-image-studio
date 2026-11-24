import { route, json, body, HttpError } from './_lib/http.js';
import { requireRole, readUsersDoc, updateUsers, normEmail, adminEmail, findUser } from './_lib/auth.js';
import { newLink, liveLinks, linkUrl } from './_lib/links.js';

// People management, developer only. Nobody is emailed: the developer creates a link
// and shares it however they like. Join links add an editor or viewer; reset links let
// an existing person choose a new password.
const TEAM_ROLES = ['editor', 'viewer'];
const view = (u) => ({ email: u.email, name: u.name, role: u.role, createdAt: u.createdAt || null });
const linkView = (l) => ({ id: l.id, kind: l.kind, role: l.role || null, label: l.label || '', email: l.email || null, expiresAt: l.expiresAt });

function checkRole(role) {
  if (!TEAM_ROLES.includes(role)) throw new HttpError(400, 'Role must be editor or viewer.');
}
function checkTarget(email) {
  if (!email) throw new HttpError(400, 'Email is required.');
  if (email === adminEmail()) throw new HttpError(400, 'The developer account can’t be changed here.');
}

export const GET = route(async (req) => {
  await requireRole(req, 'developer');
  const d = await readUsersDoc();
  const dev = await findUser(adminEmail());
  const users = d.users.filter((u) => u.email !== adminEmail());
  return json({ users: [view(dev), ...users.map(view)], links: liveLinks(d).map(linkView) });
});

// Create a link: { kind: 'join', role, label } or { kind: 'reset', email }.
export const POST = route(async (req) => {
  const me = await requireRole(req, 'developer');
  const b = await body(req);
  let fields;
  if (b.kind === 'join') {
    checkRole(b.role);
    fields = { kind: 'join', role: b.role, label: String(b.label || '').trim().slice(0, 80) };
  } else if (b.kind === 'reset') {
    const email = normEmail(b.email);
    checkTarget(email);
    fields = { kind: 'reset', email };
  } else {
    throw new HttpError(400, 'Unknown link type.');
  }
  const { token, link } = newLink({ ...fields, createdBy: me.email });
  await updateUsers((d) => {
    if (fields.kind === 'reset' && !d.users.some((u) => u.email === fields.email)) throw new HttpError(404, 'Person not found.');
    // Keep one reset link per person; drop expired links while here.
    d.links = liveLinks(d).filter((l) => !(fields.kind === 'reset' && l.kind === 'reset' && l.email === fields.email));
    d.links.push(link);
  });
  return json({ link: linkView(link), url: linkUrl(req, token) }, 201);
});

// Change a person's role.
export const PATCH = route(async (req) => {
  await requireRole(req, 'developer');
  const b = await body(req);
  const email = normEmail(b.email);
  checkTarget(email);
  checkRole(b.role);
  await updateUsers((d) => {
    const u = d.users.find((x) => x.email === email);
    if (!u) throw new HttpError(404, 'Person not found.');
    u.role = b.role;
  });
  return json({ ok: true });
});

// Remove a person { email } or cancel a link { linkId }.
export const DELETE = route(async (req) => {
  await requireRole(req, 'developer');
  const b = await body(req);
  if (b.linkId) {
    await updateUsers((d) => {
      d.links = liveLinks(d).filter((l) => l.id !== b.linkId);
    });
    return json({ ok: true });
  }
  const email = normEmail(b.email);
  checkTarget(email);
  await updateUsers((d) => {
    const before = d.users.length;
    d.users = d.users.filter((u) => u.email !== email);
    if (d.users.length === before) throw new HttpError(404, 'Person not found.');
    d.links = liveLinks(d).filter((l) => l.email !== email);
  });
  return json({ ok: true });
});
