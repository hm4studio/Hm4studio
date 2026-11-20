'use strict';
// Klasör ayıklama: klasördeki bütün videoları analiz eder, seçmeleri bulur, benzerleri klipler arasında da eler,
// her seçme için kare şeridi üretir, ayiklama.json ve Premiere XML'i yazar.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { analyze } = require('./analyze');
const { findSelects, distance, SIM } = require('./select');
const { buildXml } = require('./xml');

const VIDEO = /\.(mp4|mov|mxf|m4v|avi|mts|m2ts|mkv|mpg|mpeg|3gp|hevc)$/i;
const OUT = '_HM4-Ayiklama';

const outDir = (klasor) => path.join(klasor, OUT);
const jsonPath = (klasor) => path.join(outDir(klasor), 'ayiklama.json');

function listVideos(klasor, altKlasorler = false) {
  const res = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === OUT) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory() && altKlasorler) walk(p);
      else if (e.isFile() && VIDEO.test(e.name)) res.push(p);
    }
  };
  walk(klasor);
  return res.sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => execFile('ffmpeg', args, { maxBuffer: 16 * 1024 * 1024 }, (e, _o, se) => (e ? reject(new Error(String(se || e.message).trim().split('\n').pop())) : resolve())));
}

// Seçmenin %20, %50, %80 noktalarından üç renkli kare yan yana (Claude ve kullanıcı bakar)
async function strip(file, s, out) {
  const ts = [0.2, 0.5, 0.8].map((p) => (s.bas + (s.son - s.bas) * p).toFixed(3));
  const args = ['-v', 'error', '-y'];
  for (const t of ts) args.push('-ss', t, '-i', file);
  args.push('-filter_complex', '[0:v]scale=360:-2,setsar=1[a];[1:v]scale=360:-2,setsar=1[b];[2:v]scale=360:-2,setsar=1[c];[a][b][c]hstack=inputs=3[o]', '-map', '[o]', '-frames:v', '1', '-q:v', '5', out);
  await ffmpeg(args);
}

function cacheKey(file) {
  const st = fs.statSync(file);
  return `${path.basename(file)}-${st.size}-${Math.floor(st.mtimeMs)}`.replace(/[^\w.-]+/g, '_');
}

