/* ARW Bulucu: çiftin seçtiği karelerin RAW dosyalarını seçilen klasörde (alt klasörler dahil) bulur
   ve tek klasöre kopyalar. Dosyalar siteye yüklenmez; her şey tarayıcıda olur.
   Chrome/Edge: klasöre doğrudan kopyalar (File System Access). Diğerleri: ZIP olarak indirir. */
(() => {
  const root = document.querySelector('[data-arw]');
  if (!root) return;
  const $ = (s) => root.querySelector(s);
  const want = [...new Set(JSON.parse(root.dataset.names || '[]'))];
  const couple = root.dataset.couple || 'Çift';
  const canFS = typeof window.showDirectoryPicker === 'function';
  const RAW = new Set(['arw', 'cr2', 'cr3', 'nef', 'raf', 'dng', 'orf', 'rw2', 'pef', 'srw']);
  const JPG = new Set(['jpg', 'jpeg', 'heic', 'png', 'tif', 'tiff']);
  const SIZE_WORDS = /(^|[\s_\-.()]+)(büyük|buyuk|orta|küçük|kucuk|gerçek boyut|gercek boyut|large|medium|small|actual size)(?=$|[\s_\-.()]+)/giu;
  const key = (name) => String(name).replace(/\.[a-z0-9]{2,5}$/i, '').replace(SIZE_WORDS, ' ').replace(/[\s_\-]*\(\d+\)$/, '').replace(/^[\s_\-.]+|[\s_\-.]+$/g, '').trim().toUpperCase();
  const ext = (name) => (/\.([a-z0-9]{2,5})$/i.exec(name) || [])[1]?.toLowerCase() || '';
  const gb = (n) => (n >= 1e9 ? `${(n / 1e9).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} GB` : `${Math.max(1, Math.round(n / 1e6)).toLocaleString('tr-TR')} MB`);
  const safe = (s) => s.replace(/[\\/:*?"<>|]+/g, '-').trim();
  const ascii = (s) => safe(s).replace(/[çÇğĞıİöÖşŞüÜ–—]/g, (ch) => ({ ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U', '–': '-', '—': '-' })[ch]); // indirme adı her tarayıcıda düzgün çıksın

  // Taranan dosyalar: { name, path, get: () => Promise<File> }
  const files = [];
  let folders = 0, found = new Map(), missing = [], total = 0;
  const step = (n) => root.querySelectorAll('[data-step]').forEach((li) => { const k = Number(li.dataset.step); li.className = k < n ? 'is-ok' : k === n ? 'is-on' : ''; });
  const show = (sel) => ['[data-arw-pick]', '[data-arw-check]', '[data-arw-run]', '[data-arw-done]'].forEach((s) => { $(s).hidden = s !== sel; });
  if (!canFS) $('[data-arw-safari]').hidden = false;

  async function walk(dir, path) {
    for await (const [name, h] of dir.entries()) {
      if (name.startsWith('.')) continue;
      if (h.kind === 'directory') await walk(h, `${path}${name}/`);
      else files.push({ name, path: path + name, get: () => h.getFile() });
    }
  }
  async function pickFolder() {
    if (canFS) {
      let dir;
      try { dir = await window.showDirectoryPicker({ id: 'hm4-arw-src', mode: 'read' }); } catch { return; } // vazgeçildi
      $('[data-arw-folder]').disabled = true; $('[data-arw-folder]').textContent = 'Taranıyor…';
      try { await walk(dir, `${dir.name}/`); } finally { $('[data-arw-folder]').disabled = false; $('[data-arw-folder]').textContent = 'Klasör seç'; }
      folders++; match(dir.name);
    } else $('[data-arw-input]').click();
  }
  $('[data-arw-input]').addEventListener('change', (e) => {
    const list = [...e.target.files];
    if (!list.length) return;
    for (const f of list) if (!f.name.startsWith('.')) files.push({ name: f.name, path: f.webkitRelativePath || f.name, get: async () => f });
    folders++; match((list[0].webkitRelativePath || '').split('/')[0] || 'Klasör');
    e.target.value = '';
  });
  $('[data-arw-folder]').addEventListener('click', pickFolder);
  $('[data-arw-more]').addEventListener('click', pickFolder);

  async function match(label) {
    const raws = new Map(), jpgs = new Set();
    for (const f of files) {
      const e = ext(f.name), k = key(f.name);
      if (RAW.has(e)) { if (!raws.has(k)) raws.set(k, []); if (!raws.get(k).some((x) => x.path === f.path)) raws.get(k).push(f); } else if (JPG.has(e)) jpgs.add(k);
    }
    const xmp = new Map(files.filter((f) => ext(f.name) === 'xmp').map((f) => [`${f.path.replace(/\.xmp$/i, '')}`.toUpperCase(), f]));
    found = new Map(); missing = []; total = 0;
    for (const n of want) {
      const k = key(n), hit = raws.get(k);
      if (hit) found.set(n, hit.map((f) => ({ f, side: xmp.get(f.path.replace(/\.[^.]+$/, '').toUpperCase()) || null })));
      else missing.push({ n, why: jpgs.has(k) ? 'yalnızca JPG var' : 'klasörde yok' });
    }
    // Boyut (yalnızca bulunanlar)
    for (const list of found.values()) for (const x of list) { try { const file = await x.f.get(); x.size = file.size; total += file.size; } catch { x.size = 0; } }
    $('[data-arw-scanned]').innerHTML = '';
    $('[data-arw-scanned]').append(`${folders > 1 ? `${folders} klasör` : `Klasör: `}`, Object.assign(document.createElement('b'), { textContent: folders > 1 ? '' : label }), ` · ${files.length.toLocaleString('tr-TR')} dosya tarandı`);
    $('[data-arw-found]').textContent = String(found.size);
    $('[data-arw-size]').textContent = `ARW bulundu · ${gb(total)}`;
    $('[data-arw-missn]').textContent = String(missing.length);
    $('[data-arw-misswrap]').hidden = !missing.length;
    const ul = $('[data-arw-miss]'); ul.textContent = '';
    for (const m of missing) { const li = document.createElement('li'); li.append(m.n, Object.assign(document.createElement('span'), { textContent: m.why })); ul.appendChild(li); }
    const dups = [...found.entries()].filter(([, l]) => l.length > 1);
    $('[data-arw-dupwrap]').hidden = !dups.length;
    const du = $('[data-arw-dup]'); du.textContent = '';
    for (const [n, l] of dups) { const li = document.createElement('li'); li.append(n, Object.assign(document.createElement('span'), { textContent: l.map((x) => x.f.path).join(' · ') })); du.appendChild(li); }
    const count = [...found.values()].reduce((a, l) => a + l.length, 0);
    const btn = $('[data-arw-copy]');
    btn.textContent = canFS ? `${count} ARW'yi kopyala` : `${count} ARW'yi ZIP olarak indir`;
    btn.disabled = !count;
    $('[data-arw-howto]').textContent = canFS
      ? `Kopyalanacak yeri seçeceksiniz; içinde "${safe(`${couple} – Albüm ARW`)}" klasörü açılır. Orijinallere dokunulmaz. Varsa Lightroom ayar dosyaları (XMP) da kopyalanır.`
      : 'Dosyalar ZIP olarak indirilir; orijinallere dokunulmaz.';
    step(2); show('[data-arw-check]');
  }

  // Kopyalanacak liste: aynı numaradan ikinci dosyaya "(2)" eklenir
  function plan() {
    const out = [], used = new Set();
    const uniq = (name) => { let n = name, i = 2; const [b, e] = [name.replace(/\.[^.]+$/, ''), (/\.[^.]+$/.exec(name) || [''])[0]]; while (used.has(n.toUpperCase())) n = `${b} (${i++})${e}`; used.add(n.toUpperCase()); return n; };
    for (const list of found.values()) for (const x of list) {
      const name = uniq(x.f.name);
      out.push({ name, src: x.f, size: x.size || 0 });
      if (x.side) out.push({ name: name.replace(/\.[^.]+$/, '') + '.xmp', src: x.side, size: 0 });
    }
    return out;
  }

  let t0 = 0, done = 0;
  function progress(nFile, nAll) {
    $('[data-arw-prog]').value = total ? Math.min(1, done / total) : nFile / nAll;
    $('[data-arw-pt]').textContent = `${nFile} / ${nAll} dosya · ${gb(done)} / ${gb(total)}`;
    const el = (Date.now() - t0) / 1000;
    if (done > 0 && el > 2) { const left = Math.max(0, Math.round(el * (total - done) / done)); $('[data-arw-eta]').textContent = left > 90 ? `~${Math.round(left / 60)} dk kaldı` : `~${left} sn kaldı`; }
  }
  const counter = () => new TransformStream({ transform(chunk, c) { done += chunk.byteLength; c.enqueue(chunk); } });

  $('[data-arw-copy]').addEventListener('click', async () => {
    const items = plan();
    const raws = items.filter((x) => RAW.has(ext(x.name))).length;
    let dest = null;
    if (canFS) {
      try { dest = await window.showDirectoryPicker({ id: 'hm4-arw-dest', mode: 'readwrite', startIn: 'desktop' }); } catch { return; }
      try { dest = await dest.getDirectoryHandle(safe(`${couple} – Albüm ARW`), { create: true }); } catch (err) { alertBox(`Klasör açılamadı: ${err.message}`); return; }
    }
    step(3); show('[data-arw-run]'); t0 = Date.now(); done = 0;
    window.addEventListener('beforeunload', guard);
    try {
      if (canFS) {
        let i = 0;
        for (const it of items) {
          const file = await it.src.get();
          const fh = await dest.getFileHandle(it.name, { create: true });
          const w = await fh.createWritable();
          await file.stream().pipeThrough(counter()).pipeTo(w);
          progress(++i, items.length);
        }
      } else await zipDownload(items);
      finish(raws, canFS ? safe(`${couple} – Albüm ARW`) : null);
    } catch (err) {
      $('[data-arw-runt]').textContent = `Kopyalama durdu: ${err.message || err}`;
    } finally { window.removeEventListener('beforeunload', guard); }
  });
  function guard(e) { e.preventDefault(); e.returnValue = ''; }
  function alertBox(msg) { $('[data-arw-howto]').textContent = msg; }

  function finish(n, folder) {
    $('[data-arw-donet]').textContent = `${n} ARW hazır`;
    const p = $('[data-arw-donep]'); p.textContent = '';
    p.append(folder ? `Seçtiğiniz yerde › ` : 'ZIP dosyası indirildi.', folder ? Object.assign(document.createElement('b'), { textContent: folder }) : '');
    if (missing.length) p.append(document.createElement('br'), `${missing.length} kare bulunamadı.`);
    $('[data-arw-copymiss]').hidden = !missing.length;
    step(4); show('[data-arw-done]');
  }
  $('[data-arw-copymiss]').addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(missing.map((m) => m.n).join(' ')); e.target.textContent = 'Kopyalandı ✓'; } catch { window.prompt('Bulunamayanlar:', missing.map((m) => m.n).join(' ')); }
  });

  // ── ZIP (sıkıştırmasız). Dosyalar belleğe alınmaz; yalnızca CRC için okunur. 3,5 GB'ta parçalara bölünür. ──
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  async function crcOf(file) {
    let c = 0xFFFFFFFF; const r = file.stream().getReader();
    for (;;) { const { done: d, value } = await r.read(); if (d) break; for (let i = 0; i < value.length; i++) c = CRC[(c ^ value[i]) & 0xFF] ^ (c >>> 8); done += value.length; }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  async function zipDownload(items) {
    const LIMIT = 3.5e9; let part = [], size = 0, n = 1, i = 0;
    const flush = () => { if (!part.length) return; save(part, n++); part = []; size = 0; };
    for (const it of items) {
      const file = await it.src.get();
      if (size + file.size > LIMIT) flush();
      part.push({ name: it.name, file, crc: await crcOf(file) }); size += file.size;
      progress(++i, items.length);
    }
    flush();
  }
  function save(entries, n) {
    const enc = new TextEncoder(), blobs = [], central = []; let off = 0;
    const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)), dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate());
    for (const e of entries) {
      const nm = enc.encode(e.name), h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true);
      h.setUint32(14, e.crc, true); h.setUint32(18, e.file.size, true); h.setUint32(22, e.file.size, true); h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
      blobs.push(h.buffer, nm, e.file);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true);
      c.setUint32(16, e.crc, true); c.setUint32(20, e.file.size, true); c.setUint32(24, e.file.size, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
      central.push(c.buffer, nm);
      off += 30 + nm.length + e.file.size;
    }
    const cs = central.reduce((a, b) => a + b.byteLength, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, cs, true); end.setUint32(16, off, true);
    const url = URL.createObjectURL(new Blob([...blobs, ...central, end.buffer], { type: 'application/zip' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: ascii(`${couple} - Album ARW${n > 1 ? ` (${n})` : ''}.zip`) });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 600000);
  }
})();
