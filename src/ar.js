'use strict';
// "Masamda gör": çiftin seçtiği kumaş, boy ve kapak yazısıyla kapalı albümün 3D dosyasını üretir.
// Android (Scene Viewer) için GLB, iPhone (Quick Look) için USDZ. Bağımlılık yok: şablon geometri
// src/data/ar-album.json'da (30×30, sırt solda), boy için x/z ölçeklenir. Yaldız yazı, çiftin
// tarayıcısında çizilen saydam PNG'dir; kapağın hemen üstünde metalik bir katman olarak durur.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('./config');

const T = require('./data/ar-album.json');
const SAYFA = fs.readFileSync(path.join(__dirname, 'data', 'ar-sayfa.jpg'));
const DIR = path.join(config.publicMediaDir, 'ar');
const PUBLIC = path.join(__dirname, '..', 'public');
const TILE = 0.07; // kumaş fotoğrafının bir karesi kapakta ~7 cm

/** Kumaş dokusu: katalog görseli (/images/katalog/…) ya da yüklenen (/media/site/…) */
function readDoku(url) {
  const u = String(url || '');
  let m = /^\/images\/katalog\/([\w.-]+\.jpg)$/.exec(u);
  if (m) return fs.readFileSync(path.join(PUBLIC, 'images', 'katalog', m[1]));
  m = /^\/media\/site\/([a-f0-9]{32}\.jpg)$/.exec(u);
  if (m) return fs.readFileSync(path.join(config.publicMediaDir, 'site', m[1]));
  throw new Error('Doku bulunamadı');
}

// Boy: "30×30" → yükseklik (z) × genişlik (x), metre
function dims(ad) {
  const m = /^(\d{2})×(\d{2})$/.exec(String(ad));
  return m ? { h: Number(m[1]) / 100, w: Number(m[2]) / 100 } : { h: 0.3, w: 0.3 };
}

function meshes(w, h) {
  const kx = (w - (T.xs - -T.W / 2)) / (T.W - (T.xs - -T.W / 2)); // sırtın sağındaki kısım ölçeklenir
  const kz = h / T.W;
  const x0 = -w / 2 + (T.xs + T.W / 2); // yeni sırt konumu: albüm ortalanır
  return T.meshes.map((m) => {
    const P = Float32Array.from(m.P);
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i];
      P[i] = x <= T.xs ? x - T.xs + x0 : x0 + (x - T.xs) * kx;
      P[i + 2] *= kz;
    }
    const U = Float32Array.from(m.U);
    if (m.mat === 'kumas') for (let i = 0; i < U.length; i += 1) U[i] = (U[i] * (i % 2 ? kz : kx)) / TILE;
    return { mat: m.mat, P, N: Float32Array.from(m.N), U, I: Uint32Array.from(m.I) };
  });
}

const MATS = {
  kumas: { tex: 'kumas', rough: 0.88, metal: 0 },
  sayfa: { tex: 'sayfa', rough: 0.95, metal: 0 },
  yaldiz: { tex: 'yaldiz', rough: 0.32, metal: 1, alpha: true },
  foto: { tex: 'foto', rough: 0.3, metal: 0, alpha: true }, // kapaktaki fotoğraf (parlak baskı)
};

