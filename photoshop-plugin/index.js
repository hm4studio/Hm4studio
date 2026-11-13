// HM4 Albüm — Photoshop eklentisi (UXP)
// Sitedeki albüm panelinden gönderilen fotoğrafları açar; ⌘S ile kaydedilince yeni hali siteye yükler.
const { app, core, action, imaging, constants } = require('photoshop');
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
    if (j.state === 'open' || (j.state === 'done' && docForJob(j))) {
      const acts = el('div', 'acts');
      const chip = (label, cls, fn) => { const c = el('span', `chip${cls ? ` ${cls}` : ''}`, label); c.addEventListener('click', fn); acts.appendChild(c); };
      chip('Cilt · Hafif', autoRun === 'cilt:hafif' ? 'auto' : '', () => skinSmooth(j, 'hafif'));
      chip('Orta', autoRun === 'cilt:orta' ? 'auto' : '', () => skinSmooth(j, 'orta'));
      chip('Güçlü', autoRun === 'cilt:guclu' ? 'auto' : '', () => skinSmooth(j, 'guclu'));
      favActs.forEach((id) => chip(id.split('\u241f')[1], autoRun === id ? 'auto' : '', () => runAction(j, id)));
      tx.appendChild(acts);
      const send = el('div', 'btn solid', 'Siteye gönder');
      send.addEventListener('click', () => { const d = docForJob(j); if (d) upload(j, d); });
      tx.appendChild(send);
    }
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
    j.state = 'open'; j.msg = "Photoshop'ta açık · bitince Siteye gönder";
    render();
    await runAuto(j);
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

// Belgenin JPEG kopyası (kalite 12, renk profili gömülü) → bayt
async function saveJpegCopy(doc, j) {
  try {
    const folder = await jobsFolder();
    const f = await folder.createFile(`${j.id}-gonder.jpg`, { overwrite: true });
    const token = lfs.createSessionToken(f);
    await bp([{
      _obj: 'save', as: { _obj: 'JPEG', extendedQuality: 12, matteColor: { _enum: 'matteColor', _value: 'none' } },
      in: { _path: token, _kind: 'local' }, documentID: doc.id, copy: true, lowerCase: true, embedProfiles: true, saveStage: { _enum: 'saveStageType', _value: 'saveBegin' },
    }]);
    const out = new Uint8Array(await f.read({ format: formats.binary }));
    return out.length > 1000 && out[0] === 0xff && out[1] === 0xd8 ? out : null;
  } catch (e) { return null; }
}

// ── Rötuş: cilt yumuşatma ve kendi eylemleriniz ──
// Doğal görünüm: küçük yarıçap, düşük opaklık; ince doku (gözenek) korunur
const STRENGTH = { hafif: { div: 1000, op: 45, label: 'Hafif' }, orta: { div: 800, op: 60, label: 'Orta' }, guclu: { div: 650, op: 75, label: 'Güçlü' } };
const docForJob = (j) => { try { return app.documents.find((d) => { try { return samePath(d.path, j.path); } catch (e) { return false; } }); } catch (e) { return null; } };
// batchPlay hata fırlatmaz, sonuçta { _obj: 'error' } döner: burada hataya çevrilir
async function bp(list) {
  const res = await action.batchPlay(list, { synchronousExecution: true });
  const bad = (res || []).find((r) => r && r._obj === 'error');
  if (bad) throw new Error(bad.message || 'Photoshop komutu çalışmadı');
  return res;
}

