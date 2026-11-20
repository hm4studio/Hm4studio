'use strict';
// Seçme bulma: analiz verisinden 4–5 sn'lik kullanılabilir pencereler, birbirine benzemeyenler seçilir.

const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const ham = (a, b) => { let d = 0; for (let i = 0; i < 64; i++) if (a[i] !== b[i]) d++; return d; };
const gridDiff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return d / a.length; };

const SIM = { siki: 18, normal: 14, gevsek: 10 }; // dHash farkı bu değerin altındaysa "benzer"
// Sarsıntı toleransı: pencerenin ortalama ve %90'lık titreme sınırı (160 px genişlikte, kare başına piksel)
const SHAKE = { siki: [0.6, 1.5], normal: [0.9, 2], gevsek: [1.3, 3] };

// Kare kare durum: hangi kare kullanılamaz ve neden
function flags(r) {
  const n = r.t.length;
  const cut = r.mad.map((m) => m > 30);
  // Netlik referansı yereldir: aynı sahne içinde (ani geçişler arası) ±4 sn'deki karelerin %75'lik değeri.
  // Böylece dokusu az bir sahne (gökyüzü, duvar) "bulanık" sanılmaz; odak kaçan an komşularına göre düşük kalır.
  const seg = new Int32Array(n); for (let i = 1; i < n; i++) seg[i] = seg[i - 1] + (cut[i] ? 1 : 0);
  const R = Math.round(4 * r.afps);
  const ref = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const vals = [];
    for (let j = Math.max(0, i - R); j <= Math.min(n - 1, i + R); j++) if (seg[j] === seg[i] && r.std[j] >= 8) vals.push(r.sharp[j]);
    ref[i] = Math.max(30, pct(vals, 0.75));
  }
  // Kamera hareketinin düzgünlüğü: anlık hız ile yumuşatılmış hız farkı (titreme)
  const K = 4;
  const jit = new Array(n).fill(0), speed = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0, c = 0;
    for (let j = Math.max(1, i - K); j <= Math.min(n - 1, i + K); j++) { if (seg[j] !== seg[i]) continue; sx += r.vx[j]; sy += r.vy[j]; c++; }
    sx /= c || 1; sy /= c || 1;
    jit[i] = cut[i] ? 0 : Math.hypot(r.vx[i] - sx, r.vy[i] - sy);
    speed[i] = cut[i] ? 0 : Math.hypot(r.vx[i], r.vy[i]);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    let why = null;
    if (r.std[i] < 8) why = r.mean[i] < 40 ? 'kapalı lens / siyah' : 'boş görüntü';
    else if (r.mean[i] < 22 || r.lo[i] > 0.8 || (r.mean[i] < 35 && r.std[i] < 20)) why = 'karanlık';
    else if (r.hi[i] > 0.92 || (r.hi[i] > 0.75 && r.std[i] < 25)) why = 'patlamış ışık'; // bilinçli parlak (high-key) kareler elenmez
    else if (r.sharp[i] < Math.max(12, 0.2 * ref[i])) why = 'odak dışı / bulanık';
    else if (jit[i] > 3) why = 'sarsıntılı';
    else if (speed[i] >= 6) why = 'çok hızlı çevirme';
    out.push(why);
  }
  return { why: out, jit, speed, ref, cut };
}

// Ardışık kötü kareleri aralıklara çevirir (rapor için)
function badRanges(r, f, minLen = 0.5) {
  const res = [];
  let cur = null;
  const dt = 1 / r.afps;
  for (let i = 0; i < r.t.length; i++) {
    const why = f.why[i];
    if (why && cur && cur.neden === why) cur.son = r.t[i] + dt;
    else {
      if (cur && cur.son - cur.bas >= minLen) res.push(cur);
      cur = why ? { bas: r.t[i], son: r.t[i] + dt, neden: why } : null;
    }
  }
  if (cur && cur.son - cur.bas >= minLen) res.push(cur);
  return res.map((x) => ({ ...x, bas: Math.round(x.bas * 10) / 10, son: Math.round(x.son * 10) / 10 }));
}

