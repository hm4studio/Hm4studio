'use strict';
// Claude için MCP sunucusu (stdio, satır satır JSON-RPC). Ek paket gerektirmez.
const fs = require('node:fs');
const path = require('node:path');
const { runFolder, load, classify, outDir } = require('./run');
const { CLASS_ORDER } = require('./xml');
const VERSION = require('../package.json').version;

const jobs = new Map(); // klasör → { durum, oran, metin, hata, data, promise }
const abs = (k) => path.resolve(String(k || '').replace(/^~(?=\/)/, process.env.HOME || '~'));

const TOOLS = [
  {
    name: 'ayikla',
    description: 'Bir klasördeki bütün videoları ayıklar: her klipten 4–5 sn\'lik, net, sarsıntısız ve birbirine benzemeyen seçmeler çıkarır; kötü kısımları (sarsıntı, odak dışı, karanlık, kapalı lens) eler, aynı anın tekrarlarını yedeğe ayırır. Uzun sürebilir: sonuç hemen gelmezse ayikla_durum ile takip et. Daha önce incelenen klipler önbellekten hızlı gelir.',
    inputSchema: { type: 'object', properties: {
      klasor: { type: 'string', description: 'Ham kliplerin olduğu klasörün tam yolu (ör. /Volumes/Disk/HilalBaran/Klipler)' },
      min: { type: 'number', description: 'Seçme en kısa süre (sn), varsayılan 4' },
      max: { type: 'number', description: 'Seçme en uzun süre (sn), varsayılan 5' },
      benzerlik: { type: 'string', enum: ['siki', 'normal', 'gevsek'], description: 'Benzer seçmeleri eleme sıkılığı. siki: daha çok eler; gevsek: daha çok seçme bırakır. Varsayılan normal.' },
      sarsinti: { type: 'string', enum: ['siki', 'normal', 'gevsek'], description: 'Sarsıntı toleransı. Elde çekimlerin çoğu eleniyorsa gevsek, sadece çok sabit planlar istenirse siki. Varsayılan normal.' },
      enFazla: { type: 'number', description: 'Bir klipten en fazla seçme sayısı, varsayılan 8' },
      altKlasorler: { type: 'boolean', description: 'Alt klasörlerdeki videolar da dahil edilsin mi' },
      yeniden: { type: 'boolean', description: 'Seçmeleri yeni ayarlarla yeniden hesapla (analiz önbellekten gelir)' },
    }, required: ['klasor'] },
  },
  {
    name: 'ayikla_durum',
    description: 'Ayıklamanın ilerlemesini ya da bittiyse klip klip özetini verir (seçmeler, yedekler, elenen kısımlar ve nedenleri).',
    inputSchema: { type: 'object', properties: { klasor: { type: 'string' } }, required: ['klasor'] },
  },
  {
    name: 'secmeleri_goster',
    description: 'Seçmelerin kare şeritlerini (her seçmenin başından, ortasından, sonundan birer kare) görüntü olarak verir. Her seçmeye bakıp sınıflandır ve kullanılamaz olanları (göz kapalı, biri önden geçiyor, yere çekilmiş, kötü ifade) işaretle. Sayfa sayfa ilerle.',
    inputSchema: { type: 'object', properties: {
      klasor: { type: 'string' },
      sayfa: { type: 'number', description: '1\'den başlar' },
      adet: { type: 'number', description: 'Sayfa başına seçme (en fazla 10, varsayılan 8)' },
      hangileri: { type: 'string', enum: ['siniflanmamis', 'secmeler', 'yedekler', 'hepsi'], description: 'Varsayılan siniflanmamis' },
    }, required: ['klasor'] },
  },
  {
    name: 'siniflandir',
    description: `Seçmelere sınıf, not ve kullanılabilirlik yazar; Premiere XML'i sınıflara göre yeniler. Sınıflar: ${CLASS_ORDER.join(', ')}. kullan:false kullanılamaz demektir; bir yedeği kullan:true yaparsan seçmelere taşınır. Notta anı kısaca yaz (ör. "yüzük takılıyor", "gelin gülüyor, dönüş - ramp için uygun").`,
    inputSchema: { type: 'object', properties: {
      klasor: { type: 'string' },
      liste: { type: 'array', items: { type: 'object', properties: {
        id: { type: 'string', description: 'Seçme kimliği, ör. C0003_s2' },
        sinif: { type: 'string', enum: CLASS_ORDER },
        not: { type: 'string' },
        kullan: { type: 'boolean' },
      }, required: ['id'] } },
    }, required: ['klasor', 'liste'] },
  },
  {
    name: 'secme_listesi',
    description: 'Bütün seçmelerin kısa listesi: kimlik, dosya, başlangıç–bitiş (sn), süre, sınıf, not, puan, fps. Kurguyu planlarken ve Premiere\'e yerleştirirken kullan.',
    inputSchema: { type: 'object', properties: { klasor: { type: 'string' }, sinif: { type: 'string', enum: CLASS_ORDER } }, required: ['klasor'] },
  },
  {
    name: 'premiere_xml',
    description: 'Seçmeleri Premiere\'e aktarılacak XML dosyasının yolunu verir (Dosya › İçe aktar). İçinde "Tüm seçmeler", her sınıf için ayrı sekans ve "Yedekler" sekansı vardır; her seçmenin başında kimliğiyle marker bulunur.',
    inputSchema: { type: 'object', properties: { klasor: { type: 'string' } }, required: ['klasor'] },
  },
];

