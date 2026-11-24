import { del } from '@vercel/blob';
import { route, json, body, HttpError } from './_lib/http.js';
import { requireRole } from './_lib/auth.js';
import { readJSON, updateJSON } from './_lib/store.js';
import menu from '../src/menu.json' with { type: 'json' };

export const IMAGES_PATH = 'data/images.json';
const ITEM_IDS = new Set(menu.items.map((i) => String(i.id)));

// Paths are only usable through /api/image, which checks the session.
const view = (e) => ({ path: e.path, thumb: e.thumb || e.path, type: e.type, by: e.by, at: e.at });

function checkItem(id) {
  const s = String(id ?? '');
  if (!ITEM_IDS.has(s)) throw new HttpError(400, 'Unknown item.');
  return s;
}

// Map of item id -> { path, thumb, type, size, by, at }.
export const GET = route(async (req) => {
  await requireRole(req, 'viewer');
  const { data } = await readJSON(IMAGES_PATH, {});
  const out = {};
  for (const [id, e] of Object.entries(data)) out[id] = view(e);
  return json({ images: out });
});

// Called after the browser uploaded the files to Blob: point the item at them.
export const POST = route(async (req) => {
  const me = await requireRole(req, 'editor');
  const b = await body(req);
  const id = checkItem(b.id);
  for (const p of [b.path, b.thumb]) {
    if (typeof p !== 'string' || !p.startsWith(`images/${id}/`)) throw new HttpError(400, 'Invalid upload path.');
  }
  const entry = { path: b.path, thumb: b.thumb, type: String(b.type || 'image/jpeg'), by: me.name, at: Date.now() };
  const { result: old } = await updateJSON(IMAGES_PATH, {}, (d) => {
    const prev = d[id];
    d[id] = entry;
    return prev;
  });
  if (old) await del([old.path, old.thumb].filter(Boolean)).catch(() => {});
  return json({ image: view(entry) });
});

export const DELETE = route(async (req) => {
  await requireRole(req, 'editor');
  const id = checkItem((await body(req)).id);
  const { result: old } = await updateJSON(IMAGES_PATH, {}, (d) => {
    const prev = d[id];
    delete d[id];
    return prev;
  });
  if (old) await del([old.path, old.thumb].filter(Boolean)).catch(() => {});
  return json({ ok: true });
});
