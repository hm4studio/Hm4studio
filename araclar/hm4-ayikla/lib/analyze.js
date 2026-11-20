'use strict';
// Klip analizi: ffmpeg ile küçük gri karelere açar, her kare için netlik, pozlama, hareket ve benzerlik imzası çıkarır.
// Ağır iş ffmpeg'de; hesaplar saf JavaScript (ek paket yok).
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');

const AFPS = 12; // analiz için saniyede kare
const W = 320; // netlik ölçümü genişliği
const MW = 160; // hareket ölçümü genişliği

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => (err ? reject(new Error(String(stderr || err.message).trim().split('\n').slice(-2).join(' '))) : resolve(stdout)));
  });
}

function parseRate(r) {
  const [a, b] = String(r || '0/1').split('/').map(Number);
  return b ? a / b : a || 0;
}

async function probe(file) {
  const out = JSON.parse(await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]));
  const v = (out.streams || []).find((s) => s.codec_type === 'video');
  if (!v) throw new Error('Video akışı yok');
  const a = (out.streams || []).find((s) => s.codec_type === 'audio');
  let fps = parseRate(v.r_frame_rate);
  const avg = parseRate(v.avg_frame_rate);
  if (avg && (!fps || fps > 240)) fps = avg;
  let w = v.width, h = v.height;
  const rot = Number((v.tags && v.tags.rotate) || ((v.side_data_list || []).find((x) => x.rotation !== undefined) || {}).rotation || 0);
  if (Math.abs(rot) === 90 || Math.abs(rot) === 270) [w, h] = [h, w];
  const duration = Number(v.duration || out.format.duration || 0);
  return {
    width: w, height: h, fps: Math.round(fps * 1000) / 1000, duration,
    frames: Number(v.nb_frames) || Math.round(duration * fps),
    codec: v.codec_name, audio: a ? { channels: a.channels || 2, rate: Number(a.sample_rate) || 48000 } : null,
    timecode: (v.tags && v.tags.timecode) || (out.format.tags && out.format.tags.timecode) || null,
  };
}

// Gri kareleri akış halinde okur; her kare için cb(Uint8Array, index)
function decode(file, height, cb, { hw = process.platform === 'darwin' } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['-v', 'error'];
    if (hw) args.push('-hwaccel', 'videotoolbox');
    args.push('-i', file, '-an', '-sn', '-vf', `fps=${AFPS},scale=${W}:${height}:flags=area,format=gray`, '-f', 'rawvideo', '-');
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const size = W * height;
    let buf = Buffer.alloc(0);
    let n = 0;
    let err = '';
    p.stdout.on('data', (chunk) => {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      while (buf.length >= size) {
        cb(new Uint8Array(buf.buffer, buf.byteOffset, size).slice(), n++);
        buf = buf.subarray(size);
      }
    });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => {
      if (code === 0 || n > 0) resolve(n);
      else if (hw) decode(file, height, cb, { hw: false }).then(resolve, reject); // donanım hızlandırma çalışmazsa normal çöz
      else reject(new Error(err.trim().split('\n').slice(-1)[0] || `ffmpeg ${code}`));
    });
  });
}

// ── Kare ölçümleri ──
function lapVar(g, w, h) {
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    const o = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = o + x;
      const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
      s += l; s2 += l * l; n++;
    }
  }
  const m = s / n;
  return s2 / n - m * m;
}

function stats(g) {
  let s = 0, s2 = 0, hi = 0, lo = 0;
  for (let i = 0; i < g.length; i++) {
    const v = g[i];
    s += v; s2 += v * v;
    if (v >= 245) hi++; else if (v <= 10) lo++;
  }
  const n = g.length, m = s / n;
  return { mean: m, std: Math.sqrt(Math.max(0, s2 / n - m * m)), hi: hi / n, lo: lo / n };
}

function down(g, w, h, tw, th) {
  const out = new Float32Array(tw * th);
  const fx = w / tw, fy = h / th;
  for (let y = 0; y < th; y++) {
    const y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
    for (let x = 0; x < tw; x++) {
      const x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      let s = 0, c = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { s += g[yy * w + xx]; c++; }
      out[y * tw + x] = s / c;
    }
  }
  return out;
}

// İki kare arası genel kayma (kamera hareketi) ve kaydırma sonrası fark
function shift(a, b, w, h, R = 8) {
  const m = R + 2;
  let best = Infinity, bx = 0, by = 0;
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      let s = 0, c = 0;
      for (let y = m; y < h - m; y += 2) {
        const oa = y * w, ob = (y + dy) * w + dx;
        for (let x = m; x < w - m; x += 2) { s += Math.abs(a[oa + x] - b[ob + x]); c++; }
      }
      const v = s / c;
      if (v < best) { best = v; bx = dx; by = dy; }
    }
  }
  return { dx: bx, dy: by, mad: best };
}

// 64 bitlik fark özeti (dHash) — benzer görüntü tespiti için
function dhash(g, w, h) {
  const d = down(g, w, h, 9, 8);
  const bits = new Uint8Array(64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits[y * 8 + x] = d[y * 9 + x] > d[y * 9 + x + 1] ? 1 : 0;
  return bits;
}
// Kaba ışık dağılımı (4x4) — dHash'e ek olarak renk/ışık benzerliği
function grid(g, w, h) { return Array.from(down(g, w, h, 4, 4), (v) => Math.round(v)); }

/** Klibi analiz eder. Dönüş: { info, t[], sharp[], mean[], std[], hi[], lo[], vx[], vy[], mad[], hash[], grid[] } */
async function analyze(file, { onProgress } = {}) {
  const info = await probe(file);
  const H = Math.max(2, Math.round((W * info.height) / info.width / 2) * 2);
  const MH = Math.max(2, Math.round(H / 2));
  const r = { info, afps: AFPS, t: [], sharp: [], mean: [], std: [], hi: [], lo: [], vx: [], vy: [], mad: [], hash: [], grid: [] };
  let prev = null, prevStd = 0, prevMean = 0;
  const expected = Math.max(1, Math.round(info.duration * AFPS));
  await decode(file, H, (g, i) => {
    const s = stats(g);
    r.t.push(i / AFPS);
    r.sharp.push(lapVar(g, W, H));
    r.mean.push(s.mean); r.std.push(s.std); r.hi.push(s.hi); r.lo.push(s.lo);
    const small = down(g, W, H, MW, MH);
    // Düz/boş karede (kapalı lens, siyah) hareket ölçülemez: 0 kabul edilir
    if (prev && s.std >= 6 && prevStd >= 6) { const m = shift(prev, small, MW, MH); r.vx.push(m.dx); r.vy.push(m.dy); r.mad.push(m.mad); } else { r.vx.push(0); r.vy.push(0); r.mad.push(prev && Math.abs(s.mean - prevMean) > 25 ? 99 : 0); }
    prev = small; prevStd = s.std; prevMean = s.mean;
    r.hash.push(Array.from(dhash(g, W, H)).join(''));
    r.grid.push(grid(g, W, H));
    if (onProgress && i % AFPS === 0) onProgress(Math.min(1, i / expected));
  });
  if (!r.t.length) throw new Error('Kare okunamadı');
  return r;
}

module.exports = { analyze, probe, AFPS };

// Dosya varlığını erken kontrol için
module.exports.exists = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