function glb(ms, tex, MATS) {
  const chunks = []; let off = 0; const views = []; const accs = [];
  const view = (buf, target) => {
    const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; }
    const v = { buffer: 0, byteOffset: off, byteLength: buf.length }; if (target) v.target = target;
    chunks.push(buf); off += buf.length; views.push(v); return views.length - 1;
  };
  const acc = (arr, type, ct, target, n) => {
    const d = { bufferView: view(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength), target), componentType: ct, count: arr.length / n, type };
    if (type === 'VEC3') { const mn = [Infinity, Infinity, Infinity]; const mx = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < arr.length; i += 1) { const k = i % 3; mn[k] = Math.min(mn[k], arr[i]); mx[k] = Math.max(mx[k], arr[i]); } d.min = mn; d.max = mx; }
    accs.push(d); return accs.length - 1;
  };
  const names = Object.keys(tex);
  const images = names.map((k) => ({ bufferView: view(tex[k].buf), mimeType: tex[k].png ? 'image/png' : 'image/jpeg' }));
  const textures = names.map((k, i) => ({ source: i, sampler: k === 'kumas' ? 1 : 0 }));
  const matNames = Object.keys(MATS);
  const materials = matNames.map((k) => {
    const m = MATS[k];
    const o = { name: k, pbrMetallicRoughness: { baseColorTexture: { index: names.indexOf(m.tex) }, metallicFactor: m.metal, roughnessFactor: m.rough } };
    if (m.alpha) { o.alphaMode = 'MASK'; o.alphaCutoff = 0.5; }
    return o;
  });
  const prims = ms.map((m) => {
    const U = Float32Array.from(m.U); for (let i = 1; i < U.length; i += 2) U[i] = 1 - U[i]; // glTF: v aşağı
    return { attributes: { POSITION: acc(m.P, 'VEC3', 5126, 34962, 3), NORMAL: acc(m.N, 'VEC3', 5126, 34962, 3), TEXCOORD_0: acc(U, 'VEC2', 5126, 34962, 2) }, indices: acc(m.I, 'SCALAR', 5125, 34963, 1), material: matNames.indexOf(m.mat) };
  });
  const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; }
  const bin = Buffer.concat(chunks);
  const g = { asset: { version: '2.0', generator: 'HM4 Studio' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'Album' }], meshes: [{ primitives: prims }],
    materials, textures, images, samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }, { magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    accessors: accs, bufferViews: views, buffers: [{ byteLength: bin.length }] };
  let js = Buffer.from(JSON.stringify(g));
  if (js.length % 4) js = Buffer.concat([js, Buffer.alloc(4 - (js.length % 4), 0x20)]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
  return Buffer.concat([head, ch(js.length, 0x4e4f534a), js, ch(bin.length, 0x004e4942), bin]);
}

function usda(ms, files, MATS) {
  const n = (v) => String(Math.round(v * 1e6) / 1e6);
  const tup = (a, k) => { const o = []; for (let i = 0; i < a.length; i += k) o.push(`(${Array.from(a.subarray(i, i + k), n).join(', ')})`); return `[${o.join(', ')}]`; };
  const body = ms.map((m, k) => `    def Mesh "m${k}"
    {
        uniform bool doubleSided = 0
        int[] faceVertexCounts = [${new Array(m.I.length / 3).fill(3).join(', ')}]
        int[] faceVertexIndices = [${Array.from(m.I).join(', ')}]
        point3f[] points = ${tup(m.P, 3)}
        normal3f[] normals = ${tup(m.N, 3)} (
            interpolation = "vertex"
        )
        texCoord2f[] primvars:st = ${tup(m.U, 2)} (
            interpolation = "vertex"
        )
        uniform token subdivisionScheme = "none"
        rel material:binding = </Album/Mat/${m.mat}>
    }
`).join('');
  const mats = Object.entries(MATS).map(([k, m]) => `        def Material "${k}"
        {
            token outputs:surface.connect = </Album/Mat/${k}/PBR.outputs:surface>
            def Shader "PBR"
            {
                uniform token info:id = "UsdPreviewSurface"
                color3f inputs:diffuseColor.connect = </Album/Mat/${k}/TX.outputs:rgb>
                float inputs:roughness = ${m.rough}
                float inputs:metallic = ${m.metal}
${m.alpha ? `                float inputs:opacity.connect = </Album/Mat/${k}/TX.outputs:a>
                float inputs:opacityThreshold = 0.5
` : ''}                token outputs:surface
            }
            def Shader "ST"
            {
                uniform token info:id = "UsdPrimvarReader_float2"
                token inputs:varname = "st"
                float2 outputs:result
            }
            def Shader "TX"
            {
                uniform token info:id = "UsdUVTexture"
                asset inputs:file = @${files[m.tex]}@
                float2 inputs:st.connect = </Album/Mat/${k}/ST.outputs:result>
                token inputs:wrapS = "${k === 'kumas' ? 'repeat' : 'clamp'}"
                token inputs:wrapT = "${k === 'kumas' ? 'repeat' : 'clamp'}"
                token inputs:sourceColorSpace = "sRGB"
                float3 outputs:rgb
${m.alpha ? '                float outputs:a\n' : ''}            }
        }
`).join('');
  return `#usda 1.0
(
    defaultPrim = "Album"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "Album" (
    kind = "component"
)
{
${body}    def Scope "Mat"
    {
${mats}    }
}
`;
}

