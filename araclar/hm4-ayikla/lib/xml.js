'use strict';
// Premiere'e aktarılacak XML (Final Cut Pro 7 XML; Premiere: Dosya › İçe aktar).
// Her seçme bir sekansta arka arkaya dizilir; sınıflandırılmışsa her sınıf için ayrı sekans da üretilir.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function rateOf(fps) {
  const ntsc = Math.abs(fps - Math.round(fps)) > 0.01; // 29.97, 23.976, 59.94
  const tb = Math.round(ntsc ? fps * 1.001 : fps);
  return { tb, ntsc, real: ntsc ? (tb * 1000) / 1001 : tb };
}
const rateXml = (r) => `<rate><timebase>${r.tb}</timebase><ntsc>${r.ntsc ? 'TRUE' : 'FALSE'}</ntsc></rate>`;
const pathUrl = (p) => 'file://localhost' + encodeURI(p).replace(/#/g, '%23').replace(/\?/g, '%3F');

// Sekansın ayarı: kliplerin çoğunluğunun çözünürlüğü ve normal (yavaşlatma için çekilmemiş) fps'i
function sequenceFormat(clips) {
  const count = (arr) => { const m = new Map(); for (const v of arr) m.set(v, (m.get(v) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]; };
  const fpsList = clips.map((c) => rateOf(c.fps).tb);
  const minTb = Math.min(...fpsList);
  // Yüksek fps'li (slow için) klipler sekansı belirlemesin: en düşük fps'in 1,5 katından küçük olanların çoğunluğu
  const normal = fpsList.filter((f) => f < minTb * 1.5);
  const tb = count(normal) || minTb;
  const fpsRef = clips.find((c) => rateOf(c.fps).tb === tb)?.fps || tb;
  const size = count(clips.map((c) => `${c.genislik}x${c.yukseklik}`)) || '1920x1080';
  const [w, h] = size.split('x').map(Number);
  return { rate: rateOf(fpsRef), w, h };
}

function sequence(id, name, items, fmt) {
  const sr = fmt.rate;
  let t = 0;
  const v = [], a = [], markers = [];
  items.forEach(({ clip, s }, k) => {
    const cr = rateOf(clip.fps);
    const inF = Math.round(s.bas * cr.real), outF = Math.round(s.son * cr.real);
    const len = Math.max(1, Math.round((s.son - s.bas) * sr.real));
    const total = Math.round(clip.sure * cr.real);
    const fileId = `file-${clip.idx}`;
    const fileXml = clip._fileWritten ? `<file id="${fileId}"/>` : `<file id="${fileId}"><name>${esc(clip.ad)}</name><pathurl>${esc(pathUrl(clip.yol))}</pathurl>${rateXml(cr)}<duration>${total}</duration><media><video><samplecharacteristics>${rateXml(cr)}<width>${clip.genislik}</width><height>${clip.yukseklik}</height></samplecharacteristics></video>${clip.ses ? `<audio><samplecharacteristics><depth>16</depth><samplerate>${clip.ses.rate}</samplerate></samplecharacteristics><channelcount>${clip.ses.channels}</channelcount></audio>` : ''}</media></file>`;
    clip._fileWritten = true;
    const label = [s.id, s.sinif, s.not].filter(Boolean).join(' · ');
    v.push(`<clipitem id="${id}-v${k}"><name>${esc(label)}</name><enabled>TRUE</enabled><duration>${total}</duration>${rateXml(cr)}<start>${t}</start><end>${t + len}</end><in>${inF}</in><out>${outF}</out>${fileXml}${clip.ses ? `<link><linkclipref>${id}-v${k}</linkclipref><mediatype>video</mediatype><trackindex>1</trackindex><clipindex>${k + 1}</clipindex></link><link><linkclipref>${id}-a${k}</linkclipref><mediatype>audio</mediatype><trackindex>1</trackindex><clipindex>${k + 1}</clipindex></link>` : ''}</clipitem>`);
    if (clip.ses) a.push(`<clipitem id="${id}-a${k}"><name>${esc(label)}</name><enabled>TRUE</enabled><duration>${total}</duration>${rateXml(cr)}<start>${t}</start><end>${t + len}</end><in>${inF}</in><out>${outF}</out><file id="${fileId}"/><sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack></clipitem>`);
    markers.push(`<marker><name>${esc(s.id)}</name><comment>${esc([s.sinif, s.not, `puan ${s.puan}`].filter(Boolean).join(' · '))}</comment><in>${t}</in><out>-1</out></marker>`);
    t += len;
  });
  return `<sequence id="${id}"><name>${esc(name)}</name><duration>${t}</duration>${rateXml(sr)}<media><video><format><samplecharacteristics>${rateXml(sr)}<width>${fmt.w}</width><height>${fmt.h}</height><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></format><track>${v.join('')}</track></video><audio><track>${a.join('')}</track></audio></media>${markers.join('')}</sequence>`;
}

const CLASS_ORDER = ['Hazırlık', 'Detay', 'Mekân / atmosfer', 'Çift', 'Aile', 'Misafir', 'Tören / önemli an', 'Eğlence / dans'];

/** ayiklama.json verisinden XML üretir */
function buildXml(data) {
  const clips = data.klipler.filter((c) => c.durum === 'tamam').map((c, idx) => ({ ...c, idx: idx + 1 }));
  if (!clips.length) return null;
  const fmt = sequenceFormat(clips);
  const used = [], spare = [];
  for (const c of clips) {
    for (const s of c.secmeler) if (s.kullan !== false) used.push({ clip: c, s });
    for (const s of c.yedekler || []) spare.push({ clip: c, s });
  }
  const seqs = [];
  const title = data.baslik || 'HM4 Ayıklama';
  seqs.push(sequence('seq-all', `${title} – Tüm seçmeler (${used.length})`, used, fmt));
  const classes = [...new Set(used.map((x) => x.s.sinif).filter(Boolean))].sort((a, b) => (CLASS_ORDER.indexOf(a) + 99) % 99 - (CLASS_ORDER.indexOf(b) + 99) % 99 || a.localeCompare(b, 'tr'));
  classes.forEach((cl, i) => { const list = used.filter((x) => x.s.sinif === cl); seqs.push(sequence(`seq-c${i}`, `${title} – ${cl} (${list.length})`, list, fmt)); });
  if (spare.length) seqs.push(sequence('seq-spare', `${title} – Yedekler (${spare.length})`, spare, fmt));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n<xmeml version="4"><project><name>${esc(title)}</name><children><bin><name>${esc(title)}</name><children>${seqs.join('')}</children></bin></children></project></xmeml>\n`;
}

module.exports = { buildXml, sequenceFormat, rateOf, CLASS_ORDER };
