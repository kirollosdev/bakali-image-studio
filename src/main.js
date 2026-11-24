import './style.css';
import data from './menu.json';
import { api, imageUrl, whenSignedOut } from './api.js';

const items = data.items;
const byId = new Map(items.map((it) => [it.id, it]));
const images = new Map(); // id -> { path, thumb, type, by, at }
const busy = new Set(); // ids uploading right now
const rowsById = new Map();
let me = null;
const canEdit = () => me && (me.role === 'editor' || me.role === 'developer');

const $ = (s, el = document) => el.querySelector(s);
const rowsEl = $('#rows');
const NAME_LANG_KEY = 'bis:nameLang';

// ---------- helpers ----------
const money = (n) => (n == null ? '—' : `EGP ${Number(n).toFixed(2)}`);
const talabatThumb = (src, w) => `${src}${src.includes('?') ? '&' : '?'}width=${w}`;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function extOf(type, name = '') {
  if (EXT[type]) return EXT[type];
  const m = /\.([a-z0-9]{2,5})$/i.exec(name);
  return m ? m[1].toLowerCase() : 'jpg';
}

function safeName(s) {
  return s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
}

function fileName(it, type) {
  return `${safeName($('#nameLang').value === 'en' ? it.nameEn : it.nameAr) || it.id}.${extOf(type)}`;
}

// Loose match so "ساندوتش" = "ساندويتش", "أ/إ/ا", "ة/ه", "ى/ي", case and punctuation.
function norm(s) {
  return s
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ساندويتش|سندويتش|سندوتش/g, 'ساندوتش')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function saveFile(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function fetchImage(id) {
  const e = images.get(id);
  const r = await fetch(imageUrl(e.path), { credentials: 'same-origin' });
  if (!r.ok) throw new Error('Could not load the image.');
  return r.blob();
}

let toastTimer;
function toast(msg, ms = 3500) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

function formError(form, msg) {
  const p = $('.form-error', form);
  p.textContent = msg || '';
  p.hidden = !msg;
}

// ---------- table ----------
function rowHTML(raw, i) {
  const it = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === 'string' ? esc(v) : v]));
  const edit = canEdit();
  return `
    <td class="c-num">${i + 1}</td>
    <td class="c-img">
      <button type="button" class="imgbtn" data-view="${it.image}" aria-label="View Talabat image">
        <img src="${talabatThumb(raw.image, 192)}" alt="" width="96" height="64" loading="lazy" decoding="async" />
      </button>
    </td>
    <td class="c-title">
      <span class="cat">${it.catEn} · <bdi>${it.catAr}</bdi></span>
      <strong dir="rtl" lang="ar">${it.nameAr}</strong>
      <span class="en">${it.nameEn}</span>
    </td>
    <td class="c-desc">
      <p dir="rtl" lang="ar">${it.descAr || '—'}</p>
      <p class="en">${it.descEn || ''}</p>
    </td>
    <td class="c-price"><s>${money(it.regular)}</s></td>
    <td class="c-price sale">${money(it.sale)}</td>
    <td class="c-new">
      ${
        edit
          ? `<label class="drop" data-drop="${it.id}" tabindex="0" title="Click to upload · drop a file · hover and press Ctrl+V">
              <input type="file" accept="image/*" data-file="${it.id}" hidden />
              <span class="ph">Click, drop, or hover + Ctrl+V</span>
              <img class="preview" alt="" loading="lazy" decoding="async" hidden />
              <span class="spin" hidden>Uploading…</span>
            </label>
            <div class="row-links">
              <button type="button" class="link" data-paste="${it.id}">Paste</button>
              <button type="button" class="link" data-open="${it.id}" hidden>View</button>
              <button type="button" class="link danger" data-remove="${it.id}" hidden>Remove</button>
            </div>`
          : `<button type="button" class="drop" data-open="${it.id}">
              <span class="ph">No new image yet</span>
              <img class="preview" alt="" loading="lazy" decoding="async" hidden />
            </button>`
      }
      <span class="by"></span>
    </td>
    <td class="c-act">
      <button type="button" class="btn small" data-dl="${it.id}" disabled>Download</button>
    </td>`;
}

