// HM4 Albüm — Photoshop eklentisi (UXP)
// Sitedeki albüm panelinden gönderilen fotoğrafları açar; ⌘S ile kaydedilince yeni hali siteye yükler.
const { app, core, action, imaging } = require('photoshop');
const uxp = require('uxp');
const lfs = uxp.storage.localFileSystem;
const formats = uxp.storage.formats;

let SITE = 'https://www.hm4studio.com';
let TOKEN = '';
const jobs = new Map(); // id → { id, couple, name, path, entry, state, msg }
let pollTimer = null;
let busy = false;

const $ = (id) => document.getElementById(id);
try { TOKEN = localStorage.getItem('hm4_token') || ''; } catch (e) { TOKEN = ''; }

async function loadConfig() {
  try {
    const folder = await lfs.getPluginFolder();
    const f = await folder.getEntry('config.json');
    const cfg = JSON.parse(await f.read());
    if (cfg.site) SITE = String(cfg.site).replace(/\/$/, '');
  } catch (e) { /* varsayılan adres */ }
}

function setConn(kind, text) {
  $('conn').className = `conn ${kind}`;
  $('connText').textContent = text;
}
const showSetup = (on) => { $('setup').className = on ? 'setup' : 'setup hidden'; };

async function api(path, opts = {}) {
  const r = await fetch(SITE + path, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${TOKEN}` } });
  if (r.status === 401) { const err = new Error('Bağlantı kodu geçersiz'); err.auth = true; throw err; }
  if (!r.ok) throw new Error(`Sunucu hatası (${r.status})`);
  return r;
}

// ── Base64 → bayt (UXP'de atob olmayabilir) ──
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64ToBytes(s) {
  s = String(s).replace(/^data:[^,]*,/, '').replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor(s.length * 3 / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const a = B64.indexOf(s[i]), b = B64.indexOf(s[i + 1]), c = B64.indexOf(s[i + 2]), d = B64.indexOf(s[i + 3]);
    const n = (a << 18) | (b << 12) | ((c & 63) << 6) | (d & 63);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (c >= 0 && o < out.length) out[o++] = (n >> 8) & 255;
    if (d >= 0 && o < out.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

function bytesToB64(u8) {
  let out = '';
  for (let i = 0; i < u8.length; i += 3) {
    const n = (u8[i] << 16) | ((u8[i + 1] || 0) << 8) | (u8[i + 2] || 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < u8.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < u8.length ? B64[n & 63] : '=');
  }
  return out;
}
// Kartın küçük fotoğrafı (bir kez indirilir)
async function loadThumb(j) {
  if (j.thumb || j.thumbTried) return;
  j.thumbTried = true;
  try {
    const r = await api(`/api/ps/isler/${j.id}/kucuk`);
    j.thumb = `data:image/jpeg;base64,${bytesToB64(new Uint8Array(await r.arrayBuffer()))}`;
    render();
  } catch (e) { /* küçük fotoğraf olmadan da çalışır */ }
}

// ── İş listesi ──
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
function render() {
  const box = $('jobs');
  box.innerHTML = '';
  const list = [...jobs.values()].sort((a, b) => b.id - a.id).slice(0, 12);
  $('count').textContent = list.length ? String(list.length) : '';
  if (!list.length) {
    const e = el('div', 'empty');
    const im = el('img'); im.src = 'icons/logo.png'; im.alt = '';
    e.appendChild(im); e.appendChild(el('div', '', 'Bekleyen fotoğraf yok.')); e.appendChild(el('div', '', 'Albüm panelinden gönderdiğiniz fotoğraflar burada görünür.'));
    box.appendChild(e); return;
  }
  for (const j of list) {
    const kind = j.state === 'done' ? 'done' : j.state === 'err' ? 'err' : j.state === 'closed' ? 'idle' : 'active';
    const d = el('div', `job ${kind}`);
    const ph = el('div', 'ph');
    if (j.thumb) { const im = el('img'); im.src = j.thumb; im.alt = ''; ph.appendChild(im); }
    d.appendChild(ph);
    const tx = el('div', 'tx');
    tx.appendChild(el('div', 'n', j.couple));
    tx.appendChild(el('div', 'm', j.name));
    const s = el('div', 's'); s.appendChild(el('b')); s.appendChild(el('span', '', j.msg)); tx.appendChild(s);
    if (j.state === 'closed' || j.state === 'err') {
      const b = el('div', 'btn', 'Yeniden aç');
      b.addEventListener('click', () => openJob(j, true));
      tx.appendChild(b);
    }
    d.appendChild(tx);
    box.appendChild(d);
    loadThumb(j);
  }
}

async function jobsFolder() {
  const data = await lfs.getDataFolder();
  try { return await data.getEntry('isler'); } catch (e) { return data.createFolder('isler'); }
}

async function openJob(j, again) {
  try {
    j.state = 'opening'; j.msg = 'Açılıyor…'; render();
    if (!j.entry || again) {
      const r = await api(`/api/ps/isler/${j.id}/dosya`);
      const size = Number(r.headers.get('content-length')) || 0;
      j.msg = size ? `İndiriliyor… (${(size / 1048576).toFixed(1)} MB)` : 'İndiriliyor…'; render();
      const buf = await r.arrayBuffer();
      j.msg = 'Açılıyor…'; render();
      const folder = await jobsFolder();
      const safe = j.name.replace(/[^\w.\-]+/g, '_');
      j.entry = await folder.createFile(`${j.id}-${safe}`, { overwrite: true });
      await j.entry.write(buf, { format: formats.binary });
      j.path = j.entry.nativePath;
    }
    await core.executeAsModal(async () => { await app.open(j.entry); }, { commandName: 'HM4: fotoğrafı aç' });
    await api(`/api/ps/isler/${j.id}/acildi`, { method: 'POST' });
    j.state = 'open'; j.msg = "Photoshop'ta açık · ⌘S ile kaydedin";
  } catch (e) {
    j.state = 'err'; j.msg = `Açılamadı: ${e.message}`;
  }
  render();
}

async function poll() {
  if (!TOKEN || busy) return;
  try {
    const r = await api('/api/ps/isler');
    const data = await r.json();
    setConn('ok', `${SITE.replace(/^https?:\/\/(www\.)?/, '')} adresine bağlı`);
    showSetup(false);
    for (const x of data.jobs) {
      if (jobs.has(x.id)) continue;
      const j = { id: x.id, couple: x.couple, name: x.name, state: 'new', msg: '' };
      jobs.set(x.id, j);
      if (x.status === 'bekliyor') { busy = true; await openJob(j); busy = false; }
      else { j.state = 'closed'; j.msg = 'Önceden gönderilmiş · yeniden açabilirsiniz'; render(); }
    }
  } catch (e) {
    busy = false;
    if (e.auth) { setConn('err', 'Bağlantı kodu geçersiz'); showSetup(true); }
    else setConn('err', 'Siteye ulaşılamıyor; yeniden deneniyor…');
  }
}

// ── Kaydetme: açık işin belgesi kaydedilince yeni hali yükle ──
const samePath = (a, b) => a && b && String(a).replace(/\\/g, '/').toLowerCase() === String(b).replace(/\\/g, '/').toLowerCase();
function jobForDoc(doc) {
  if (!doc) return null;
  let p = '';
  try { p = doc.path; } catch (e) { p = ''; }
  for (const j of jobs.values()) if (j.path && samePath(j.path, p)) return j;
  return null;
}

async function upload(j, doc) {
  j.state = 'uploading'; j.msg = 'Siteye yükleniyor…'; render();
  try {
    let thumb, display, original;
    await core.executeAsModal(async () => {
      const W = doc.width, H = doc.height;
      const enc = async (edge) => {
        const k = Math.min(1, edge / Math.max(W, H));
        const px = await imaging.getPixels({ documentID: doc.id, targetSize: { width: Math.max(1, Math.round(W * k)), height: Math.max(1, Math.round(H * k)) }, componentSize: 8, applyAlpha: true, colorSpace: 'RGB' });
        const b64 = await imaging.encodeImageData({ imageData: px.imageData, base64: true });
        px.imageData.dispose();
        return b64ToBytes(b64);
      };
      display = await enc(2400);
      thumb = await enc(900);
      // Orijinal: JPG olarak kaydedildiyse dosyanın kendisi, değilse tam boy JPEG
      if (/\.jpe?g$/i.test(String(doc.path || '')) && samePath(doc.path, j.path)) original = new Uint8Array(await j.entry.read({ format: formats.binary }));
      else original = await enc(Math.max(W, H));
    }, { commandName: 'HM4: siteye hazırla' });
    j.msg = `Siteye yükleniyor… (${((thumb.length + display.length + original.length) / 1048576).toFixed(1)} MB)`; render();
    const body = new Uint8Array(thumb.length + display.length + original.length);
    body.set(thumb, 0); body.set(display, thumb.length); body.set(original, thumb.length + display.length);
    await api(`/api/ps/isler/${j.id}/yukle`, {
      method: 'POST', body: body.buffer,
      headers: { 'Content-Type': 'application/octet-stream', 'X-Parts': `thumb:${thumb.length},display:${display.length},original:${original.length}` },
    });
    const t = new Date();
    j.state = 'done'; j.msg = `✓ Siteye yüklendi · ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  } catch (e) {
    j.state = 'err'; j.msg = `Yüklenemedi: ${e.message}. ⌘S ile tekrar deneyin.`;
  }
  render();
}