async function analyzeCached(file, dir, onProgress) {
  const cdir = path.join(dir, 'onbellek');
  fs.mkdirSync(cdir, { recursive: true });
  const cf = path.join(cdir, cacheKey(file) + '.json');
  if (fs.existsSync(cf)) { try { return JSON.parse(fs.readFileSync(cf, 'utf8')); } catch { /* bozuksa yeniden */ } }
  const r = await analyze(file, { onProgress });
  fs.writeFileSync(cf, JSON.stringify(r));
  return r;
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

/**
 * @param {string} klasor
 * @param {object} opt { min, max, benzerlik, enFazla, altKlasorler, onProgress(text, oran) }
 */
async function runFolder(klasor, opt = {}) {
  klasor = path.resolve(klasor);
  if (!fs.existsSync(klasor) || !fs.statSync(klasor).isDirectory()) throw new Error(`Klasör bulunamadı: ${klasor}`);
  const files = listVideos(klasor, opt.altKlasorler);
  if (!files.length) throw new Error('Bu klasörde video dosyası yok.');
  const dir = outDir(klasor);
  const sdir = path.join(dir, 'kareler');
  fs.mkdirSync(sdir, { recursive: true });
  const prev = fs.existsSync(jsonPath(klasor)) ? JSON.parse(fs.readFileSync(jsonPath(klasor), 'utf8')) : null;
  const ayar = { min: opt.min ?? 4, max: opt.max ?? 5, benzerlik: opt.benzerlik || 'normal', sarsinti: opt.sarsinti || 'normal', enFazla: opt.enFazla ?? 8 };
  const say = opt.onProgress || (() => {});
  const done = new Array(files.length).fill(0);
  const tell = (k, p, text) => { done[k] = p; say(text, done.reduce((a, b) => a + b, 0) / files.length); };

  const clips = new Array(files.length);
  const par = Math.max(1, Math.min(3, Math.floor(os.cpus().length / 4) || 1));
  await pool(files, par, async (file, k) => {
    const ad = path.basename(file);
    const base = ad.replace(/\.[^.]+$/, '');
    try {
      const r = await analyzeCached(file, dir, (p) => tell(k, p * 0.9, `${ad} inceleniyor`));
      const s = findSelects(r, ayar);
      clips[k] = { dosya: path.relative(klasor, file), yol: file, ad, base, sure: Math.round(r.info.duration * 100) / 100, fps: r.info.fps, genislik: r.info.width, yukseklik: r.info.height, ses: r.info.audio, durum: 'tamam', _s: s };
    } catch (err) {
      clips[k] = { dosya: path.relative(klasor, file), yol: file, ad, base, durum: 'hata', hata: err.message, secmeler: [], yedekler: [], reddedilen: [] };
    }
    tell(k, 0.9, `${ad} tamam`);
  });

  // Klipler arası benzerlik: aynı anı iki klipte çektiyseniz iyisi kalır, diğeri yedeğe iner
  const thr = SIM[ayar.benzerlik] ?? SIM.normal;
  const all = [];
  clips.forEach((c, ci) => c._s && c._s.secmeler.forEach((s, si) => all.push({ ci, si, s })));
  all.sort((a, b) => b.s.puan - a.s.puan);
  const keep = [];
  for (const x of all) {
    const twin = keep.find((y) => y.ci !== x.ci && distance(x.s.imza, y.s.imza) < thr);
    if (twin) x.twin = twin; else keep.push(x);
  }

  // Kimlikler, eski sınıflandırmayı koruma, kare şeritleri
  const old = new Map();
  if (prev) for (const c of prev.klipler || []) for (const s of [...(c.secmeler || []), ...(c.yedekler || [])]) old.set(`${c.dosya}|${s.bas}|${s.son}`, s);
  const jobs = [];
  for (const [ci, c] of clips.entries()) {
    if (!c._s) continue;
    const mine = all.filter((x) => x.ci === ci).sort((a, b) => a.s.bas - b.s.bas);
    const sec = [], yed = [];
    let n = 0, m = 0;
    for (const x of mine) {
      if (x.twin) yed.push({ ...x.s, benzer: null, _twin: x.twin });
      else sec.push({ ...x.s, id: `${c.base}_s${++n}` });
    }
    for (const y of c._s.yedekler) yed.push({ ...y, benzer: (sec.find((z) => z.bas === y.benzerBas) || {}).id || null });
    yed.sort((a, b) => a.bas - b.bas);
    yed.forEach((y) => { y.id = `${c.base}_y${++m}`; });
    c.secmeler = sec; c.yedekler = yed; c.reddedilen = c._s.reddedilen;
  }
  // Klipler arası ikizlerin kimliklerini düzelt
  for (const c of clips) for (const y of c.yedekler || []) if (y._twin) { const t = clips[y._twin.ci].secmeler.find((s) => s.bas === y._twin.s.bas); y.benzer = t ? t.id : null; delete y._twin; }
  for (const c of clips) {
    if (!c._s) continue;
    for (const s of [...c.secmeler, ...c.yedekler]) {
      const o = old.get(`${c.dosya}|${s.bas}|${s.son}`);
      s.sure = Math.round((s.son - s.bas) * 10) / 10;
      s.puan = Math.min(100, s.puan);
      s.sinif = o?.sinif || null; s.not = o?.not || ''; s.kullan = o ? o.kullan !== false : true;
      s.serit = path.join('kareler', `${c.base}_${Math.round(s.bas * 100)}-${Math.round(s.son * 100)}.jpg`); // zamana göre: ayar değişse de doğru kare
      delete s.imza; delete s.benzerBas;
      jobs.push({ c, s });
    }
    delete c._s;
  }
  let sj = 0;
  await pool(jobs, 4, async ({ c, s }) => {
    const out = path.join(dir, s.serit);
    if (!fs.existsSync(out)) { try { await strip(c.yol, s, out); } catch { s.serit = null; } }
    sj++; say(`Kare şeritleri ${sj}/${jobs.length}`, 0.9 + 0.1 * (sj / jobs.length));
  });

  const data = {
    surum: 1, klasor, baslik: path.basename(klasor), tarih: new Date().toISOString(), ayar,
    klipler: clips.map(({ yol, ...c }) => ({ ...c, yol })),
  };
  data.ozet = summary(data);
  save(klasor, data);
  return data;
}

function summary(data) {
  const ok = data.klipler.filter((c) => c.durum === 'tamam');
  const sec = ok.flatMap((c) => c.secmeler);
  return {
    klip: data.klipler.length, hata: data.klipler.length - ok.length,
    secme: sec.filter((s) => s.kullan !== false).length, yedek: ok.reduce((n, c) => n + c.yedekler.length, 0),
    secmesizKlip: ok.filter((c) => !c.secmeler.length).length,
    sure: Math.round(sec.filter((s) => s.kullan !== false).reduce((a, s) => a + s.sure, 0)),
    siniflanan: sec.filter((s) => s.sinif).length,
  };
}

function save(klasor, data) {
  data.ozet = summary(data);
  fs.writeFileSync(jsonPath(klasor), JSON.stringify(data, null, 1));
  const xml = buildXml(data);
  if (xml) fs.writeFileSync(path.join(outDir(klasor), `${data.baslik} - Seçmeler.xml`), xml);
}

function load(klasor) {
  const p = jsonPath(path.resolve(klasor));
  if (!fs.existsSync(p)) throw new Error('Bu klasör henüz ayıklanmadı. Önce ayıklamayı çalıştırın.');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** Claude'un sınıflandırmasını kaydeder: [{ id, sinif, not, kullan }] */
function classify(klasor, list) {
  klasor = path.resolve(klasor);
  const data = load(klasor);
  const byId = new Map();
  for (const c of data.klipler) for (const s of [...(c.secmeler || []), ...(c.yedekler || [])]) byId.set(s.id, { c, s });
  const unknown = [];
  for (const x of list || []) {
    const hit = byId.get(x.id);
    if (!hit) { unknown.push(x.id); continue; }
    if (x.sinif !== undefined) hit.s.sinif = x.sinif || null;
    if (x.not !== undefined) hit.s.not = String(x.not || '').slice(0, 200);
    if (x.kullan !== undefined) hit.s.kullan = Boolean(x.kullan);
    // Yedek kullanılacaksa seçmelere taşınır
    if (x.kullan === true && hit.c.yedekler.includes(hit.s)) {
      hit.c.yedekler = hit.c.yedekler.filter((y) => y !== hit.s);
      hit.c.secmeler.push(hit.s); hit.c.secmeler.sort((a, b) => a.bas - b.bas);
    }
  }
  save(klasor, data);
  return { data, unknown };
}

module.exports = { runFolder, load, classify, save, outDir, jsonPath, listVideos, OUT };