function render() {
  rowsEl.textContent = '';
  rowsById.clear();
  const frag = document.createDocumentFragment();
  items.forEach((it, i) => {
    const tr = document.createElement('tr');
    tr.dataset.id = it.id;
    tr.innerHTML = rowHTML(it, i);
    rowsById.set(it.id, tr);
    frag.append(tr);
  });
  rowsEl.append(frag);
  items.forEach((it) => paintRow(it.id));
}

function paintRow(id) {
  const tr = rowsById.get(id);
  if (!tr) return;
  const e = images.get(id);
  const img = $('.preview', tr);
  const isBusy = busy.has(id);
  if (e) {
    const src = imageUrl(e.thumb);
    if (img.getAttribute('src') !== src) img.src = src;
  } else {
    img.removeAttribute('src');
  }
  img.hidden = !e;
  $('.ph', tr).hidden = !!e || isBusy;
  const spin = $('.spin', tr);
  if (spin) spin.hidden = !isBusy;
  tr.classList.toggle('done', !!e);
  tr.classList.toggle('busy', isBusy);
  for (const sel of ['[data-remove]', '.row-links [data-open]']) {
    const b = $(sel, tr);
    if (b) b.hidden = !e || isBusy;
  }
  $('[data-dl]', tr).disabled = !e || isBusy;
  $('.by', tr).textContent = e?.by ? `by ${e.by}` : '';
}

function paintProgress() {
  const done = images.size;
  $('#doneCount').textContent = done;
  $('#leftCount').textContent = items.length - done;
  $('#progressBar').style.width = `${(done / items.length) * 100}%`;
  $('#downloadAll').disabled = done === 0;
}

function applyFilters() {
  const q = norm($('#search').value);
  const cat = $('#category').value;
  const st = $('#status').value;
  let shown = 0;
  for (const it of items) {
    const has = images.has(it.id);
    const ok =
      (!cat || it.catEn === cat) &&
      (!st || (st === 'done' ? has : !has)) &&
      (!q || norm(`${it.nameAr} ${it.nameEn} ${it.descAr} ${it.descEn}`).includes(q));
    rowsById.get(it.id).hidden = !ok;
    if (ok) shown++;
  }
  $('#empty').hidden = shown > 0;
}

const refresh = () => {
  paintProgress();
  applyFilters();
};

// ---------- image actions ----------
// Table previews use a small WebP made in the browser; downloads always use the original.
async function makeThumb(file) {
  try {
    const bmp = await createImageBitmap(file);
    const w = Math.min(480, bmp.width);
    const h = Math.round((bmp.height / bmp.width) * w);
    const c = new OffscreenCanvas(w, h);
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return await c.convertToBlob({ type: 'image/webp', quality: 0.82 });
  } catch {
    return null;
  }
}

async function setImage(id, file) {
  if (!canEdit()) return;
  if (!file || !file.type.startsWith('image/')) return toast('That file is not an image.');
  if (busy.has(id)) return;
  busy.add(id);
  paintRow(id);
  try {
    const { upload } = await import('@vercel/blob/client');
    const opts = { access: 'private', handleUploadUrl: '/api/upload' };
    const ext = extOf(file.type, file.name);
    const thumbBlob = await makeThumb(file);
    const [full, thumb] = await Promise.all([
      upload(`images/${id}/original.${ext}`, file, { ...opts, contentType: file.type }),
      thumbBlob ? upload(`images/${id}/thumb.webp`, thumbBlob, { ...opts, contentType: 'image/webp' }) : null,
    ]);
    const { image } = await api('images', {
      method: 'POST',
      body: { id, path: full.pathname, thumb: thumb ? thumb.pathname : full.pathname, type: file.type },
    });
    images.set(id, image);
    flash(id);
  } catch (e) {
    toast(e.message?.includes('role') ? e.message : `Upload failed: ${e.message || 'try again.'}`, 6000);
  } finally {
    busy.delete(id);
    paintRow(id);
    refresh();
  }
}

