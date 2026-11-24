import { handleUpload } from '@vercel/blob/client';
import { route, json, body, HttpError } from './_lib/http.js';
import { requireRole } from './_lib/auth.js';
import menu from '../src/menu.json' with { type: 'json' };

const ITEM_IDS = new Set(menu.items.map((i) => String(i.id)));

// Issues short-lived tokens so the browser uploads straight to Blob
// (skips the 4.5 MB request limit of functions). Editors and the developer only.
export const POST = route(async (req) => {
  await requireRole(req, 'editor');
  const result = await handleUpload({
    request: req,
    body: await body(req),
    onBeforeGenerateToken: async (pathname) => {
      const m = /^images\/(\d+)\/[\w.-]+$/.exec(pathname);
      if (!m || !ITEM_IDS.has(m[1])) throw new HttpError(400, 'Invalid upload path.');
      return {
        allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'],
        maximumSizeInBytes: 30 * 1024 * 1024,
        addRandomSuffix: true,
        validUntil: Date.now() + 10 * 60_000,
      };
    },
  });
  return json(result);
});
