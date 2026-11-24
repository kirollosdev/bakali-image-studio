// Small fetch wrapper for the /api routes. A 401 means the session ended.
let onSignedOut = () => {};
export const whenSignedOut = (fn) => (onSignedOut = fn);

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (res.status === 401 && path !== 'session') onSignedOut();
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const imageUrl = (path) => `/api/image?p=${encodeURIComponent(path)}`;