async function skinSmooth(j, level) {
  const doc = docForJob(j); if (!doc) { j.msg = 'Belge açık değil'; render(); return; }
  const st = STRENGTH[level] || STRENGTH.orta;
  const prev = j.msg; j.msg = `Cilt yumuşatılıyor (${st.label})…`; render();
  let skinFound = false;
  try {
    await core.executeAsModal(async (ctx) => {
      app.activeDocument = doc;
      const hist = await ctx.hostControl.suspendHistory({ documentID: doc.id, name: `HM4 cilt yumuşat · ${st.label}` });
      try {
        const edge = Math.max(doc.width, doc.height);
        const R = Math.max(2, Math.round(edge / st.div)), G = Math.max(1, Math.round(R / 2 * 10) / 10);
        // 1) Görünen her şeyin birleşik kopyası
        if (doc.layers.length > 1) {
          await bp([{ _obj: 'select', _target: [{ _ref: 'layer', _enum: 'ordinal', _value: 'front' }], makeVisible: false }]);
          await bp([{ _obj: 'mergeVisible', duplicate: true }]);
        } else {
          await bp([{ _obj: 'duplicate', _target: [{ _ref: 'layer', _enum: 'ordinal', _value: 'targetEnum' }], version: 5 }]);
        }
        await bp([{ _obj: 'set', _target: [{ _ref: 'layer', _enum: 'ordinal', _value: 'targetEnum' }], to: { _obj: 'layer', name: `Cilt yumuşatma · ${st.label} (HM4)` } }]);
        // 2) Ten seçimi (yüz algılamalı); bulunamazsa maske kapalı başlar, fırçayla açılır
        try {
          await bp([{ _obj: 'colorRange', colors: { _enum: 'colors', _value: 'skinTone' }, UseFacesKey: true, skinToneFuzziness: 40 }]);
          await bp([{ _obj: 'duplicate', _target: [{ _ref: 'channel', _property: 'selection' }], name: 'HM4 ten' }]);
          skinFound = true;
        } catch (e) { skinFound = false; }
        await bp([{ _obj: 'set', _target: [{ _ref: 'channel', _property: 'selection' }], to: { _enum: 'ordinal', _value: 'none' } }]);
        // 3) Dokuyu koruyan yumuşatma (ters yüksek geçiren)
        await bp([{ _obj: 'invert' }]);
        await bp([{ _obj: 'highPass', radius: { _unit: 'pixelsUnit', _value: R } }]);
        await bp([{ _obj: 'gaussianBlur', radius: { _unit: 'pixelsUnit', _value: G } }]);
        await bp([{ _obj: 'set', _target: [{ _ref: 'layer', _enum: 'ordinal', _value: 'targetEnum' }], to: { _obj: 'layer', mode: { _enum: 'blendMode', _value: 'vividLight' }, opacity: { _unit: 'percentUnit', _value: st.op } } }]);
        // 4) Maske: yalnızca ten
        if (skinFound) {
          await bp([{ _obj: 'set', _target: [{ _ref: 'channel', _property: 'selection' }], to: { _ref: 'channel', _name: 'HM4 ten' } }]);
          await bp([{ _obj: 'make', new: { _class: 'channel' }, at: { _ref: 'channel', _enum: 'channel', _value: 'mask' }, using: { _enum: 'userMaskEnabled', _value: 'revealSelection' } }]);
          await bp([{ _obj: 'delete', _target: [{ _ref: 'channel', _name: 'HM4 ten' }] }]).catch(() => {});
        } else {
          await bp([{ _obj: 'make', new: { _class: 'channel' }, at: { _ref: 'channel', _enum: 'channel', _value: 'mask' }, using: { _enum: 'userMaskEnabled', _value: 'hideAll' } }]);
        }
      } finally { await ctx.hostControl.resumeHistory(hist); }
    }, { commandName: 'HM4: cilt yumuşat' });
    j.msg = skinFound ? `Cilt yumuşatıldı (${st.label}) · fazla yerleri maskeden silin` : `Katman eklendi · ten bulunamadı: beyaz fırçayla teni boyayın`;
  } catch (e) { j.msg = `Cilt yumuşatılamadı: ${e.message || e}`; }
  render();
  return prev;
}