async function removeImage(id) {
  const it = byId.get(id);
  if (!confirm(`Remove the new image for "${it.nameAr}"?`)) return;
  busy.add(id);
  paintRow(id);
  try {
    await api('images', { method: 'DELETE', body: { id } });
    images.delete(id);
  } catch (e) {
    toast(e.message, 6000);
  } finally {
    busy.delete(id);
    paintRow(id);
    refresh();
  }
}

async function downloadOne(id, btn) {
  btn.disabled = true;
  try {
    const e = images.get(id);
    saveFile(await fetchImage(id), fileName(byId.get(id), e.type));
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
  }
}

async function downloadAll() {
  if (!images.size) return;
  const btn = $('#downloadAll');
  const label = btn.textContent;
  btn.disabled = true;
  try {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const ids = items.filter((it) => images.has(it.id)).map((it) => it.id);
    let done = 0;
    const queue = [...ids];
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (queue.length) {
          const id = queue.shift();
          const blob = await fetchImage(id);
          zip.file(fileName(byId.get(id), images.get(id).type), blob, { binary: true });
          btn.textContent = `Fetching ${++done}/${ids.length}…`;
        }
      }),
    );
    btn.textContent = 'Zipping…';
    // Images are already compressed, so STORE is much faster with the same size.
    const out = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    saveFile(out, `${safeName(data.store.name)} - new images (${ids.length}).zip`);
  } catch (e) {
    toast(`Download failed: ${e.message}`, 6000);
  } finally {
    btn.textContent = label;
    btn.disabled = images.size === 0;
  }
}

function openViewer(src) {
  const v = $('#viewer');
  $('img', v).src = src;
  v.showModal();
}

// ---------- table events ----------
rowsEl.addEventListener('change', (e) => {
  const id = e.target.dataset.file;
  if (id) setImage(Number(id), e.target.files[0]).finally(() => (e.target.value = ''));
});

rowsEl.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.view) openViewer(t.dataset.view);
  else if (t.dataset.open && images.has(Number(t.dataset.open))) openViewer(imageUrl(images.get(Number(t.dataset.open)).path));
  else if (t.dataset.paste) pasteFromClipboard(Number(t.dataset.paste));
  else if (t.dataset.remove) removeImage(Number(t.dataset.remove));
  else if (t.dataset.dl) downloadOne(Number(t.dataset.dl), t);
});

rowsEl.addEventListener('dragover', (e) => {
  const z = e.target.closest('label[data-drop]');
  if (!z) return;
  e.preventDefault();
  z.classList.add('over');
});
rowsEl.addEventListener('dragleave', (e) => e.target.closest('[data-drop]')?.classList.remove('over'));
rowsEl.addEventListener('drop', (e) => {
  const z = e.target.closest('label[data-drop]');
  if (!z) return;
  e.preventDefault();
  z.classList.remove('over');
  setImage(Number(z.dataset.drop), e.dataTransfer.files[0]);
});
// A file dropped outside a New image box is ignored instead of opening in the tab.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  if (!e.target.closest('[data-drop]')) e.preventDefault();
});

// ---------- paste ----------
// Ctrl+V goes to the box under the mouse, or else the focused box.
let hoverId = null;
rowsEl.addEventListener('pointerover', (e) => {
  const z = e.target.closest('label[data-drop]');
  hoverId = z ? Number(z.dataset.drop) : null;
});
rowsEl.addEventListener('pointerleave', () => (hoverId = null));

function flash(id) {
  const z = $('.drop', rowsById.get(id));
  z?.classList.add('pasted');
  setTimeout(() => z?.classList.remove('pasted'), 700);
}

