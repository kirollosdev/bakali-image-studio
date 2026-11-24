# Bakali Image Studio

A small web app to replace the menu photos of **Bakali El Salam** on Talabat. It lists every menu item with its Talabat photo, title, description and prices. The team uploads the newly designed photo next to each item, then downloads them, one by one or all at once as a zip, named after the Talabat item.

## Features

- Table of all 113 menu items (Arabic and English)
- Upload a new photo per item by click, drag and drop, paste (Ctrl+V) or bulk upload matched by file name
- Download one photo, or all as a zip, named after the Talabat item (Arabic or English)
- Login with three roles:
  - **Developer**: everything, plus managing people
  - **Editor**: upload, replace and remove photos
  - **Viewer**: browse and download only
- Photos and accounts are stored in a private Vercel Blob store

## Stack

Vite + plain JavaScript on the front end, Vercel Functions (`/api`) and Vercel Blob on the back end.

## Settings (Vercel environment variables)

| Name | What it is |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | Added automatically when the Blob store is connected |
| `ADMIN_EMAIL` | The developer's login email |
| `ADMIN_PASSWORD` | The developer's first password (can be changed in the app later) |
| `SESSION_SECRET` | A long random string used to sign logins |

## Scripts

- `npm run dev`: local front end only (Vite)
- `vercel dev`: local front end + API (needs `vercel env pull .env.local`)
- `npm run build`: production build
- `npm run fetch-menu`: refresh `src/menu.json` from the Talabat store page
- `node --env-file=.env.local scripts/upload-seeds.mjs`: one-time import of existing photos from `scripts/seed/`

---

Designed and Developed with ♥ by [Kirollos Magdy](https://kirollosmagdy.com)
