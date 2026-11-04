'use strict';
// Akış hâlinde ZIP (sıkıştırmasız; fotoğraflar zaten sıkıştırılmış). Ek paket gerekmez.
// Her dosyanın CRC'si yazmadan önce hesaplanır (veri tanımlayıcı kullanılmaz: macOS/iOS arşiv açıcılarıyla uyumlu).
// 4 GB'ı aşan arşivlerde ZIP64 alanları kendiliğinden eklenir.
const fs = require('node:fs');
const zlib = require('node:zlib');

const MAX32 = 0xffffffff;

function dosTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

async function fileCrc(file) {
  let crc = 0;
  for await (const chunk of fs.createReadStream(file)) crc = zlib.crc32(chunk, crc);
  return crc >>> 0;
}

// entries: [{ name, file }]
async function streamZip(res, entries) {
  let offset = 0;
  const central = [];
  const write = (buf) => new Promise((resolve, reject) => {
    if (res.destroyed) return reject(new Error('Bağlantı kapandı'));
    offset += buf.length;
    if (res.write(buf)) resolve(); else res.once('drain', resolve);
  });

  for (const e of entries) {
    const st = fs.statSync(e.file);
    const size = st.size;
    const crc = await fileCrc(e.file);
    const name = Buffer.from(e.name, 'utf8');
    const { time, date } = dosTime(st.mtime);
    const big = size >= MAX32;
    const start = offset;
    // Yerel başlık
    const extra = big ? Buffer.alloc(20) : Buffer.alloc(0);
    if (big) { extra.writeUInt16LE(0x0001, 0); extra.writeUInt16LE(16, 2); extra.writeBigUInt64LE(BigInt(size), 4); extra.writeBigUInt64LE(BigInt(size), 12); }
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(big ? 45 : 20, 4);
    h.writeUInt16LE(0x0800, 6); // UTF-8 dosya adı
    h.writeUInt16LE(0, 8); // sıkıştırma yok
    h.writeUInt16LE(time, 10); h.writeUInt16LE(date, 12);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(big ? MAX32 : size, 18); h.writeUInt32LE(big ? MAX32 : size, 22);
    h.writeUInt16LE(name.length, 26); h.writeUInt16LE(extra.length, 28);
    await write(Buffer.concat([h, name, extra]));
    for await (const chunk of fs.createReadStream(e.file)) await write(chunk);
    central.push({ name, crc, size, time, date, start });
  }

  // Merkezî dizin
  const cdStart = offset;
  for (const c of central) {
    const needSize = c.size >= MAX32, needOff = c.start >= MAX32;
    const fields = [];
    if (needSize) fields.push(BigInt(c.size), BigInt(c.size));
    if (needOff) fields.push(BigInt(c.start));
    const extra = fields.length ? Buffer.alloc(4 + fields.length * 8) : Buffer.alloc(0);
    if (fields.length) { extra.writeUInt16LE(0x0001, 0); extra.writeUInt16LE(fields.length * 8, 2); fields.forEach((v, i) => extra.writeBigUInt64LE(v, 4 + i * 8)); }
    const h = Buffer.alloc(46);
    h.writeUInt32LE(0x02014b50, 0);
    h.writeUInt16LE(fields.length ? 45 : 20, 4); h.writeUInt16LE(fields.length ? 45 : 20, 6);
    h.writeUInt16LE(0x0800, 8); h.writeUInt16LE(0, 10);
    h.writeUInt16LE(c.time, 12); h.writeUInt16LE(c.date, 14);
    h.writeUInt32LE(c.crc, 16);
    h.writeUInt32LE(needSize ? MAX32 : c.size, 20); h.writeUInt32LE(needSize ? MAX32 : c.size, 24);
    h.writeUInt16LE(c.name.length, 28); h.writeUInt16LE(extra.length, 30);
    h.writeUInt32LE(needOff ? MAX32 : c.start, 42);
    await write(Buffer.concat([h, c.name, extra]));
  }
  const cdSize = offset - cdStart;
  const zip64 = central.length >= 0xffff || cdStart >= MAX32 || cdSize >= MAX32 || central.some((c) => c.size >= MAX32 || c.start >= MAX32);
  if (zip64) {
    const eocd64Start = offset;
    const z = Buffer.alloc(56);
    z.writeUInt32LE(0x06064b50, 0); z.writeBigUInt64LE(44n, 4);
    z.writeUInt16LE(45, 12); z.writeUInt16LE(45, 14);
    z.writeBigUInt64LE(BigInt(central.length), 24); z.writeBigUInt64LE(BigInt(central.length), 32);
    z.writeBigUInt64LE(BigInt(cdSize), 40); z.writeBigUInt64LE(BigInt(cdStart), 48);
    const loc = Buffer.alloc(20);
    loc.writeUInt32LE(0x07064b50, 0); loc.writeBigUInt64LE(BigInt(eocd64Start), 8); loc.writeUInt32LE(1, 16);
    await write(Buffer.concat([z, loc]));
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Math.min(central.length, 0xffff), 8); end.writeUInt16LE(Math.min(central.length, 0xffff), 10);
  end.writeUInt32LE(zip64 ? MAX32 : cdSize, 12); end.writeUInt32LE(zip64 ? MAX32 : cdStart, 16);
  res.end(end);
}

module.exports = { streamZip };