// Pencere imzası: %20, %50, %80 noktalarındaki kareler
function signature(r, a, b) {
  return [0.2, 0.5, 0.8].map((p) => { const i = Math.min(b - 1, a + Math.floor((b - a) * p)); return { h: r.hash[i], g: r.grid[i] }; });
}
function distance(sa, sb) {
  let best = Infinity;
  for (const x of sa) for (const y of sb) best = Math.min(best, ham(x.h, y.h) + (gridDiff(x.g, y.g) > 40 ? 8 : 0));
  return best;
}

/**
 * @returns {{ secmeler: Array, reddedilen: Array, ref: number }}
 * secme: { bas, son, puan, netlik, sarsinti, imza }
 */
function findSelects(r, { min = 4, max = 5, kenar = 0.6, benzerlik = 'normal', sarsinti = 'normal', enFazla = 8 } = {}) {
  const [jMean, jP90] = SHAKE[sarsinti] || SHAKE.normal;
  const f = flags(r);
  const n = r.t.length, fps = r.afps, dur = r.info.duration;
  const lo = Math.round(min * fps), hi = Math.round(max * fps), step = Math.max(1, Math.round(fps / 4));
  const first = Math.ceil(kenar * fps), last = Math.min(n, Math.floor((dur - kenar) * fps));
  const thr = SIM[benzerlik] ?? SIM.normal;

  // Önek toplamlar
  const bad = new Int32Array(n + 1), cuts = new Int32Array(n + 1), js = new Float64Array(n + 1), sq = new Float64Array(n + 1), ex = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    bad[i + 1] = bad[i] + (f.why[i] ? 1 : 0);
    cuts[i + 1] = cuts[i] + (f.cut[i] ? 1 : 0);
    js[i + 1] = js[i] + Math.min(f.jit[i], 4);
    sq[i + 1] = sq[i] + Math.min(1, r.sharp[i] / (0.6 * f.ref[i]));
    ex[i + 1] = ex[i] + (1 - Math.min(1, Math.abs(r.mean[i] - 125) / 125) * 0.6);
  }
  const p90jit = (a, b) => pct(f.jit.slice(a, b), 0.9);

  const cand = [];
  for (let a = first; a + lo <= last; a += step) {
    let best = null;
    for (let L = Math.min(hi, last - a); L >= lo; L -= step) {
      const b = a + L;
      if (bad[b] - bad[a] > 0) continue;
      if (cuts[b] - cuts[a + 1] > 0) continue; // pencerenin içinde ani geçiş yok (ilk kare hariç)
      const mj = (js[b] - js[a]) / L;
      if (mj > jMean || p90jit(a, b) > jP90) continue;
      const sharpQ = (sq[b] - sq[a]) / L, expo = (ex[b] - ex[a]) / L;
      const score = 0.45 * sharpQ + 0.35 * (1 - Math.min(1, mj / 2)) + 0.2 * expo + 0.02 * (L / hi);
      best = { a, b, score, sharpQ, mj };
      break; // en uzun geçerli pencere
    }
    if (best) cand.push(best);
  }
  cand.sort((x, y) => y.score - x.score);

  const picked = [], spare = [];
  for (const c of cand) {
    if (picked.some((p) => c.a < p.b && p.a < c.b)) continue; // üst üste binmesin
    const sig = signature(r, c.a, c.b);
    const twin = picked.find((p) => distance(sig, p.imza) < thr);
    if (twin) { if (!spare.some((p) => c.a < p.b && p.a < c.b)) spare.push({ ...c, imza: sig, benzer: twin }); continue; } // birbirine benzemesin; yedek olarak dursun
    if (picked.length >= enFazla) continue;
    picked.push({ ...c, imza: sig });
  }
  picked.sort((x, y) => x.a - y.a);
  const round = (v) => Math.round(v * 100) / 100;
  const pack = (p) => ({
    bas: round(r.t[p.a]), son: round(r.t[p.b - 1] + 1 / fps),
    puan: Math.round(p.score * 100), netlik: Math.round(Math.min(1, p.sharpQ) * 100), sarsinti: Math.round(p.mj * 100) / 100,
    imza: p.imza,
  });
  const out = picked.map(pack);
  return {
    secmeler: out,
    yedekler: spare.slice(0, 6).sort((x, y) => x.a - y.a).map((p) => ({ ...pack(p), benzerBas: round(r.t[p.benzer.a]) })),
    reddedilen: badRanges(r, f),
  };
}

module.exports = { findSelects, distance, SIM, SHAKE };