const fmtSec = (v) => v.toFixed(1).replace('.', ',');
function summaryText(data, detay = true) {
  const o = data.ozet;
  const lines = [`Ayıklama tamam: ${o.klip} klip → ${o.secme} seçme (${o.sure} sn), ${o.yedek} yedek${o.hata ? `, ${o.hata} klip okunamadı` : ''}${o.secmesizKlip ? `, ${o.secmesizKlip} klipte kullanılabilir kısım yok` : ''}. Sınıflanan: ${o.siniflanan}/${o.secme}.`];
  if (detay) for (const c of data.klipler) {
    if (c.durum !== 'tamam') { lines.push(`• ${c.ad}: okunamadı (${c.hata})`); continue; }
    const s = c.secmeler.map((x) => `${x.id} ${fmtSec(x.bas)}–${fmtSec(x.son)}${x.sinif ? ` [${x.sinif}]` : ''}${x.kullan === false ? ' (kullanılmaz)' : ''}`).join(', ') || 'seçme yok';
    const r = c.reddedilen.length ? ` · elenen: ${c.reddedilen.map((x) => `${fmtSec(x.bas)}–${fmtSec(x.son)} ${x.neden}`).join(', ')}` : '';
    const y = c.yedekler.length ? ` · yedek: ${c.yedekler.map((x) => `${x.id}${x.benzer ? `≈${x.benzer}` : ''}`).join(', ')}` : '';
    lines.push(`• ${c.ad} (${c.fps} fps, ${fmtSec(c.sure)} sn): ${s}${y}${r}`);
  }
  lines.push(`Premiere XML: ${path.join(outDir(data.klasor), `${data.baslik} - Seçmeler.xml`)}`);
  return lines.join('\n');
}

function startJob(klasor, args) {
  const cur = jobs.get(klasor);
  if (cur && cur.durum === 'calisiyor') return cur;
  const job = { durum: 'calisiyor', oran: 0, metin: 'Başlıyor', basladi: Date.now() };
  job.promise = runFolder(klasor, { ...args, onProgress: (t, p) => { job.metin = t; job.oran = p; } })
    .then((data) => { job.durum = 'tamam'; job.data = data; })
    .catch((err) => { job.durum = 'hata'; job.hata = err.message; });
  jobs.set(klasor, job);
  return job;
}

const text = (t) => ({ content: [{ type: 'text', text: t }] });
const fail = (t) => ({ content: [{ type: 'text', text: t }], isError: true });