window.addEventListener('paste', (e) => {
  if (!canEdit() || document.querySelector('dialog[open]')) return;
  const focused = document.activeElement?.closest?.('label[data-drop]');
  const id = hoverId ?? (focused ? Number(focused.dataset.drop) : null);
  if (id == null) {
    if (!e.target.closest?.('input, textarea')) toast('Hover over an item’s New image box, then press Ctrl+V.');
    return;
  }
  const file = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))?.getAsFile();
  if (!file) return toast('The clipboard has no image. Copy the image itself, not its file or link.');
  e.preventDefault();
  setImage(id, file);
});

async function pasteFromClipboard(id) {
  if (!navigator.clipboard?.read) return toast('This browser blocks the Paste button. Hover the box and press Ctrl+V instead.');
  try {
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (!type) continue;
      const blob = await item.getType(type);
      return setImage(id, new File([blob], `pasted.${EXT[type] || 'png'}`, { type }));
    }
    toast('The clipboard has no image. Copy the image itself, not its file or link.');
  } catch {
    toast('Clipboard access was blocked. Allow it, or hover the box and press Ctrl+V.');
  }
}

// ---------- toolbar ----------
$('#downloadAll').addEventListener('click', downloadAll);
let searchTimer;
$('#search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applyFilters, 120);
});
$('#category').addEventListener('change', applyFilters);
$('#status').addEventListener('change', applyFilters);
$('#nameLang').addEventListener('change', (e) => {
  try { localStorage.setItem(NAME_LANG_KEY, e.target.value); } catch {}
});

// ---------- dialogs ----------
document.addEventListener('click', (e) => {
  const d = e.target.closest('dialog');
  if (d && (e.target.matches('[data-close]') || e.target === d)) d.close();
});

// Login
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const btn = $('button[type=submit]', f);
  formError(f);
  btn.disabled = true;
  try {
    const { user } = await api('session', { method: 'POST', body: { email: f.elements.email.value, password: f.elements.password.value } });
    f.reset();
    await enter(user);
  } catch (err) {
    formError(f, err.message);
  } finally {
    btn.disabled = false;
  }
});

$('#logout').addEventListener('click', async () => {
  await api('session', { method: 'DELETE' }).catch(() => {});
  showLogin();
});

// Change password
$('#openPassword').addEventListener('click', () => {
  formError($('#passwordForm'));
  $('#passwordForm').reset();
  $('#password').showModal();
});
$('#passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  if (f.elements.next.value !== f.elements.again.value) return formError(f, 'The new passwords don’t match.');
  if (f.elements.next.value.length < 8) return formError(f, 'Use at least 8 characters.');
  try {
    await api('password', { method: 'POST', body: { current: f.elements.current.value, next: f.elements.next.value } });
    $('#password').close();
    toast('Password changed.');
  } catch (err) {
    formError(f, err.message);
  }
});

// People
const ROLE_LABEL = { developer: 'Developer', editor: 'Editor', viewer: 'Viewer' };

function issued(title, note, url) {
  $('#issuedTitle').textContent = title;
  $('#issuedNote').textContent = note;
  $('#issuedText').textContent = url;
  $('#issued').hidden = false;
  $('#issued').scrollIntoView({ block: 'nearest' });
}
$('#copyIssued').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#issuedText').textContent);
    toast('Link copied.');
  } catch {
    toast('Copy failed. Select the link and copy it.');
  }
});

const until = (ts) => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

function renderLinks(links, users) {
  const name = (email) => users.find((u) => u.email === email)?.name || email;
  $('#linkRows').innerHTML = links.length
    ? links
        .map(
          (l) => `<tr data-link="${esc(l.id)}">
            <td>${l.kind === 'join' ? `Invite · ${ROLE_LABEL[l.role]}` : 'Password reset'}</td>
            <td>${esc(l.kind === 'join' ? l.label || '—' : name(l.email))}</td>
            <td>${until(l.expiresAt)}</td>
            <td class="actions"><button type="button" class="link danger" data-cancel>Cancel link</button></td>
          </tr>`,
        )
        .join('')
    : '<tr><td colspan="4" class="muted">No open links.</td></tr>';
}

