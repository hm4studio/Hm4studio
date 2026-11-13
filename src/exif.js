'use strict';
// JPEG içindeki EXIF çekim zamanı (DateTimeOriginal, yoksa DateTime): "2026:06:14 15:42:07".
// Dosyanın yalnızca başı okunur; sonuç bellekte saklanır.
const fs = require('node:fs');

const cache = new Map();

function parse(buf) {
  if (!buf || buf[0] !== 0xff || buf[1] !== 0xd8) return '';
  let i = 2;
  while (i + 4 < buf.length) {
    if (buf[i] !== 0xff) return '';
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m === 0xe1 && buf.toString('ascii', i + 4, i + 10) === 'Exif\0\0') return fromTiff(buf, i + 10, Math.min(buf.length, i + 2 + len));
    if (m === 0xda) return '';
    i += 2 + len;
  }
  return '';
}

function fromTiff(b, t, end) {
  const le = b.toString('ascii', t, t + 2) === 'II';
  const u16 = (o) => (o + 2 <= end ? (le ? b.readUInt16LE(o) : b.readUInt16BE(o)) : 0);
  const u32 = (o) => (o + 4 <= end ? (le ? b.readUInt32LE(o) : b.readUInt32BE(o)) : 0);
  const str = (off, n) => (t + off + n <= end ? b.toString('ascii', t + off, t + off + n).replace(/\0.*$/, '') : '');
  const scan = (ifd) => {
    const out = {};
    const n = u16(t + ifd);
    for (let k = 0; k < n && k < 400; k++) {
      const e = t + ifd + 2 + k * 12;
      const tag = u16(e), count = u32(e + 4), val = u32(e + 8);
      if (tag === 0x8769) out.exif = val;
      if ((tag === 0x9003 || tag === 0x0132) && count >= 19) out[tag] = str(val, 19);
    }
    return out;
  };
  const ifd0 = scan(u32(t + 4));
  const sub = ifd0.exif ? scan(ifd0.exif) : {};
  const v = sub[0x9003] || ifd0[0x0132] || '';
  return /^\d{4}:\d\d:\d\d \d\d:\d\d:\d\d$/.test(v) && !v.startsWith('0000') ? v : '';
}

function shotTime(file) {
  try {
    const st = fs.statSync(file);
    const key = `${file}:${st.mtimeMs}`;
    if (cache.has(key)) return cache.get(key);
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(Math.min(st.size, 256 * 1024));
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const v = parse(buf);
    if (cache.size > 5000) cache.clear();
    cache.set(key, v);
    return v;
  } catch { return ''; }
}

module.exports = { shotTime, parse };