action.addNotificationListener(['save'], async () => {
  const doc = app.activeDocument;
  const j = jobForDoc(doc);
  if (j) await upload(j, doc);
});
action.addNotificationListener(['close'], async () => {
  const open = new Set();
  try { app.documents.forEach((d) => { try { open.add(String(d.path).toLowerCase()); } catch (e) { /* kaydedilmemiş belge */ } }); } catch (e) { /* belge yok */ }
  for (const j of jobs.values()) {
    if ((j.state === 'open' || j.state === 'opening') && j.path && !open.has(String(j.path).replace(/\\/g, '/').toLowerCase()) && !open.has(String(j.path).toLowerCase())) {
      j.state = 'closed'; j.msg = 'Kaydetmeden kapatıldı';
      try { await api(`/api/ps/isler/${j.id}/iptal`, { method: 'POST' }); } catch (e) { /* önemli değil */ }
    } else if (j.state === 'done' && j.path && !open.has(String(j.path).toLowerCase())) {
      j.msg = j.msg.replace(' · kapatıldı', '') + ' · kapatıldı';
    }
  }
  render();
});

$('save').addEventListener('click', () => {
  TOKEN = $('token').value.trim();
  try { localStorage.setItem('hm4_token', TOKEN); } catch (e) { /* saklanamadı */ }
  setConn('', 'Bağlanılıyor…');
  poll();
});
$('reset').addEventListener('click', () => { showSetup(true); $('token').value = ''; });

(async () => {
  await loadConfig();
  render();
  if (!TOKEN) { setConn('err', 'Bağlantı kodu girilmedi'); showSetup(true); }
  poll();
  pollTimer = setInterval(poll, 1500);
})();