async function loadPeople() {
  const tb = $('#peopleRows');
  tb.innerHTML = '<tr><td colspan="4" class="muted">Loading…</td></tr>';
  $('#linkRows').innerHTML = '';
  try {
    const { users, links } = await api('users');
    renderLinks(links, users);
    tb.innerHTML = users
      .map((u) =>
        u.role === 'developer'
          ? `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td><span class="role">Developer</span></td><td class="muted">You</td></tr>`
          : `<tr data-email="${esc(u.email)}">
              <td>${esc(u.name)}</td>
              <td>${esc(u.email)}</td>
              <td><select data-role aria-label="Role for ${esc(u.name)}">
                ${['editor', 'viewer'].map((r) => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}
              </select></td>
              <td class="actions">
                <button type="button" class="link" data-reset>Reset password link</button>
                <button type="button" class="link danger" data-del>Remove</button>
              </td>
            </tr>`,
      )
      .join('');
  } catch (err) {
    tb.innerHTML = `<tr><td colspan="4" class="form-error">${esc(err.message)}</td></tr>`;
  }
}

$('#openPeople').addEventListener('click', () => {
  $('#issued').hidden = true;
  formError($('#addForm'));
  $('#people').showModal();
  loadPeople();
});

$('#peopleRows').addEventListener('change', async (e) => {
  if (!e.target.matches('[data-role]')) return;
  const email = e.target.closest('tr').dataset.email;
  try {
    await api('users', { method: 'PATCH', body: { email, role: e.target.value } });
    toast(`Role changed to ${ROLE_LABEL[e.target.value]}.`);
  } catch (err) {
    toast(err.message, 6000);
    loadPeople();
  }
});

$('#peopleRows').addEventListener('click', async (e) => {
  const tr = e.target.closest('tr[data-email]');
  if (!tr) return;
  const email = tr.dataset.email;
  const name = tr.cells[0].textContent;
  try {
    if (e.target.matches('[data-reset]')) {
      const { url } = await api('users', { method: 'POST', body: { kind: 'reset', email } });
      issued(`Password reset link for ${name}`, 'Send it to them. They open it and choose a new password. It works once and expires in 7 days.', url);
      loadPeople();
    } else if (e.target.matches('[data-del]')) {
      if (!confirm(`Remove ${name}? They lose access right away.`)) return;
      await api('users', { method: 'DELETE', body: { email } });
      toast(`${name} removed.`);
      loadPeople();
    }
  } catch (err) {
    toast(err.message, 6000);
  }
});

$('#linkRows').addEventListener('click', async (e) => {
  const tr = e.target.closest('tr[data-link]');
  if (!tr || !e.target.matches('[data-cancel]')) return;
  try {
    await api('users', { method: 'DELETE', body: { linkId: tr.dataset.link } });
    toast('Link cancelled. It no longer works.');
    loadPeople();
  } catch (err) {
    toast(err.message, 6000);
  }
});

$('#addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  formError(f);
  try {
    const role = f.elements.role.value;
    const label = f.elements.label.value.trim();
    const { url } = await api('users', { method: 'POST', body: { kind: 'join', role, label } });
    f.reset();
    issued(
      `${ROLE_LABEL[role]} invite link${label ? ` for ${label}` : ''}`,
      'Send it to them however you like. They open it and create their own account. It works once and expires in 7 days.',
      url,
    );
    loadPeople();
  } catch (err) {
    formError(f, err.message);
  }
});

// ---------- join / reset links ----------
const linkToken = new URLSearchParams(location.search).get('link');
let linkKind = null;