// Photoshop'taki eylemler
const ACT_KEY = 'hm4_actions', AUTO_KEY = 'hm4_auto';
let favActs = []; let autoRun = '';
try { favActs = JSON.parse(localStorage.getItem(ACT_KEY) || '[]'); autoRun = localStorage.getItem(AUTO_KEY) || ''; } catch (e) { favActs = []; }
const actId = (set, name) => `${set}\u241f${name}`;
function listActions() {
  try { return app.actionTree.map((st) => ({ set: st.name, actions: st.actions.map((a) => a.name) })); } catch (e) { return []; }
}
function findAction(id) {
  try { for (const st of app.actionTree) for (const a of st.actions) if (actId(st.name, a.name) === id) return a; } catch (e) { /* yok */ }
  return null;
}
async function runAction(j, id) {
  const doc = docForJob(j); if (!doc) return;
  const a = findAction(id);
  const nm = id.split('\u241f')[1];
  if (!a) { j.msg = `“${nm}” eylemi bulunamadı`; render(); return; }
  j.msg = `“${nm}” uygulanıyor…`; render();
  try {
    await core.executeAsModal(async () => { app.activeDocument = doc; await a.play(); }, { commandName: `HM4: ${nm}` });
    j.msg = `“${nm}” uygulandı · bitince Siteye gönder`;
  } catch (e) { j.msg = `“${nm}” uygulanamadı: ${e.message || e}`; }
  render();
}
async function runAuto(j) {
  if (!autoRun) return;
  if (autoRun.startsWith('cilt:')) await skinSmooth(j, autoRun.slice(5));
  else await runAction(j, autoRun);
}

// Eylem seçme ekranı
function renderSettings() {
  const box = $('acts'); box.innerHTML = '';
  const row = (label, on, star, onCk, onStar) => {
    const r = el('div', 'row');
    const ck = el('span', `ck${on ? ' on' : ''}`, on ? '✓' : ''); if (onCk) ck.addEventListener('click', onCk); else ck.className += ' hidden';
    r.appendChild(ck); r.appendChild(el('span', '', label));
    const s = el('span', `star${star ? ' on' : ''}`, star ? '★ otomatik' : '☆'); s.addEventListener('click', onStar); r.appendChild(s);
    return r;
  };
  const save = () => { try { localStorage.setItem(ACT_KEY, JSON.stringify(favActs)); localStorage.setItem(AUTO_KEY, autoRun); } catch (e) { /* saklanamadı */ } renderSettings(); render(); };
  box.appendChild(el('div', 'grp', 'HM4 · Cilt yumuşatma'));
  for (const k of Object.keys(STRENGTH)) box.appendChild(row(STRENGTH[k].label, true, autoRun === `cilt:${k}`, null, () => { autoRun = autoRun === `cilt:${k}` ? '' : `cilt:${k}`; save(); }));
  const tree = listActions();
  if (!tree.length) box.appendChild(el('div', 'hint', 'Photoshop’ta kayıtlı eylem bulunamadı (Pencere › Eylemler).'));
  for (const st of tree) {
    box.appendChild(el('div', 'grp', st.set));
    for (const nm of st.actions) {
      const id = actId(st.set, nm), on = favActs.includes(id);
      box.appendChild(row(nm, on, autoRun === id,
        () => { favActs = on ? favActs.filter((x) => x !== id) : [...favActs, id]; save(); },
        () => { autoRun = autoRun === id ? '' : id; if (autoRun && !favActs.includes(id)) favActs.push(id); save(); }));
    }
  }
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
      // Orijinal: katmanlı belge de olsa en yüksek kalitede (12) JPEG kopyası kaydedilir; açık belge olduğu gibi kalır
      const copy = await saveJpegCopy(doc, j);
      if (copy) original = copy;
      else if (/\.jpe?g$/i.test(String(doc.path || '')) && samePath(doc.path, j.path)) original = new Uint8Array(await j.entry.read({ format: formats.binary }));
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
    j.state = 'err'; j.msg = `Yüklenemedi: ${e.message}. Yeniden deneyin.`;
  }
  render();
}

action.addNotificationListener(['save'], async () => {
  const doc = app.activeDocument;
  const j = jobForDoc(doc);
  if (j && j.state !== 'uploading') await upload(j, doc);
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
$('editActs').addEventListener('click', () => { const s = $('settings'); const on = s.className.includes('hidden'); s.className = on ? 'set' : 'set hidden'; if (on) renderSettings(); });
$('closeActs').addEventListener('click', () => { $('settings').className = 'set hidden'; });

(async () => {
  await loadConfig();
  render();
  if (!TOKEN) { setConn('err', 'Bağlantı kodu girilmedi'); showSetup(true); }
  poll();
  pollTimer = setInterval(poll, 1500);
})();