// USDZ: sıkıştırmasız ZIP, her dosyanın verisi 64 bayta hizalı
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i += 1) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) {
  const parts = []; const central = []; let off = 0;
  for (const [name, data] of files) {
    const nm = Buffer.from(name);
    const pad = (64 - ((off + 30 + nm.length + 4) % 64)) % 64;
    const extra = Buffer.alloc(4 + pad); extra.writeUInt16LE(0x1986, 0); extra.writeUInt16LE(pad, 2);
    const crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(0, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x5c21, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26); lh.writeUInt16LE(extra.length, 28);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(0, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x5c21, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt32LE(off, 42);
    parts.push(lh, nm, extra, data); central.push(ch, nm);
    off += 30 + nm.length + extra.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}

function isPng(b) { return b && b.length > 100 && b.readUInt32BE(0) === 0x89504e47; }

/**
 * Dosyaları üretir (aynı girdi için önceden üretilmişse yeniden kullanır).
 * @returns {{glb: string, usdz: string}} herkese açık adresler (/media/ar/…)
 */
function build({ doku, kumas: hazir, boy, yaldiz, foto }) {
  if (!isPng(yaldiz) || yaldiz.length > 1.5 * 1024 * 1024) throw new Error('Kapak yazısı görseli geçersiz.');
  if (foto && (!isPng(foto) || foto.length > 3 * 1024 * 1024)) throw new Error('Kapak fotoğrafı geçersiz.');
  // Tarayıcı dokuyu tekrar etmeye uygun hâle getirip gönderir; gelmezse katalogdaki görsel kullanılır
  const ok = hazir && hazir.length > 1000 && hazir.length < 700 * 1024 && hazir[0] === 0xff && hazir[1] === 0xd8;
  const kumas = ok ? hazir : readDoku(doku);
  const key = crypto.createHash('sha256').update(kumas).update('\0').update(boy).update('\0').update(yaldiz).update('\0').update(foto || '').digest('hex').slice(0, 32);
  fs.mkdirSync(DIR, { recursive: true });
  const out = { glb: `/media/ar/${key}.glb`, usdz: `/media/ar/${key}.usdz` };
  if (fs.existsSync(path.join(DIR, `${key}.usdz`))) return out;
  const { w, h } = dims(boy);
  const ms = meshes(w, h).filter((m) => foto || m.mat !== 'foto');
  const mats = Object.fromEntries(Object.entries(MATS).filter(([k]) => foto || k !== 'foto'));
  const tex = { kumas: { buf: kumas }, sayfa: { buf: SAYFA }, yaldiz: { buf: yaldiz, png: true }, ...(foto ? { foto: { buf: foto, png: true } } : {}) };
  fs.writeFileSync(path.join(DIR, `${key}.glb`), glb(ms, tex, mats));
  const files = { kumas: 'kumas.jpg', sayfa: 'sayfa.jpg', yaldiz: 'yaldiz.png', foto: 'foto.png' };
  fs.writeFileSync(path.join(DIR, `${key}.usdz`), zip([['album.usda', Buffer.from(usda(ms, files, mats))], ['kumas.jpg', kumas], ['sayfa.jpg', SAYFA], ['yaldiz.png', yaldiz], ...(foto ? [['foto.png', foto]] : [])]));
  prune();
  return out;
}

// Klasör büyümesin: 400 albümden fazlası olursa en eskiler silinir
function prune() {
  try {
    const fl = fs.readdirSync(DIR).filter((f) => f.endsWith('.usdz')).map((f) => ({ f, t: fs.statSync(path.join(DIR, f)).mtimeMs })).sort((a, b) => b.t - a.t);
    for (const { f } of fl.slice(400)) { const k = f.slice(0, -5); for (const e of ['.usdz', '.glb']) fs.rmSync(path.join(DIR, k + e), { force: true }); }
  } catch { /* önemli değil */ }
}

module.exports = { build, dims, DIR };