async function call(name, a) {
  const klasor = abs(a.klasor);
  if (name === 'ayikla') {
    if (!a.yeniden) { try { const d = load(klasor); if (!jobs.has(klasor)) return text(`Bu klasör daha önce ayıklanmış (${new Date(d.tarih).toLocaleString('tr-TR')}). Yeni ayarla yeniden hesaplamak için yeniden:true gönder.\n\n${summaryText(d)}`); } catch { /* ilk kez */ } }
    const job = startJob(klasor, { min: a.min, max: a.max, benzerlik: a.benzerlik, sarsinti: a.sarsinti, enFazla: a.enFazla, altKlasorler: a.altKlasorler });
    await Promise.race([job.promise, new Promise((r) => setTimeout(r, 40000))]);
    if (job.durum === 'tamam') return text(summaryText(job.data));
    if (job.durum === 'hata') return fail(`Ayıklama yapılamadı: ${job.hata}`);
    return text(`Ayıklama sürüyor: %${Math.round(job.oran * 100)} · ${job.metin}. Birkaç dakika sonra ayikla_durum ile kontrol et.`);
  }
  if (name === 'ayikla_durum') {
    const job = jobs.get(klasor);
    if (job && job.durum === 'calisiyor') return text(`Sürüyor: %${Math.round(job.oran * 100)} · ${job.metin} · ${Math.round((Date.now() - job.basladi) / 1000)} sn geçti.`);
    if (job && job.durum === 'hata') return fail(`Ayıklama yapılamadı: ${job.hata}`);
    return text(summaryText(load(klasor)));
  }
  if (name === 'secmeleri_goster') {
    const d = load(klasor);
    const which = a.hangileri || 'siniflanmamis';
    let list = [];
    for (const c of d.klipler) {
      if (which !== 'yedekler') list.push(...c.secmeler.map((s) => ({ c, s, y: false })));
      if (which === 'yedekler' || which === 'hepsi') list.push(...c.yedekler.map((s) => ({ c, s, y: true })));
    }
    if (which === 'siniflanmamis') list = list.filter((x) => !x.s.sinif && x.s.kullan !== false);
    const per = Math.max(1, Math.min(10, a.adet || 8));
    const page = Math.max(1, a.sayfa || 1);
    const pages = Math.max(1, Math.ceil(list.length / per));
    const slice = list.slice((page - 1) * per, page * per);
    if (!slice.length) return text(which === 'siniflanmamis' ? 'Sınıflanmamış seçme kalmadı.' : 'Bu sayfada seçme yok.');
    const content = [{ type: 'text', text: `Sayfa ${page}/${pages} · ${list.length} seçme. Her görüntü bir seçmenin başı | ortası | sonu.` }];
    for (const { c, s, y } of slice) {
      content.push({ type: 'text', text: `${s.id}${y ? ' (yedek' + (s.benzer ? `, ${s.benzer}'e benzer` : '') + ')' : ''} · ${c.ad} ${fmtSec(s.bas)}–${fmtSec(s.son)} sn · ${c.fps} fps · puan ${s.puan}${s.sinif ? ` · ${s.sinif}` : ''}${s.not ? ` · ${s.not}` : ''}` });
      const img = s.serit && path.join(outDir(klasor), s.serit);
      if (img && fs.existsSync(img)) content.push({ type: 'image', data: fs.readFileSync(img).toString('base64'), mimeType: 'image/jpeg' });
    }
    return { content };
  }
  if (name === 'siniflandir') {
    const { data, unknown } = classify(klasor, a.liste);
    return text(`Kaydedildi. Sınıflanan ${data.ozet.siniflanan}/${data.ozet.secme} seçme.${unknown.length ? ` Bulunamayan kimlikler: ${unknown.join(', ')}` : ''} Premiere XML yenilendi.`);
  }
  if (name === 'secme_listesi') {
    const d = load(klasor);
    const rows = ['kimlik | dosya | baş–son (sn) | süre | fps | sınıf | not | puan'];
    for (const c of d.klipler) for (const s of c.secmeler) {
      if (s.kullan === false || (a.sinif && s.sinif !== a.sinif)) continue;
      rows.push(`${s.id} | ${c.dosya} | ${fmtSec(s.bas)}–${fmtSec(s.son)} | ${fmtSec(s.sure)} | ${c.fps} | ${s.sinif || '-'} | ${s.not || '-'} | ${s.puan}`);
    }
    return text(`Klasör: ${d.klasor}\n${rows.join('\n')}`);
  }
  if (name === 'premiere_xml') {
    const d = load(klasor);
    const p = path.join(outDir(klasor), `${d.baslik} - Seçmeler.xml`);
    return text(`${p}\nPremiere'de: Dosya › İçe aktar (File › Import) › bu dosyayı seçin. Proje panelinde "${d.baslik}" klasörü içinde seçme sekansları gelir.`);
  }
  return fail(`Bilinmeyen araç: ${name}`);
}

function serve() {
  if (process.platform === 'darwin') process.env.PATH = `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`; // Claude uygulaması ffmpeg'i bulsun
  let buf = '';
  const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      handle(msg).then((res) => { if (res !== undefined && msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, ...res }); });
    }
  });
  async function handle(m) {
    try {
      switch (m.method) {
        case 'initialize': return { result: {
          protocolVersion: (m.params && m.params.protocolVersion) || '2025-06-18',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'hm4-ayikla', version: VERSION },
          instructions: 'HM4 klip ayıklama. Önce ayikla ile klasörü ayıkla, sonra secmeleri_goster ile kareleri incele ve siniflandir ile sınıf/not yaz. Kurgu için secme_listesi, Premiere için premiere_xml kullan.',
        } };
        case 'ping': return { result: {} };
        case 'tools/list': return { result: { tools: TOOLS } };
        case 'tools/call': {
          const { name, arguments: args = {} } = m.params || {};
          try { return { result: await call(name, args) }; } catch (err) { return { result: fail(err.message) }; }
        }
        default:
          return m.id !== undefined && !String(m.method || '').startsWith('notifications/') ? { error: { code: -32601, message: `Desteklenmeyen: ${m.method}` } } : undefined;
      }
    } catch (err) { return { error: { code: -32603, message: err.message } }; }
  }
}

module.exports = { serve, call, TOOLS };