async function showLinkForm() {
  const f = $('#joinForm');
  $('#loginForm').hidden = true;
  f.hidden = false;
  $('#login').hidden = false;
  $('#app').hidden = true;
  document.body.classList.remove('booting');
  try {
    const l = await api(`join?t=${encodeURIComponent(linkToken)}`);
    linkKind = l.kind;
    $('.join-only', f).hidden = l.kind !== 'join';
    for (const n of ['name', 'email']) f.elements[n].disabled = l.kind !== 'join';
    if (l.kind === 'join') {
      $('#joinIntro').textContent = `You're invited as ${ROLE_LABEL[l.role]}. Create your account.`;
      $('#pwLabel').textContent = 'Choose a password';
      $('#joinBtn').textContent = 'Create my account';
      f.elements.name.focus();
    } else {
      $('#joinIntro').textContent = `Choose a new password for ${l.name || l.email}.`;
      $('#pwLabel').textContent = 'New password';
      $('#joinBtn').textContent = 'Save password';
      f.elements.password.focus();
    }
  } catch (err) {
    $('#joinIntro').textContent = err.message;
    for (const el of f.querySelectorAll('label, #joinBtn')) el.hidden = true;
  }
}

$('#joinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  formError(f);
  const pw = f.elements.password.value;
  if (pw.length < 8) return formError(f, 'Use at least 8 characters.');
  if (pw !== f.elements.again.value) return formError(f, 'The passwords don’t match.');
  const btn = $('#joinBtn');
  btn.disabled = true;
  try {
    const payload = { t: linkToken, password: pw };
    if (linkKind === 'join') Object.assign(payload, { name: f.elements.name.value, email: f.elements.email.value });
    const { user } = await api('join', { method: 'POST', body: payload });
    history.replaceState(null, '', location.pathname);
    f.reset();
    f.hidden = true;
    $('#loginForm').hidden = false;
    await enter(user);
    toast(linkKind === 'join' ? `Welcome, ${user.name}!` : 'Password saved.');
  } catch (err) {
    formError(f, err.message);
  } finally {
    btn.disabled = false;
  }
});

// ---------- session ----------
function showLogin() {
  me = null;
  images.clear();
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  $('#app').hidden = true;
  $('#login').hidden = false;
  document.body.classList.remove('booting');
  $("#loginForm").elements.email.focus();
}
whenSignedOut(showLogin);

async function enter(user) {
  me = user;
  document.body.dataset.role = user.role;
  $('#meName').textContent = user.name;
  $('#meInitial').textContent = (user.name || '?').trim().charAt(0).toUpperCase();
  $('#meRole').textContent = ROLE_LABEL[user.role];
  $('#login').hidden = true;
  $('#app').hidden = false;
  document.body.classList.remove('booting');
  render();
  refresh();
  try {
    const { images: map } = await api('images');
    images.clear();
    for (const [id, e] of Object.entries(map)) if (byId.has(Number(id))) images.set(Number(id), e);
    items.forEach((it) => paintRow(it.id));
    refresh();
  } catch (err) {
    if (err.status !== 401) toast(`Could not load images: ${err.message}`, 8000);
  }
}

// ---------- boot ----------
$('#storeName').textContent = data.store.name;
$('#storeLink').href = data.store.url;
$('#totalCount').textContent = items.length;
try { $('#nameLang').value = localStorage.getItem(NAME_LANG_KEY) || 'ar'; } catch {}
const cats = [...new Map(items.map((it) => [it.catEn, it.catAr])).entries()];
$('#category').insertAdjacentHTML(
  'beforeend',
  cats.map(([en, ar]) => `<option value="${esc(en)}">${esc(en)} · ${esc(ar)} (${items.filter((i) => i.catEn === en).length})</option>`).join(''),
);

if (linkToken) {
  showLinkForm();
} else {
  api('session')
    .then(({ user }) => enter(user))
    .catch(showLogin);
}
