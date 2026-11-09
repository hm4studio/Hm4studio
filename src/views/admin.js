'use strict';
// Yönetim paneli sayfaları.
const { h, raw } = require('./html');
const { panelLayout, statusBar, flash, icon } = require('./components');
const { photoTile, galleryTabs, logoutForm, formatDate, albumBar, planView } = require('./panel');
const { jobStatus, daysBetween, today, addDays } = require('../jobs');
const { displayPhone, taskText } = require('../whatsapp');
const { payment, tl, shortDate, eventIndexes } = require('../appointments');
const journey = require('./journey');
const config = require('../config');

const SETTINGS_KEYS = ['gifts', 'cities', 'messages', 'contract', 'account', 'feedback', 'portfolio', 'team', 'packages', 'site', 'data'];
function adminNav(active, csrf, demoAdmin = false) {
  const items = [
    { href: '/admin', label: 'Bugün', key: 'couples', icon: 'users' },
    { href: '/admin/talepler', label: 'Talepler', key: 'leads', icon: 'whatsapp' },
    { href: '/admin/takvim', label: 'Takvim', key: 'calendar', icon: 'clock' },
    { href: '/admin/rapor', label: 'Rapor', key: 'report', icon: 'chart' },
    { href: '/admin/hesap', label: 'Ayarlar', key: 'settings', icon: 'settings' },
  ];
  const cur = SETTINGS_KEYS.includes(active) ? 'settings' : active;
  return h`<nav class="panel-nav" aria-label="Yönetim menüsü">
    ${items.map((i) => h`<a class="panel-nav__link" href="${i.href}"${i.key === cur ? raw(' aria-current="page"') : ''}>${icon(i.icon)}<span>${i.label}</span></a>`)}
    ${logoutForm(csrf)}
  </nav>`;
}

// Telefonda alttaki sekme menüsü
function adminTabs(active, demoAdmin = false) {
  return [
    { href: '/admin', label: 'Bugün', icon: 'users', active: active === 'couples' },
    { href: '/admin/talepler', label: 'Talepler', icon: 'whatsapp', active: active === 'leads' },
    { href: '/admin/takvim', label: 'Takvim', icon: 'clock', active: active === 'calendar' },
    { href: '/admin/rapor', label: 'Rapor', icon: 'chart', active: active === 'report' },
    { href: '/admin/hesap', label: 'Ayarlar', icon: 'settings', active: SETTINGS_KEYS.includes(active) },
  ];
}

const csrfField = (csrf) => h`<input type="hidden" name="csrf" value="${csrf}">`;

function flashBlock(f) {
  if (!f) return '';
  const cr = f.credentials;
  const text = cr?.text ? cr.text : cr ? `Merhaba ${cr.name || ''}, HM4 Studio panelinize bu bağlantıya dokunarak girebilirsiniz:\n${cr.link || cr.url}\n\nUygulamayı telefonunuzun ana ekranına eklerseniz ilk girişte bu bilgiler istenir:\nErişim kodu: ${cr.code}\nŞifre: ${cr.password}` : '';
  return h`
  ${flash(f.message, f.type)}
  ${cr ? h`
  <div class="credentials creds" role="status">
    <p class="creds__title">Çiftin giriş bilgileri${cr.sent ? h` <span class="muted">· WhatsApp'tan otomatik gönderildi</span>` : ''}</p>
    <div class="creds__grid">
      <div><span class="creds__label">Erişim kodu</span><span class="creds__value">${cr.code}</span></div>
      <div><span class="creds__label">Şifre</span><span class="creds__value">${cr.password}</span></div>
    </div>
    <p class="creds__url">${cr.link || cr.url}</p>
    <div class="creds__actions">
      ${cr.phone ? h`<a class="btn btn--primary btn--sm" href="https://wa.me/${cr.phone}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">${icon('whatsapp')}WhatsApp'tan gönder</a>` : h`<a class="btn btn--primary btn--sm" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">${icon('whatsapp')}WhatsApp'tan gönder</a>`}
      <button type="button" class="btn btn--outline btn--sm" data-copy="${text}">Mesajı kopyala</button>
    </div>
    <p class="creds__note">Şifre güvenlik nedeniyle yalnızca şimdi gösterilir. Kaybolursa "Şifre yenile" ile yenisini oluşturun.</p>
  </div>` : ''}`;
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
// Etkinlik türü renkleri (takvim, kartlar, etiketler)
const TYPE_CLASS = { 'Düğün': 'dugun', 'Nişan': 'nisan', 'Kına': 'kina', 'Söz': 'soz', 'Dış Çekim': 'dis' };
const typeClass = (t) => `t-${TYPE_CLASS[t] || 'diger'}`;
const typeChips = (types) => String(types || '').split(', ').filter(Boolean).map((t) => h`<span class="tchip ${typeClass(t)}">${t}</span>`);
const relDays = (n) => (n === 0 ? 'bugün' : n === 1 ? 'yarın' : n > 0 ? `${n} gün sonra` : `${-n} gün önce`);
const longDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });

// Ay takvimi: her günde o günün etkinlikleri (bir çiftin farklı günlerdeki etkinlikleri ayrı ayrı görünür)
function monthCalendar(monthEvents, ym, base = '/admin/takvim') {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // pazartesi başlangıç
  const t = today();
  const byDay = new Map();
  for (const e of monthEvents) {
    const d = Number(e.event_date.slice(8));
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(e);
  }
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysIn; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return h`
  <section class="cal" aria-labelledby="cal-title">
    <div class="cal__head">
      <h2 class="sec-title" id="cal-title">${MONTHS[m - 1]} <span class="sec-light">${y}</span></h2>
      <div class="cal__nav">
        <a class="cal__btn" href="${base}?ay=${prev}" aria-label="Önceki ay">${icon('left')}</a>
        <a class="cal__today" href="${base}">Bu ay</a>
        <a class="cal__btn" href="${base}?ay=${next}" aria-label="Sonraki ay">${icon('right')}</a>
      </div>
    </div>
    <div class="cal__grid" role="grid">
      ${DAYS.map((d) => h`<div class="cal__dow" role="columnheader">${d}</div>`)}
      ${cells.map((d) => {
        if (!d) return h`<div class="cal__cell cal__cell--empty"></div>`;
        const iso = `${ym}-${String(d).padStart(2, '0')}`;
        const list = byDay.get(d) || [];
        return h`<div class="cal__cell${iso === t ? ' is-today' : ''}${list.length > 1 ? ' is-busy' : ''}" role="gridcell">
          <a class="cal__day" href="/admin/randevu/yeni?tarih=${iso}" title="${shortDate(iso)} için randevu oluştur">${d}</a>
          ${list.map((e) => h`<a class="cal__ev" href="/admin/ciftler/${e.couple_id}" title="${e.couple_name} · ${e.event_type || 'Etkinlik'}${e.start_time ? ' · ' + e.start_time : ''}">
            <span class="cal__ev-time">${e.start_time || ''}</span><span class="cal__ev-name">${e.couple_name}</span></a>`)}
        </div>`;
      })}
    </div>
    <p class="cal__hint">Bir güne dokunarak o tarihe randevu oluşturun.</p>
  </section>`;
}

// Program: önümüzdeki 7 gün (bugün dahil), gün gün
function programBlock(c, upcoming, tomorrowDue, reminders = []) {
  const t = today();
  const tm = addDays(t, 1);
  const end = addDays(t, 6);
  const list = upcoming.filter((e) => e.event_date >= t && e.event_date <= end);
  const rems = reminders.filter((r) => r.due_date > t && r.due_date <= end); // bugünküler Yapılacaklar'da
  const later = reminders.filter((r) => r.due_date > end);
  const days = [...new Set([...list.map((e) => e.event_date), ...rems.map((r) => r.due_date)])].sort();
  const rem = (r) => h`
    <li class="prog__rem">
      <a href="/admin/hatirlatma/${r.id}">${icon('bell')}<span class="prog__time">${r.due_time || 'Gün içinde'}</span>${r.title}${r.person ? h` <span class="muted">· ${r.person}</span>` : ''}</a>
    </li>`;
  const dayLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  const shoot = (e) => h`
    <li class="prog__shoot">
      <div class="prog__when"><b>${e.start_time || '—'}</b><span>${e.event_type || 'Etkinlik'}</span></div>
      <div class="prog__box">
        <div class="prog__head">
          <a class="prog__name" href="/admin/ciftler/${e.couple_id}">${e.couple_name}</a>
          ${e.couple_phone ? h`<a class="tmr__call" href="tel:+${e.couple_phone}" aria-label="${e.couple_name} ara">${icon('phone')}</a>` : ''}
        </div>
        ${e.venue || e.city ? h`<p class="prog__line">${[e.venue, e.city].filter(Boolean).join(' · ')}</p>` : ''}
        ${e.team ? h`<p class="prog__team">${String(e.team).split(/,\s*/).map((m) => h`<span class="tav" title="${m}">${initials(m)}</span>`)}</p>` : ''}
        ${e.package_detail ? h`<p class="prog__note">${e.package_detail}</p>` : ''}
      </div>
    </li>`;
  return h`
  <section class="prog" aria-labelledby="prog-title">
    <header class="sec-head">
      <h2 class="sec-title" id="prog-title">${icon('calendar')}Program</h2>
      <span class="sec-note">Önümüzdeki 7 gün</span>
    </header>
    ${days.length ? days.map((d) => h`
    <section class="prog__day${d <= tm ? ' is-tomorrow' : ''}">
      <h3 class="prog__date">${d === t ? h`<span class="prog__tag">Bugün</span>` : d === tm ? h`<span class="prog__tag">Yarın</span>` : ''}${dayLabel(d)}</h3>
      <ul class="prog__list">${list.filter((e) => e.event_date === d).map(shoot)}${rems.filter((r) => r.due_date === d).map(rem)}</ul>
    </section>`) : h`<p class="sec-empty">Önümüzdeki 7 günde çekim yok.</p>`}
    ${later.length ? h`<details class="prog__later"><summary>Sonraki hatırlatmalar (${later.length})</summary><ul class="prog__list">${later.map((r) => h`<li class="prog__rem"><a href="/admin/hatirlatma/${r.id}">${icon('bell')}<span class="prog__time">${formatDate(r.due_date)}${r.due_time ? ` ${r.due_time}` : ''}</span>${r.title}</a></li>`)}</ul></details>` : ''}
    ${tomorrowDue.length ? h`<p class="tmr__due">Yarın teslim: ${tomorrowDue.map((k, i) => h`${i ? ', ' : ''}<a href="/admin/ciftler/${k.id}">${k.name}</a>`)}</p>` : ''}
  </section>`;
}

// Takip listesi: dikkat isteyen işler (en acil üstte)

// Çiftin panele girişi: "bugün 14:20", "dün", "5 gün önce" (kayıtlar UTC)
function seenText(utc) {
  if (!utc) return '';
  const d = new Date(`${utc.replace(' ', 'T')}Z`);
  const local = new Date(d.getTime() + 3 * 3600 * 1000).toISOString();
  const day = local.slice(0, 10);
  const n = daysBetween(day, today());
  if (n <= 0) return `bugün ${local.slice(11, 16)}`;
  if (n === 1) return `dün ${local.slice(11, 16)}`;
  if (n < 30) return `${n} gün önce`;
  return formatDate(day);
}
const SEEN_SINCE = '2026-11-08'; // giriş takibi bu gün başladı; eski çiftler de 3 gün süre alır
function panelSeen(k) {
  return k.last_seen_at ? `Panele son giriş ${seenText(k.last_seen_at)}${k.visit_count > 1 ? ` · ${k.visit_count} kez girdi` : ''}` : 'Panele henüz girmedi';
}

function attentionItems(c, couples) {
  const t = today();
  const last = c.stages.length - 1;
  const items = [];
  for (const k of couples) {
    const pay = payment(k);
    const st = jobStatus(k, c.stages);
    let plan = {};
    try { plan = JSON.parse(k.plan_json || '{}') || {}; } catch { /* boş */ }
    if (st[0] === 'late') items.push({ k, level: 3, text: `Teslim ${daysBetween(k.due_date, t)} gün gecikti`, tag: 'Teslim' });
    else if (st[0] !== 'upcoming' && k.due_date && k.stage < last && k.due_date >= t && daysBetween(t, k.due_date) <= 7) items.push({ k, level: 2, text: `Teslime ${daysBetween(t, k.due_date)} gün kaldı`, tag: 'Teslim' });
    if (k.next_date && pay[2] > 0 && daysBetween(t, k.next_date) <= 14) items.push({ k, level: daysBetween(t, k.next_date) <= 3 ? 3 : 2, text: `Etkinlik ${relDays(daysBetween(t, k.next_date))}, ${tl(pay[2])} bakiye var`, tag: 'Ödeme' });
    if (k.next_date && !plan.saved && daysBetween(t, k.next_date) <= 10) items.push({ k, level: 1, text: 'Gün planı doldurulmadı', ctx: `etkinlik ${relDays(daysBetween(t, k.next_date))}`, tag: 'Plan' });
    if (k.contract_status === 'bekliyor') items.push({ k, level: k.next_date && daysBetween(t, k.next_date) <= 14 ? 2 : 1, text: 'Sözleşme onayı bekleniyor', tag: 'Sözleşme' });
    if (k.deposit_promise > 0 && k.deposit_promise_on && k.deposit_promise_on <= t) items.push({ k, level: k.deposit_promise_on < t ? 3 : 2, text: k.deposit_promise_on < t ? `Kapora sözü geçti: ${tl(k.deposit_promise)} (${formatDate(k.deposit_promise_on)})` : `Kapora günü bugün: ${tl(k.deposit_promise)}`, tag: 'Ödeme' });
    if (k.album_design_state === 'degisiklik') items.push({ k, level: 2, text: 'Albüm tasarımında değişiklik istendi', tag: 'Albüm' });
    if (k.album_design_state === 'onaylandi' && k.album_design_at && daysBetween(k.album_design_at.slice(0, 10), t) <= 3) items.push({ k, level: 1, text: 'Albüm tasarımı onaylandı, baskıya hazır', tag: 'Albüm' });
    if (k.photo_count > 0 && !k.album_locked && k.stage < last) items.push({ k, level: 1, text: `Albüm seçimi bekleniyor (${k.fav_count}/${k.album_limit})`, tag: 'Albüm' });
    if (!k.last_seen_at && k.stage < last && k.created_at && daysBetween([k.created_at.slice(0, 10), SEEN_SINCE].sort().pop(), t) >= 3) items.push({ k, level: 1, text: 'Panele hiç girmedi; giriş bilgilerini yeniden gönderin', tag: 'Panel' });
    const until = journey.keepUntil(c, k);
    if (until && until < t && !k.archived_at && k.photo_count > 0) items.push({ k, level: 1, text: 'İndirme süresi doldu; dosyaları sunucudan silebilirsiniz', tag: 'Dosyalar' });
  }
  // Tavsiye eden çifte borçlu olunan teşekkür hediyeleri
  for (const g of require('../db').giftRewardsDue()) {
    const k = couples.find((x) => x.id === g.couple_id);
    if (k) items.push({ k, level: 1, text: `Teşekkür hediyesi borçlusunuz: ${c.gifts?.reward || 'hediye'} (${g.used_by} kuponla geldi)`, tag: 'Hediye' });
  }
  // Aynı çiftin aynı başlıktaki işleri tek satırda: "Etkinlik yarın, 15.000 ₺ bakiye var · Gün planı doldurulmadı"
  const groups = new Map();
  for (const x of items) {
    const grp = todoGroup(x.tag, x.level);
    const key = `${x.k.id}:${grp}`;
    const g = groups.get(key) || { k: x.k, level: 0, grp, items: [] };
    g.level = Math.max(g.level, x.level);
    g.items.push(x);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => {
    const hasWhen = g.items.some((x) => x.text.startsWith('Etkinlik'));
    const sorted = g.items.sort((a, b) => b.level - a.level);
    return { k: g.k, level: g.level, grp: g.grp, tag: sorted[0].tag, text: sorted.map((x) => (x.ctx && !hasWhen ? `${x.text} (${x.ctx})` : x.text)).join(' · ') };
  }).sort((a, b) => b.level - a.level);
}

// Çift satırı (panelde arama ve süzgeçle)
function coupleCard(c, k) {
  const pay = payment(k);
  const t = today();
  const shown = k.next_date || k.event_date;
  const search = [k.name, k.full_name, k.partner_name, k.ref_no, k.phone, k.types].join(' ').toLocaleLowerCase('tr-TR');
  const done = k.stage >= c.stages.length - 1;
  // Sıralama: önce yaklaşanlar (en yakın üstte), sonra geçmiş etkinlikler (en yeni üstte)
  const sortKey = k.next_date ? `0${k.next_date}` : shown ? `1${99999999 - Number(shown.replace(/-/g, ''))}` : '2';
  const urgent = pay[2] > 0 && k.next_date && daysBetween(t, k.next_date) <= 14;
  return h`<li class="crow${done ? ' is-done' : ''}" data-card data-search="${search}" data-stage="${k.stage}" data-type="${k.types || ''}" data-pay="${pay[0]}" data-date="${sortKey}">
    <a class="crow__link" href="/admin/ciftler/${k.id}">
      <span class="crow__who"><span class="crow__name">${k.name}</span><span class="crow__sub">${k.types || 'Etkinlik yok'}</span></span>
      <span class="crow__date">${shown ? h`<span>${shortDate(shown)}</span><span class="crow__sub">${k.next_date ? relDays(daysBetween(t, shown)) : 'tamamlandı'}</span>` : h`<span class="crow__sub">Tarih yok</span>`}</span>
      <span class="crow__stage">
        <span class="steps" aria-hidden="true">${c.stages.map((s, i) => h`<i class="${i < k.stage ? 'is-done' : i === k.stage ? 'is-now' : ''}"></i>`)}</span>
        <span class="crow__sub">${c.stages[k.stage] || c.stages[0]}${k.video_status ? ` · Video: ${k.video_status.toLocaleLowerCase('tr-TR')}` : ''}</span>
      </span>
      <span class="crow__pay${urgent ? ' is-urgent' : ''}">${pay[0] === 'paid' ? h`<span class="crow__sub">Ödendi</span>` : pay[0] === 'none' ? h`<span class="crow__sub">Tutar yok</span>` : h`<span>${tl(pay[2])}</span><span class="crow__sub">kalan</span>`}</span>
      <span class="crow__ready" aria-label="Hazır olanlar">
        <span class="${k.photo_ready ? 'is-on' : ''}" title="Fotoğraf">F</span><span class="${k.video_ready ? 'is-on' : ''}" title="Video">V</span><span class="${k.album_ready ? 'is-on' : ''}" title="Albüm">A</span><span class="${k.contract_status === 'imzali' ? 'is-on' : ''}" title="${k.contract_status === 'imzali' ? 'Sözleşme onaylandı' : k.contract_status ? 'Sözleşme onay bekliyor' : 'Sözleşme gönderilmedi'}">S</span><span class="${k.last_seen_at ? 'is-on' : ''}" title="${panelSeen(k)}">P</span>
      </span>
    </a>
  </li>`;
}

// Aşama panosu: her aşama bir sütun
function stageBoard(c, couples) {
  return h`<div class="board" data-board hidden>
    ${c.stages.map((s, i) => {
      const list = couples.filter((k) => k.stage === i).sort((a, b) => (a.next_date || a.event_date || '9').localeCompare(b.next_date || b.event_date || '9'));
      return h`<section class="board__col">
        <h3 class="board__head"><span>${s}</span><span class="board__count">${list.length}</span></h3>
        <ul class="board__list">${list.map((k) => {
          const pay = payment(k);
          return h`<li data-bcard data-search="${[k.name, k.full_name, k.partner_name, k.ref_no, k.phone, k.types].join(' ').toLocaleLowerCase('tr-TR')}" data-stage="${k.stage}" data-type="${k.types || ''}" data-pay="${pay[0]}">
            <a class="bcard" href="/admin/ciftler/${k.id}">
              <strong>${k.name}</strong>
              <span class="bcard__meta">${shortDate(k.next_date || k.event_date) || 'Tarih yok'}</span>
              <span class="bcard__meta">${k.types || ''}</span>
              ${pay[2] > 0 ? h`<span class="bcard__pay">${tl(pay[2])} kalan</span>` : ''}
            </a></li>`;
        })}</ul>
      </section>`;
    })}
  </div>`;
}

// Yapılacaklar: bekleyen işler, gönderilecek mesajlar, tamamlanan seçimler, kabul edilen teklifler ve yeni talepler tek listede
const TAG_ICON = { Hatırlatma: ['bell', 'cek'], Teslim: ['gift', 'tes'], Ödeme: ['lira', 'pay'], Plan: ['calendar', 'cek'], Sözleşme: ['sign', 'soz'], Albüm: ['book', 'alb'], Hediye: ['gift', 'alb'], Dosyalar: ['folder', 'vid'], Mesaj: ['whatsapp', 'tes'], Ekip: ['users', 'soz'], Seçim: ['heart', 'sec'], Teklif: ['sign', 'pay'], Talep: ['inbox', 'sec'], Panel: ['users', 'soz'] };
// Yapılacaklar başlıkları: acil olanlar (gecikenler) üstte, diğerleri konusuna göre
const TODO_GROUPS = [
  { key: 'acil', title: 'Acil', icon: 'alert', tone: 'late', open: true },
  { key: 'mesaj', title: 'Gönderilecek mesajlar', icon: 'whatsapp', tone: 'tes', open: true },
  { key: 'hatirlatma', title: 'Hatırlatmalar', icon: 'bell', tone: 'cek', open: true },
  { key: 'soz', title: 'Sözleşme onayı bekleyenler', icon: 'sign', tone: 'soz' },
  { key: 'alb', title: 'Albüm ve seçim', icon: 'book', tone: 'alb' },
  { key: 'pay', title: 'Ödeme ve gün planı', icon: 'lira', tone: 'pay' },
  { key: 'diger', title: 'Diğer', icon: 'folder', tone: 'vid' },
];
const TAG_GROUP = { Mesaj: 'mesaj', Ekip: 'mesaj', Hatırlatma: 'hatirlatma', Sözleşme: 'soz', Albüm: 'alb', Seçim: 'alb', Ödeme: 'pay', Plan: 'pay', Teklif: 'pay' };
function initials(name) {
  const up = (w) => (w || '').charAt(0).toLocaleUpperCase('tr-TR');
  const sides = String(name || '').split('&').map((x) => x.trim().split(/\s+/).filter(Boolean)).filter((x) => x.length);
  if (sides.length > 1) return up(sides[0][0]) + up(sides[1][0]);
  const w = sides[0] || [];
  return (up(w[0]) + (w.length > 1 ? up(w[w.length - 1]) : '')) || '•';
}
function greet() {
  const hr = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false }).format(new Date()));
  return hr < 5 ? 'İyi geceler' : hr < 12 ? 'Günaydın' : hr < 18 ? 'İyi günler' : 'İyi akşamlar';
}
function todoGroup(tag, level) {
  if (TAG_GROUP[tag] === 'mesaj' || TAG_GROUP[tag] === 'hatirlatma') return TAG_GROUP[tag];
  return level >= 3 ? 'acil' : TAG_GROUP[tag] || 'diger';
}
const TAG_TAB = { Teslim: 'teslim', Ödeme: 'odeme', Plan: 'plan', Sözleşme: 'odeme', Albüm: 'album', Hediye: 'hediye', Dosyalar: 'ayar', Panel: 'ayar' };
function todoList(c, { couples, outbox, selections, quotes, newLeads, reminders = [], csrf = '' }) {
  const rows = [];
  const t = today();
  for (const r of reminders.filter((x) => x.due_date <= t)) {
    const late = r.due_date < t;
    rows.push({ grp: 'hatirlatma', level: late ? 3 : 2, tag: 'Hatırlatma', name: r.title, href: `/admin/hatirlatma/${r.id}`,
      text: [late ? `${formatDate(r.due_date)} (geçti)` : r.due_time ? `Bugün ${r.due_time}` : 'Bugün', r.person, r.couple_name, r.note].filter(Boolean).join(' · '),
      actions: h`${r.phone ? h`<a class="btn btn--text btn--sm" href="https://wa.me/${r.phone}" target="_blank" rel="noopener" aria-label="WhatsApp">${icon('whatsapp')}</a><a class="btn btn--text btn--sm" href="tel:+${r.phone}" aria-label="Ara">${icon('phone')}</a>` : ''}
        <form method="post" action="/admin/hatirlatma/${r.id}/ertele" class="inline-form">${csrfField(csrf)}<button class="btn btn--text btn--sm" type="submit" title="Yarına ertele">Yarın</button></form>
        <form method="post" action="/admin/hatirlatma/${r.id}/tamam" class="inline-form">${csrfField(csrf)}<button class="btn btn--primary btn--sm" type="submit">${icon('check')}Tamam</button></form>` });
  }
  for (const x of attentionItems(c, couples)) {
    rows.push({ grp: x.grp, level: x.level, tag: x.tag, name: x.k.name, href: `/admin/ciftler/${x.k.id}`, text: x.text,
      actions: h`<a class="go go--${(TAG_ICON[x.tag] || ['', 'soz'])[1]}" href="/admin/ciftler/${x.k.id}#${TAG_TAB[x.tag] || 'ozet'}" aria-label="${x.k.name} aç">${icon('right')}</a>` });
  }
  for (const x of outbox) {
    rows.push({ grp: 'mesaj', level: 2, tag: x.team ? 'Ekip' : 'Mesaj', name: x.to, href: x.coupleId && !x.team ? `/admin/ciftler/${x.coupleId}` : '', text: x.label, outbox: x,
      actions: h`<a class="btn btn--primary btn--sm" href="${x.href}" target="_blank" rel="noopener" data-outbox-send>${icon('whatsapp')}Gönder</a><button type="button" class="btn btn--text btn--sm" data-outbox-skip title="Göndermeden listeden kaldır">Atla</button>` });
  }
  for (const { k, names } of selections) {
    rows.push({ grp: 'alb', level: 2, tag: 'Seçim', name: k.name, href: `/admin/ciftler/${k.id}#album`, text: `Albüm seçimini tamamladı (${names.length} kare). Albüm tasarımını hazırlayın.`,
      actions: h`<button type="button" class="btn btn--text btn--sm" data-copy="${names.join(' ')}" title="Seri numaralarını boşlukla ayrılmış olarak kopyalar (Lightroom/Bridge araması için)">Kopyala</button><a class="btn btn--outline btn--sm" href="/admin/ciftler/${k.id}/secim.txt">${icon('download')}Liste</a>` });
  }
  for (const q of quotes) {
    rows.push({ grp: 'acil', level: 3, tag: 'Teklif', name: q.accepted_name || q.name, href: `/admin/teklif/${q.id}`, text: `Teklifi kabul etti (${tl(require('./quotes').total(q))})`,
      actions: h`<a class="btn btn--primary btn--sm" href="/admin/randevu/yeni?teklif=${q.id}">Randevuya çevir</a>` });
  }
  if (newLeads) rows.push({ grp: 'acil', level: 2, tag: 'Talep', name: `${newLeads} yeni talep`, href: '/admin/talepler', text: 'Yanıt bekliyor', actions: h`<a class="btn btn--outline btn--sm" href="/admin/talepler">Talepler</a>` });
  return rows.sort((a, b) => b.level - a.level);
}

function dashboard(c, { outbox = [], selections = [], quotes = [], newLeads = 0, reminders = [], prebookings = [], signed = [], disk = null, adminName = '', couples, monthEvents, upcoming, ym, csrf, flash: f, demoAdmin }) {
  const t = today();
  const tm = addDays(t, 1);
  const tomorrowDue = couples.filter((k) => k.due_date === tm && k.stage < c.stages.length - 1);
  const balance = couples.reduce((s, k) => s + payment(k)[2], 0);
  const late = couples.filter((k) => jobStatus(k, c.stages)[0] === 'late').length;
  const todo = todoList(c, { couples, outbox, selections, quotes, newLeads, reminders, csrf });
  const todayN = upcoming.filter((e) => e.event_date === t).length;
  const weekN = upcoming.filter((e) => e.event_date <= addDays(t, 6)).length;
  const o = c.appointments || {};
  const body = h`
  <div class="container dashboard">
    <header class="dash-head">
      <div>
        <p class="dash-head__date">${longDay(t)}</p>
        <h1 class="dash-head__title">${greet()}${adminName ? h`, <em>${adminName}</em>` : ''}</h1>
        <p class="dash-head__sub">${todayN ? `Bugün ${todayN} çekim` : 'Bugün çekim yok'}${weekN > todayN ? ` · 7 günde ${weekN} çekim` : ''} · ${todo.length ? `${todo.length} iş bekliyor` : 'bekleyen iş yok'}</p>
      </div>
      <div class="dash-head__actions">
        <a class="btn btn--outline" href="/admin/hatirlatma/yeni">${icon('bell')}Hatırlatma</a>
        <a class="btn btn--primary" href="/admin/randevu/yeni">${icon('plus')}Yeni randevu</a>
      </div>
    </header>
    ${flashBlock(f)}
    ${disk && disk.used >= 0.85 ? h`<div class="flash flash--error" role="alert">Sunucu diski %${Math.round(disk.used * 100)} dolu, ${(disk.free / 1024 ** 3).toFixed(1)} GB boş yer kaldı. Disk dolarsa fotoğraf yüklenemez. <a href="/admin/veriler">Veriler ve arşiv</a></div>` : ''}
    ${signed.length ? h`<section class="signed" aria-label="Sözleşme onayları">${signed.map((k) => h`
      <div class="signed__item">
        <span class="signed__icon" aria-hidden="true">${icon('check')}</span>
        <p class="signed__text"><a href="/admin/ciftler/${k.couple_id}#odeme"><strong>${k.name}</strong></a> sözleşmeyi onayladı
          <span class="signed__when">${seenText(k.signed_at)}${k.signer_name && k.signer_name !== k.name ? ` · imzalayan: ${k.signer_name}` : ''}</span></p>
        <form method="post" action="/admin/sozlesme/${k.id}/gordum" class="inline-form">${csrfField(csrf)}<button class="btn btn--outline btn--sm" type="submit">Tamam</button></form>
      </div>`)}</section>` : ''}

    <div class="dstats">
      <a class="dstat" href="/admin/takvim"><span class="dstat__k">${MONTHS[Number(ym.slice(5)) - 1]} çekimleri</span><b class="dstat__v">${monthEvents.length}</b><span class="dstat__n">${(() => { const nx = upcoming[0]; return nx ? `Sıradaki ${new Date(`${nx.event_date}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}` : 'Yaklaşan çekim yok'; })()}</span></a>
      <a class="dstat" href="/admin/rapor"><span class="dstat__k">Bekleyen ödeme</span><b class="dstat__v">${tl(balance).replace(/\s?₺$/, '')}<small>₺</small></b><span class="dstat__n">${couples.filter((k) => payment(k)[2] > 0).length} çiftte</span></a>
      <a class="dstat" href="/admin/talepler"><span class="dstat__k">Yeni talep</span><b class="dstat__v">${newLeads}</b><span class="dstat__n">${newLeads ? 'Yanıt bekliyor' : 'Hepsi yanıtlandı'}</span></a>
      <a class="dstat${late ? ' dstat--late' : ''}" href="/admin/takvim#teslimler"><span class="dstat__k">Geciken teslim</span><b class="dstat__v">${late}</b><span class="dstat__n">${late ? `En eskisi ${Math.max(...couples.filter((k) => jobStatus(k, c.stages)[0] === 'late').map((k) => daysBetween(k.due_date, t)))} gün` : 'Hepsi zamanında'}</span></a>
    </div>

    <div class="dgrid">
    <section class="todo" id="yapilacaklar" aria-labelledby="todo-title" data-outbox>
      <header class="sec-head">
        <h2 class="sec-title" id="todo-title">Yapılacaklar <span class="sec-count" data-todo-count>${todo.length}</span></h2>
        <span class="sec-note">Bekleyen işler ve gönderilecek mesajlar</span>
      </header>
      ${todo.length ? (() => {
        const item = (x) => h`
        <li class="todo__item${x.level === 3 ? ' is-urgent' : ''}" data-todo-item${x.outbox ? raw(` data-outbox-item data-keys="${x.outbox.keys.join(',')}"`) : ''}>
          ${/^\/admin\/ciftler\//.test(x.href || '') || x.outbox?.coupleId ? h`<span class="av av--${(TAG_ICON[x.tag] || ['', 'soz'])[1]}${x.level >= 3 ? ' av--late' : ''}" aria-hidden="true">${initials(x.name)}</span>` : h`<span class="dic dic--${(TAG_ICON[x.tag] || ['alert', 'soz'])[1]}" aria-hidden="true">${icon((TAG_ICON[x.tag] || ['alert'])[0])}</span>`}
          <span class="todo__main">
            <span class="todo__tag">${x.tag}</span>
            ${x.href ? h`<a class="todo__name" href="${x.href}">${x.name}</a>` : h`<span class="todo__name">${x.name}</span>`}
            <span class="todo__text">${x.text}</span>
          </span>
          <span class="todo__actions">${x.actions}</span>
        </li>`;
        const groups = TODO_GROUPS.map((g) => ({ ...g, rows: todo.filter((x) => (x.grp || 'diger') === g.key) })).filter((g) => g.rows.length);
        return h`
        <div class="tgf" role="toolbar" aria-label="Yapılacakları süz" data-tg-filter>
          <button type="button" class="tgf__c is-on" data-tg="">Tümü <b>${todo.length}</b></button>
          ${groups.map((g) => h`<button type="button" class="tgf__c" data-tg="${g.key}">${g.key === 'mesaj' ? 'Mesajlar' : g.key === 'soz' ? 'Sözleşme' : g.key === 'alb' ? 'Albüm' : g.key === 'pay' ? 'Ödeme ve plan' : g.title} <b data-tg-count="${g.key}">${g.rows.length}</b></button>`)}
        </div>
        ${groups.map((g) => h`
        <details class="tg tg--${g.tone}" data-tg-group="${g.key}"${g.open || g.rows.some((x) => x.level >= 3) ? raw(' open') : ''}>
          <summary class="tg__head">
            <span class="dic dic--${g.tone}" aria-hidden="true">${icon(g.icon)}</span>
            <span class="tg__title">${g.title}</span>
            <span class="tg__n" data-tg-count="${g.key}">${g.rows.length}</span>
            <span class="tg__names">${[...new Set(g.rows.map((x) => String(x.name).split(/\s+&\s+|\s+/)[0]))].slice(0, 4).join(', ')}${g.rows.length > 4 ? '…' : ''}</span>
            <span class="tg__chev" aria-hidden="true">${icon('right')}</span>
          </summary>
          <ul class="todo__list">${g.rows.map(item)}</ul>
        </details>`)}`;
      })() : h`<p class="sec-empty">Bekleyen iş yok.</p>`}
      <p class="sec-empty" data-todo-empty hidden>Bekleyen iş kalmadı.</p>
    </section>

    <aside class="dgrid__side">
      ${programBlock(c, upcoming, tomorrowDue, reminders)}
      <div class="dmini">
        <a href="/admin/on-randevu"><b>${prebookings.length}</b>Ön randevu</a>
        <a href="/admin/hatirlatma/yeni"><b>${reminders.length}</b>Hatırlatma</a>
        <a href="#cards-title"><b>${couples.filter((k) => k.stage < c.stages.length - 1).length}</b>Aktif çift</a>
      </div>
    </aside>
    </div>
    ${prebookings.length ? prebookBlock(prebookings) : ''}

    <section class="couples" aria-labelledby="cards-title">
      <header class="sec-head cards-head">
        <h2 class="sec-title" id="cards-title">Çiftler <span class="sec-count" data-card-count>${couples.length}</span></h2>
        <div class="seg" role="tablist" aria-label="Görünüm">
          <button type="button" class="seg__btn is-on" data-view="cards" role="tab" aria-selected="true">Liste</button>
          <button type="button" class="seg__btn" data-view="board" role="tab" aria-selected="false">Aşamalar</button>
        </div>
        <a class="btn btn--text btn--sm" href="/admin/randevular.csv">${icon('download')}Excel</a>
      </header>
      <div class="card-filters" data-card-filters>
        <label class="sr-only" for="q">Ara</label>
        <input id="q" type="search" placeholder="Ara: isim, telefon, randevu no" data-f-q autocomplete="off">
        <label class="sr-only" for="f-stage">Aşama</label>
        <select id="f-stage" data-f-stage><option value="">Tüm aşamalar</option>${c.stages.map((s, i) => h`<option value="${i}">${s}</option>`)}</select>
        <label class="sr-only" for="f-type">Tür</label>
        <select id="f-type" data-f-type><option value="">Tüm türler</option>${(o.eventTypes || []).map((x) => h`<option>${x}</option>`)}</select>
        <label class="sr-only" for="f-pay">Ödeme</label>
        <select id="f-pay" data-f-pay><option value="">Tüm ödemeler</option><option value="unpaid">Ödeme bekleniyor</option><option value="deposit">Kapora alındı</option><option value="paid">Ödendi</option><option value="none">Tutar girilmedi</option></select>
        <label class="sr-only" for="f-sort">Sıralama</label>
        <select id="f-sort" data-f-sort><option value="date">Tarihe göre</option><option value="new">En yeni kayıt</option></select>
      </div>
      ${couples.length ? h`<div class="crow-head" aria-hidden="true"><span>Çift</span><span>Tarih</span><span>Aşama</span><span>Bakiye</span><span>Hazır</span></div>
        <ul class="ccards crows" data-cards>${couples.map((k) => coupleCard(c, k))}</ul>
        ${stageBoard(c, couples)}
        <p class="sec-empty" data-cards-empty hidden>Aramaya uyan çift yok.</p>
        <p class="crow-legend">Hazır: <b>F</b> fotoğraf · <b>V</b> video · <b>A</b> albüm · <b>S</b> sözleşme onaylı</p>`
        : h`<p class="sec-empty">Henüz randevu yok. <a href="/admin/randevu/yeni">İlk randevuyu oluşturun.</a></p>`}
    </section>
  </div>`;
  return panelLayout(c, { title: 'Bugün', csrf, nav: adminNav('couples', csrf, demoAdmin), home: '/admin', tabs: adminTabs('couples', demoAdmin), body, scripts: ['/js/dashboard.js?v=12', '/js/outbox.js?v=3'] });
}

// Bir etkinlik bloğu (formda tekrar eder; JS "Tarih ekle" ile kopyalar)
function eventBlock(c, values, i, n, team = [], packages = []) {
  const o = c.appointments || {};
  const v = (k) => values[`ev${i}_${k}`] ?? '';
  const id = (k) => `ev${i}_${k}`;
  return h`
  <div class="ev-block" data-ev data-ev-index="${i}">
    <div class="ev-block__head">
      <h3 class="ev-block__title">${icon('calendar')}<span><span data-ev-num>${n}</span>. tarih</span> <span class="ev-block__same" data-ev-same hidden>· aynı gün</span></h3>
      <div class="ev-block__tools">
        <button type="button" class="btn btn--text btn--sm" data-ev-sameday title="Bu günün tarih, şehir ve mekânıyla yeni bir hizmet ekler">${icon('plus')}Aynı güne hizmet ekle</button>
        <button type="button" class="btn btn--text btn--sm btn--danger-text" data-ev-remove>${icon('trash')}Kaldır</button>
      </div>
    </div>
    <input type="hidden" name="${id('id')}" value="${v('id')}">
    <div class="appt-row ev-row1">
      <div class="field"><label for="${id('type')}">Etkinlik türü</label><select id="${id('type')}" name="${id('type')}"><option value="">Seçin</option>${(o.eventTypes || []).map((x) => h`<option${x === v('type') ? raw(' selected') : ''}>${x}</option>`)}</select></div>
      <div class="field"><label for="${id('date')}">Tarih</label><input id="${id('date')}" name="${id('date')}" type="date" value="${v('date')}" data-ev-date></div>
      <div class="field"><label for="${id('time')}">Başlangıç saati</label><input id="${id('time')}" name="${id('time')}" type="time" value="${v('time')}"></div>
    </div>
    <p class="ev-block__warn" data-ev-warn hidden></p>
    <div class="appt-row">
      <div class="field"><label for="${id('city')}">Şehir</label><input id="${id('city')}" name="${id('city')}" type="text" maxlength="60" value="${v('city')}"></div>
      <div class="field"><label for="${id('venue')}">Mekân</label><input id="${id('venue')}" name="${id('venue')}" type="text" maxlength="160" value="${v('venue')}"></div>
    </div>
    ${(() => {
      // Paketler: birden fazla seçilebilir; listede olmayan bir hizmet "Diğer" alanına yazılır.
      // Kayıtta "Fotoğraf + Video + Gelin alma" biçiminde tek metin olarak saklanır.
      const names = new Set(packages.map((x) => x.name));
      const posted = values[`ev${i}_pkgs`];
      const whole = String(v('package')).trim();
      const parts = posted !== undefined ? [].concat(posted) : names.has(whole) ? [whole] : whole.split(' + ').map((x) => x.trim()).filter(Boolean);
      const checked = new Set(parts.filter((x) => names.has(x)));
      const custom = posted !== undefined ? v('package') : parts.filter((x) => !names.has(x)).join(' + ');
      return h`<div class="field ev-pkgs">
        <span class="ev-team__label">Paket ve hizmetler <span class="muted">(birden fazla seçebilirsiniz; tutar toplanır)</span></span>
        ${packages.length ? h`<div class="ev-team__list">${packages.map((x) => h`<label class="ev-team__item">
          <input type="checkbox" name="${id('pkgs')}[]" value="${x.name}" data-ev-pkg data-price="${x.price || 0}" data-detail="${x.detail || ''}" data-type="${x.event_type || ''}"${checked.has(x.name) ? raw(' checked') : ''}>
          <span>${x.name}${x.price ? h` <span class="muted">· ${tl(x.price)}</span>` : ''}</span>
        </label>`)}</div>` : h`<p class="muted ev-team__empty">Paket listeniz boş. <a href="/admin/paketler" target="_blank" rel="noopener">Paketler sayfasından</a> hizmetlerinizi ekleyin.</p>`}
      </div>
      <div class="appt-row">
        <div class="field"><label for="${id('package')}">${packages.length ? 'Diğer hizmet' : 'Paket'} <span class="muted">(isteğe bağlı)</span></label><input id="${id('package')}" name="${id('package')}" type="text" maxlength="120" list="pkg-list" value="${custom}" data-ev-package autocomplete="off" placeholder="${packages.length ? 'Listede olmayan bir hizmet' : ''}"></div>
        <div class="field"><label for="${id('price')}">Tutar (₺)</label><input id="${id('price')}" name="${id('price')}" type="text" inputmode="numeric" placeholder="0" value="${v('price')}" data-money data-ev-price></div>
      </div>`;
    })()}
    ${(() => {
      const chosen = new Set([].concat(values[`ev${i}_team`] || []).map(Number));
      const list = team.filter((m) => m.active || chosen.has(m.id));
      return h`<div class="field ev-team">
        <span class="ev-team__label">Ekip <span class="muted">(seçilen kişiye görev mesajı gider)</span></span>
        ${list.length ? h`<div class="ev-team__list">${list.map((m) => h`<label class="ev-team__item">
          <input type="checkbox" name="${id('team')}[]" value="${m.id}"${chosen.has(m.id) ? raw(' checked') : ''}>
          <span>${m.name}${m.role ? h` <span class="muted">· ${m.role}</span>` : ''}${m.phone ? '' : h` <span class="muted">· telefon yok</span>`}</span>
        </label>`)}</div>` : h`<p class="muted ev-team__empty">Ekip listeniz boş. <a href="/admin/ekip" target="_blank" rel="noopener">Ekip sayfasından</a> personel ekleyin.</p>`}
      </div>`;
    })()}
    <div class="field"><label for="${id('detail')}">Paket detayı ve istekler</label><textarea id="${id('detail')}" name="${id('detail')}" rows="3" maxlength="1500" placeholder="Bu gün için özel istekler, çekim süresi, ek hizmetler…">${v('detail')}</textarea></div>
  </div>`;
}

// Kişi kartı formu (yeni ve düzenleme ortak)
function appointmentPage(c, { values = {}, action, title, submitLabel, csrf, errors = [], talepId, teklifId, back, demoAdmin, isNew, team = [], packages = [] }) {
  const o = c.appointments || {};
  const v = (k) => values[k] ?? '';
  const sel = (name, list, placeholder) => h`<select id="${name}" name="${name}"><option value="">${placeholder}</option>${(list || []).map((x) => h`<option${x === v(name) ? raw(' selected') : ''}>${x}</option>`)}</select>`;
  const chk = (name, label) => h`<label class="check"><input type="checkbox" name="${name}" value="1"${values[name] && values[name] !== '0' ? raw(' checked') : ''}><span>${label}</span></label>`;
  const idx = eventIndexes(values);
  const coupleId = (/\/admin\/ciftler\/(\d+)\//.exec(action) || [])[1] || '';
  const body = h`
  <div class="container container--form">
    <a class="back-link" href="${back}">${icon('left')}Geri</a>
    <h1 class="page-title">${title}</h1>
    ${values.on ? h`<p class="pre-note">${icon('calendar')}<span>Ön randevudan geldi. Kesin tarihi girip kaydedin.</span></p>` : isNew ? h`<p class="pre-note">${icon('calendar')}<span>Tarih henüz belli değil mi? <a href="/admin/on-randevu/yeni">Ön randevu olarak kaydedin</a></span></p>` : ''}
    ${errors.length ? h`<div class="flash flash--error" role="alert">${errors.map((e) => h`<div>${e}</div>`)}</div>` : ''}
    <form class="form appt-form" method="post" action="${action}" data-appt-form data-couple="${coupleId}" data-packages="${JSON.stringify(packages.map((x) => ({ n: x.name, p: x.price, d: x.detail, t: x.event_type })))}">
      ${csrfField(csrf)}
      ${talepId ? h`<input type="hidden" name="talep" value="${talepId}">` : ''}
      ${teklifId || values.teklif ? h`<input type="hidden" name="teklif" value="${teklifId || values.teklif}">` : ''}
      ${values.on ? h`<input type="hidden" name="on" value="${values.on}">` : ''}
      <datalist id="pkg-list">${packages.map((x) => h`<option value="${x.name}">${x.price ? tl(x.price) : ''}</option>`)}</datalist>

      <fieldset class="appt-group">
        <legend class="sr-only">Çift</legend><div class="appt-head"><span class="appt-head__n appt-head__n--1">1</span>${icon('users')}<span class="appt-head__t">Çift</span></div>
        <div class="appt-row">
          <div class="field"><label for="fullName">Ad soyad</label><input id="fullName" name="fullName" type="text" required maxlength="80" value="${v('fullName')}" autocomplete="off"></div>
          <div class="field"><label for="partnerName">Eş adı</label><input id="partnerName" name="partnerName" type="text" maxlength="80" value="${v('partnerName')}" autocomplete="off"></div>
        </div>
        <div class="appt-row">
          <div class="field"><label for="phone">Telefon</label><input id="phone" name="phone" type="tel" inputmode="tel" maxlength="20" placeholder="05XX XXX XX XX" value="${v('phone')}"></div>
          <div class="field"><label for="source">Müşteri kaynağı</label>${sel('source', o.sources, 'Seçin')}</div>
        </div>
      </fieldset>

      <fieldset class="appt-group">
        <legend class="sr-only">Çekimler</legend><div class="appt-head"><span class="appt-head__n appt-head__n--2">2</span>${icon('camera')}<span class="appt-head__t">Çekimler</span></div>
        <p class="muted appt-help">Her hizmeti ayrı etkinlik olarak girin; her birinin kendi paketi, tutarı ve ekibi olur. Aynı gün birden fazla hizmet varsa (örn. dış çekim + düğün) “Aynı güne hizmet ekle”ye dokunun: tarih, şehir ve mekân kopyalanır.</p>
        <div class="ev-list" data-ev-list>
          ${idx.map((i, n) => eventBlock(c, values, i, n + 1, team, packages))}
        </div>
        <template data-ev-template>${eventBlock(c, {}, '__i__', '__n__', team, packages)}</template>
        <button type="button" class="btn btn--outline btn--sm ev-add" data-ev-add>${icon('plus')}Tarih ekle</button>
      </fieldset>

      <fieldset class="appt-group">
        <legend class="sr-only">Ödeme</legend><div class="appt-head"><span class="appt-head__n appt-head__n--3">3</span>${icon('lira')}<span class="appt-head__t">Ödeme</span></div>
        <div class="appt-row">
          <div class="field"><label for="discount">İndirim <span class="muted">(₺ ya da %, isteğe bağlı)</span></label><input id="discount" name="discount" type="text" inputmode="decimal" placeholder="Örn. 2.000 ya da %10" value="${v('discount')}" data-discount></div>
        </div>
        <div class="appt-sum" data-sum aria-live="polite"></div>
        ${isNew ? h`<div class="appt-row">
          <div class="field"><label for="deposit">Kapora (₺)</label><input id="deposit" name="deposit" type="text" inputmode="numeric" placeholder="0" value="${v('deposit')}" data-money data-deposit></div>
          <div class="field"><label for="depositDate" data-dep-date-label>${values.depositLater ? 'Söz verilen tarih' : 'Kapora tarihi'}</label><input id="depositDate" name="depositDate" type="date" value="${v('depositDate')}"></div>
        </div>
        <div class="appt-row">
          <label class="check dep-later"><input type="checkbox" name="depositLater" value="1" data-dep-later${values.depositLater ? raw(' checked') : ''}><span>Kapora sonra ödenecek <span class="muted">(ör. maaş günü; söz verilen gün size ve çifte hatırlatılır)</span></span></label>
        </div>` : h`<p class="muted appt-help">Ödemeleri kişi kartındaki "Ödemeler" bölümünden ekleyin.</p>`}
      </fieldset>

      <fieldset class="appt-group">
        <legend class="sr-only">Teslim ve ek</legend><div class="appt-head"><span class="appt-head__n appt-head__n--4">4</span>${icon('book')}<span class="appt-head__t">Teslim ve ek</span><span class="appt-head__s">isteğe bağlı</span></div>
        <div class="appt-row">
          ${isNew ? '' : h`<div class="field"><label for="dueDate">Teslim tarihi <span class="muted">(boş bırakın: son çekimden ${o.defaultDeliveryDays || 45} gün sonra)</span></label><input id="dueDate" name="dueDate" type="date" value="${v('dueDate')}"></div>`}
          <div class="field"><label for="albumLimit">Albüm kare sayısı</label><input id="albumLimit" name="albumLimit" type="number" min="1" max="1000" inputmode="numeric" value="${v('albumLimit') || 35}"></div>
        </div>
        ${isNew ? h`<p class="muted appt-help">Teslim tarihi çekimden sonra kendiliğinden belirlenir: son çekimden ${o.defaultDeliveryDays || 45} gün sonra. Gerekirse çekimden sonra kişi kartından değiştirebilirsiniz.</p>` : ''}
        ${isNew ? '' : h`<div class="appt-checks">${chk('photoReady', 'Fotoğraflar hazır')}${chk('videoReady', 'Video hazır')}${chk('albumReady', 'Albüm hazır')}</div>`}
        ${chk('waOptin', 'WhatsApp bildirimleri gönderilsin')}
        ${isNew ? h`<div class="field"><label for="hediye">Hediye kuponu <span class="muted">(bir çiftin kuponuyla geldiyse)</span></label><input id="hediye" name="hediye" type="text" maxlength="40" placeholder="ör. ELIF-BURAK-7K2" value="${v('hediye')}" autocapitalize="characters"></div>` : ''}
        <div class="field"><label for="notes">Notlar <span class="muted">(yalnızca siz görürsünüz)</span></label><textarea id="notes" name="notes" rows="3" maxlength="3000">${v('notes')}</textarea></div>
      </fieldset>

      <div class="appt-actions">
        <div class="appt-bar" data-bar aria-live="polite"><span class="appt-bar__k">Toplam</span><b data-bar-total>—</b><span class="appt-bar__k" data-bar-rest-k hidden>Kalan</span><b data-bar-rest hidden></b></div>
        <a class="btn btn--text" href="${back}">Vazgeç</a>
        <button class="btn btn--primary" type="submit">${submitLabel}</button>
      </div>
    </form>
  </div>`;
  return panelLayout(c, { title, csrf, nav: adminNav('couples', csrf, demoAdmin), home: '/admin', tabs: adminTabs('couples', demoAdmin), body, scripts: ['/js/dashboard.js?v=12', '/js/outbox.js?v=3'] });
}

// Kişi kartı özeti, etkinlikler ve ödemeler (çift sayfasında)
function appointmentSummary(c, k, events, payments, csrf) {
  const pay = payment(k);
  const base = `/admin/ciftler/${k.id}`;
  const row = (label, value) => (value ? h`<div><dt>${label}</dt><dd>${value}</dd></div>` : '');
  return h`
  <section class="panel-section" aria-labelledby="card-title">
    <div class="panel-section__head appt-card__head">
      <h2 class="panel-section__title" id="card-title">Kişi kartı</h2>
      <div class="appt-card__actions">
        <a class="btn btn--outline btn--sm" href="${base}/belge">${icon('download')}Randevu belgesi</a>
        <a class="btn btn--primary btn--sm" href="${base}/duzenle">Düzenle</a>
      </div>
    </div>
    <div class="appt-cols">
      <dl class="appt-dl">
        ${row('Randevu no', k.ref_no)}
        ${row('Ad soyad', k.full_name)}
        ${row('Eş adı', k.partner_name)}
        ${k.phone ? h`<div><dt>Telefon</dt><dd><a href="tel:+${k.phone}">${displayPhone(k.phone)}</a> · <a href="https://wa.me/${k.phone}" target="_blank" rel="noopener">WhatsApp</a></dd></div>` : ''}
        ${row('Kaynak', k.source)}
        ${row('Teslim', k.due_date ? shortDate(k.due_date) : '')}
        <div><dt>Hazır</dt><dd>${[k.photo_ready && 'Fotoğraf', k.video_ready && 'Video', k.album_ready && 'Albüm'].filter(Boolean).join(', ') || 'Henüz yok'}</dd></div>
        ${row('Albüm bilgisi gönderildi', k.album_info_sent_at ? shortDate(k.album_info_sent_at) : '')}
        ${row('Notlar', k.notes)}
      </dl>

      <div>
        <h3 class="appt-sub">Etkinlikler <span class="muted">(${events.length})</span></h3>
        ${events.length ? h`<ol class="ev-view">${events.map((e) => h`
          <li class="ev-view__item">
            <div class="ev-view__date"><span class="ev-view__day">${e.event_date ? Number(e.event_date.slice(8)) : '—'}</span><span class="ev-view__mon">${e.event_date ? MONTHS[Number(e.event_date.slice(5, 7)) - 1].slice(0, 3) : ''}</span></div>
            <div class="ev-view__main">
              <span><strong>${e.event_type || 'Etkinlik'}</strong>${e.start_time ? h` · ${e.start_time}` : ''}</span>
              <span class="muted">${[e.venue, e.city].filter(Boolean).join(', ')}</span>
              ${e.package ? h`<span>${e.package}${e.price ? h` · ${tl(e.price)}` : ''}</span>` : e.price ? h`<span>${tl(e.price)}</span>` : ''}
              ${e.package_detail ? h`<span class="ev-view__note">${e.package_detail}</span>` : ''}
              ${(e.members || []).length ? h`<span class="ev-view__team">${e.members.map((m) => h`<span class="ev-view__member">${m.name}${m.phone ? h` <a href="https://wa.me/${m.phone}?text=${encodeURIComponent(taskText(m, e, k.name))}" target="_blank" rel="noopener" title="Görev mesajını WhatsApp'tan gönder">${icon('whatsapp')}</a>` : ''}</span>`)}</span>` : ''}
            </div>
          </li>`)}</ol>` : h`<p class="muted">Etkinlik girilmedi.</p>`}
      </div>
    </div>
  </section>`;
}

function paymentsSection(c, k, payments, csrf) {
  const pay = payment(k);
  const base = `/admin/ciftler/${k.id}`;
  return h`
  <section class="panel-section" id="odemeler" aria-labelledby="pay-title">
    <div class="panel-section__head">
      <h2 class="panel-section__title" id="pay-title">Ödemeler</h2>
    </div>
    ${k.deposit_promise > 0 ? h`<div class="dep-promise${k.deposit_promise_on < today() ? ' is-late' : ''}">
      <p>${icon('clock')}<span><strong>Kapora sözü: ${tl(k.deposit_promise)}</strong> · ${k.deposit_promise_on < today() ? `${formatDate(k.deposit_promise_on)} geçti` : k.deposit_promise_on === today() ? 'bugün' : formatDate(k.deposit_promise_on)}</span></p>
      <div class="dep-promise__acts">
        <form method="post" action="${base}/kapora-alindi" class="inline-form">${csrfField(csrf)}<button class="btn btn--primary btn--sm" type="submit">${icon('check')}Kapora alındı</button></form>
        <form method="post" action="${base}/kapora-soz" class="dep-promise__move">${csrfField(csrf)}<input type="hidden" name="amount" value="${k.deposit_promise}"><label class="sr-only" for="dp-on">Yeni tarih</label><input id="dp-on" type="date" name="on" value="${k.deposit_promise_on}"><button class="btn btn--outline btn--sm" type="submit">Tarihi değiştir</button></form>
        <form method="post" action="${base}/kapora-soz" class="inline-form" data-confirm="Kapora sözü kaldırılsın mı?">${csrfField(csrf)}<input type="hidden" name="remove" value="1"><button class="btn btn--text btn--sm btn--danger-text" type="submit">Kaldır</button></form>
      </div>
    </div>` : ''}
    <div class="pay-sum">
      <div><span class="pay-sum__label">Toplam</span><span class="pay-sum__num">${tl(k.total)}</span></div>
      <div><span class="pay-sum__label">Alınan</span><span class="pay-sum__num">${tl(k.paid)}</span></div>
      <div><span class="pay-sum__label">Kalan</span><span class="pay-sum__num">${tl(pay[2])}</span></div>
      <div><span class="pay-sum__label">Durum</span><span class="paypill paypill--${pay[0]}">${pay[1]}</span></div>
    </div>
    ${payments.length ? h`<ul class="pay-list">${payments.map((p) => h`
      <li><span>${shortDate(p.paid_on)}</span><strong>${tl(p.amount)}</strong><span class="muted">${[p.method, p.note].filter(Boolean).join(' · ')}</span>
        <form method="post" action="${base}/odeme/${p.id}/sil" data-confirm="${tl(p.amount)} ödeme kaydı silinsin mi?">${csrfField(csrf)}<button class="btn btn--text btn--sm btn--danger-text" type="submit" aria-label="Sil">${icon('trash')}</button></form>
      </li>`)}</ul>` : ''}
    ${pay[2] > 0 || !k.total ? h`<form class="pay-form" method="post" action="${base}/odeme">
      ${csrfField(csrf)}
      <div class="field"><label for="p-amount">Tutar (₺)</label><input id="p-amount" name="amount" type="text" inputmode="numeric" required value="${pay[2] ? pay[2].toLocaleString('tr-TR') : ''}" data-money></div>
      <div class="field"><label for="p-date">Tarih</label><input id="p-date" name="paidOn" type="date" value="${today()}"></div>
      <div class="field"><label for="p-method">Yöntem</label><select id="p-method" name="method"><option>IBAN</option><option>Nakit</option><option>Kart</option><option>Diğer</option></select></div>
      <div class="field"><label for="p-note">Not</label><input id="p-note" name="note" type="text" maxlength="120" placeholder="Örn. 2. taksit"></div>
      <button class="btn btn--outline btn--sm" type="submit">${icon('plus')}Ödeme ekle</button>
    </form>` : ''}
  </section>`;
}

// Randevu belgesi: yazdırılır veya "PDF olarak kaydet" ile paylaşılır
function appointmentDoc(c, { card: k, events, payments, back, forCouple }) {
  const pay = payment(k);
  const contact = c.contact || {};
  return String(h`<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Randevu belgesi ${k.ref_no || ''} — ${c.brand.name}</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/css/style.css?v=24">
</head><body class="doc-body">
<div class="doc-tools">
  <a class="btn btn--text btn--sm" href="${back}">${icon('left')}Geri</a>
  <button class="btn btn--primary btn--sm" type="button" data-print>${icon('download')}Yazdır / PDF kaydet</button>
</div>
<main class="doc">
  <header class="doc__head">
    <div><img class="doc-logo doc-logo--h" src="/images/logo/hm4-yatay-lacivert.svg" alt="${c.brand.name}" width="190" height="22"><p class="doc__tag">${c.footer?.note || ''}</p></div>
    <div class="doc__ref"><span>Randevu no</span><strong>${k.ref_no || '—'}</strong><span>${shortDate(today())}</span></div>
  </header>
  <h1 class="doc__title">Randevu belgesi</h1>
  <dl class="doc__people">
    <div><dt>Ad soyad</dt><dd>${k.full_name || k.name}</dd></div>
    ${k.partner_name ? h`<div><dt>Eş adı</dt><dd>${k.partner_name}</dd></div>` : ''}
    ${k.phone ? h`<div><dt>Telefon</dt><dd>${displayPhone(k.phone)}</dd></div>` : ''}
  </dl>
  <table class="doc__table">
    <thead><tr><th>Tarih</th><th>Etkinlik</th><th>Yer</th><th>Paket</th><th class="num">Tutar</th></tr></thead>
    <tbody>${events.map((e) => h`<tr>
      <td>${shortDate(e.event_date)}${e.start_time ? h`<br><span class="muted">${e.start_time}</span>` : ''}</td>
      <td>${e.event_type}</td>
      <td>${[e.venue, e.city].filter(Boolean).join(', ')}</td>
      <td>${e.package}${e.package_detail ? h`<div class="doc__detail">${e.package_detail}</div>` : ''}</td>
      <td class="num">${e.price ? tl(e.price) : ''}</td></tr>`)}</tbody>
    <tfoot>
      ${k.discount ? h`<tr><td colspan="4">Hizmetler toplamı</td><td class="num">${tl(k.gross)}</td></tr><tr><td colspan="4">İndirim</td><td class="num">− ${tl(k.discount)}</td></tr>` : ''}
      <tr><td colspan="4">Toplam</td><td class="num">${tl(k.total)}</td></tr>
      ${payments.map((p) => h`<tr class="doc__paid"><td colspan="4">Ödeme · ${shortDate(p.paid_on)}${p.note ? ` · ${p.note}` : ''}</td><td class="num">− ${tl(p.amount)}</td></tr>`)}
      <tr class="doc__rest"><td colspan="4">Kalan bakiye</td><td class="num">${tl(pay[2])}</td></tr>
    </tfoot>
  </table>
  ${k.due_date ? h`<p class="doc__note">Tahmini teslim tarihi: ${shortDate(k.due_date)}</p>` : ''}
  <footer class="doc__foot">
    ${[contact.phone, contact.email, contact.instagram ? '@' + String(contact.instagram).replace(/^@/, '') : ''].filter(Boolean).join(' · ')}
  </footer>
</main>
<script src="/js/dashboard.js?v=5" defer></script>
</body></html>`);
}

// Aylık rapor: etkinlik sayısı, ciro (etkinlik ayına göre), tahsilat (ödeme ayına göre), müşteri kaynakları
function report(c, { year, events, payments, couples, csrf, demoAdmin }) {
  // Ciro indirim düşülerek: çiftin indirimi etkinliklerine fiyatları oranında dağıtılır
  const kOf = new Map(couples.map((k) => [k.id, k]));
  const net = (e) => { const k = kOf.get(e.couple_id); return k && k.discount && k.gross ? Math.round(e.price * (k.total / k.gross)) : e.price; };
  const months = MONTHS.map((name, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    const evs = events.filter((e) => e.event_date && e.event_date.startsWith(key));
    return { name, key, count: evs.length, revenue: evs.reduce((s, e) => s + net(e), 0), collected: payments.filter((p) => p.paid_on.startsWith(key)).reduce((s, p) => s + p.amount, 0) };
  });
  const maxRev = Math.max(1, ...months.map((m) => Math.max(m.revenue, m.collected)));
  const yearCouples = couples.filter((k) => events.some((e) => e.couple_id === k.id && e.event_date && e.event_date.startsWith(String(year))));
  const sources = new Map();
  for (const k of yearCouples) {
    const s = k.source || 'Belirtilmedi';
    const cur = sources.get(s) || { count: 0, revenue: 0 };
    cur.count++; cur.revenue += events.filter((e) => e.couple_id === k.id && e.event_date && e.event_date.startsWith(String(year))).reduce((x, e) => x + net(e), 0);
    sources.set(s, cur);
  }
  const srcList = [...sources.entries()].sort((a, b) => b[1].count - a[1].count);
  const maxSrc = Math.max(1, ...srcList.map(([, v]) => v.count));
  const types = new Map();
  for (const e of events) if (e.event_date && e.event_date.startsWith(String(year))) types.set(e.event_type || 'Diğer', (types.get(e.event_type || 'Diğer') || 0) + 1);
  const tot = months.reduce((a, m) => ({ count: a.count + m.count, revenue: a.revenue + m.revenue, collected: a.collected + m.collected }), { count: 0, revenue: 0, collected: 0 });
  const body = h`
  <div class="container">
    <div class="panel-title-row">
      <h1 class="page-title">Rapor · ${year}</h1>
      <div class="cal__nav">
        <a class="cal__btn" href="/admin/rapor?yil=${year - 1}" aria-label="Önceki yıl">${icon('left')}</a>
        <a class="cal__btn" href="/admin/rapor?yil=${year + 1}" aria-label="Sonraki yıl">${icon('right')}</a>
      </div>
    </div>
    <div class="stats stats--4">
      <div class="stat"><span class="stat__num">${tot.count}</span><span class="stat__label">Etkinlik</span></div>
      <div class="stat"><span class="stat__num">${yearCouples.length}</span><span class="stat__label">Müşteri</span></div>
      <div class="stat"><span class="stat__num stat__num--sm">${tl(tot.revenue)}</span><span class="stat__label">Ciro (etkinlik tarihine göre)</span></div>
      <div class="stat"><span class="stat__num stat__num--sm">${tl(tot.collected)}</span><span class="stat__label">Tahsilat</span></div>
    </div>

    <section class="panel-section">
      <div class="panel-section__head"><h2 class="panel-section__title">Aylara göre</h2>
        <p class="muted"><span class="legend legend--rev"></span>Ciro <span class="legend legend--col"></span>Tahsilat</p></div>
      <ul class="rbars">${months.map((m) => h`
        <li class="rbar">
          <span class="rbar__name">${m.name}</span>
          <span class="rbar__bars">
            <span class="rbar__bar rbar__bar--rev" data-pct="${Math.round(m.revenue / maxRev * 100)}"></span>
            <span class="rbar__bar rbar__bar--col" data-pct="${Math.round(m.collected / maxRev * 100)}"></span>
          </span>
          <span class="rbar__val">${m.count ? `${m.count} etkinlik · ` : ''}${tl(m.revenue)}</span>
        </li>`)}</ul>
    </section>

    <div class="report-cols">
      <section class="panel-section">
        <div class="panel-section__head"><h2 class="panel-section__title">Müşteri kaynakları</h2></div>
        ${srcList.length ? h`<ul class="rbars">${srcList.map(([name, v]) => h`
          <li class="rbar"><span class="rbar__name">${name}</span>
            <span class="rbar__bars"><span class="rbar__bar rbar__bar--rev" data-pct="${Math.round(v.count / maxSrc * 100)}"></span></span>
            <span class="rbar__val">${v.count} müşteri · ${tl(v.revenue)}</span></li>`)}</ul>` : h`<p class="muted">Bu yıl kayıt yok.</p>`}
      </section>
      <section class="panel-section">
        <div class="panel-section__head"><h2 class="panel-section__title">Etkinlik türleri</h2></div>
        ${types.size ? h`<ul class="plain-stats">${[...types.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => h`<li><span>${t}</span><strong>${n}</strong></li>`)}</ul>` : h`<p class="muted">Bu yıl kayıt yok.</p>`}
      </section>
    </div>
  </div>`;
  return panelLayout(c, { title: `Rapor ${year}`, csrf, nav: adminNav('report', csrf, demoAdmin), home: '/admin', tabs: adminTabs('report', demoAdmin), body });
}

// Hediye kuponları: bu çiftin kuponları, kuponla gelenler, borçlu olunan teşekkür hediyeleri
function giftSection(couple, { codes, settings: gs, cameWith, today: t }, base, csrf) {
  return h`<section class="panel-section" id="hediye" aria-labelledby="gift-title">
    <div class="panel-section__head"><h2 class="panel-section__title" id="gift-title">Hediye kuponları</h2>${gs.active ? '' : h`<span class="state state--done">Program kapalı</span>`}</div>
    ${cameWith ? h`<p>Bu çift <strong>${cameWith.owner}</strong> çiftinin hediye kuponuyla geldi (${cameWith.code}).</p>` : ''}
    ${codes.length ? h`<ul class="gift-admin">${codes.map((g) => h`<li>
      <code>${g.code}</code>
      ${g.used_couple_id ? h`<span>Kullandı: <a href="/admin/ciftler/${g.used_couple_id}">${g.used_by}</a></span>
        ${g.reward_given_at ? h`<span class="state state--ok">Teşekkür hediyesi verildi</span>` : h`<form method="post" action="${base}/hediye/${g.id}/verildi" class="inline-form">
          <input type="hidden" name="csrf" value="${csrf}"><button class="btn btn--outline btn--sm" type="submit">${gs.reward || 'Teşekkür hediyesi'} verildi</button></form>`}`
      : g.used_lead_id ? h`<span class="muted">Talep geldi, rezervasyon bekleniyor</span>`
      : g.expires_on < t ? h`<span class="muted">Süresi doldu</span>` : h`<span class="muted">Kullanılmadı · ${g.expires_on.split('-').reverse().join('.')} tarihine kadar</span>`}
    </li>`)}</ul>
    <div class="btn-row"><a class="btn btn--outline btn--sm" href="${base}/hediye-kartlari" target="_blank" rel="noopener">${icon('download')}Basılı kartları yazdır</a></div>` : h`
    <p class="muted">${gs.active ? 'Kuponlar iş “Teslim” aşamasına geçince çiftin panelinde kendiliğinden oluşur.' : 'Program kapalı; Ayarlar › Hediye kuponları’ndan açabilirsiniz.'} İsterseniz şimdi oluşturabilirsiniz.</p>
    <form method="post" action="${base}/hediye-olustur" class="inline-form"><input type="hidden" name="csrf" value="${csrf}"><button class="btn btn--outline btn--sm" type="submit">${icon('plus')}${gs.perCouple} kupon oluştur</button></form>`}
  </section>`;
}

// Basılı hediye kartları (A4'e 3 kart; albüm kutusuna konur)
function giftCards(c, { couple, codes, settings: gs, qr, url }) {
  return String(h`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Hediye kartları — ${couple.name}</title><meta name="robots" content="noindex">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500&display=swap">
  <link rel="stylesheet" href="/css/style.css?v=66"></head>
  <body class="gift-print"><main>
    <p class="gift-print__hint no-print">Yazdırmak için Ctrl/Cmd + P. Kartları kesik çizgilerden kesip albüm kutusuna koyun.</p>
    ${codes.filter((g) => !g.used_couple_id).map((g) => h`<article class="gcard">
      <div class="gcard__text">
        <p class="gcard__brand">${c.brand.name}</p>
        <h1 class="gcard__title">Size bir hediyemiz var</h1>
        <p class="gcard__from">${couple.name} sizi bize önerdi.</p>
        <p class="gcard__gift">${gs.gift}</p>
        <p class="gcard__code">Kupon: <strong>${g.code}</strong></p>
        <p class="gcard__rules">${gs.rules} Son kullanma: ${g.expires_on.split('-').reverse().join('.')}.</p>
      </div>
      <div class="gcard__qr">${raw(qr(url(g.code)))}<span>Okutun, hediyenizi görün</span></div>
    </article>`)}
  </main></body></html>`);
}

// Ayarlar › Hediye kuponları
function giftSettingsPage(c, { gs, stats, csrf, flash: f, demoAdmin }) {
  const body = h`
  <div class="container container--form">
    <a class="back-link" href="/admin/hesap">${icon('left')}Ayarlar</a>
    <h1 class="page-title">Hediye kuponları</h1>
    ${flashBlock(f)}
    <p class="muted">Teslim alan çift, yakında evlenecek arkadaşlarına sizden bir hediye gönderir. Kuponla gelen çift rezervasyon yapınca tavsiye eden çifte teşekkür hediyesi verilir; panel size hatırlatır.</p>
    <form class="form" method="post" action="/admin/hediye">
      ${csrfField(csrf)}
      <label class="check"><input type="checkbox" name="active" value="1"${gs.active ? raw(' checked') : ''}><span><strong>Program açık</strong> (kapalıyken çiftler kupon görmez, kupon sayfaları çalışmaz)</span></label>
      <div class="field"><label for="g-gift">Arkadaşa giden hediye</label><input id="g-gift" name="gift" maxlength="120" value="${gs.gift}"></div>
      <div class="field"><label for="g-reward">Tavsiye eden çifte teşekkür hediyesi</label><input id="g-reward" name="reward" maxlength="120" value="${gs.reward}"></div>
      <div class="appt-row">
        <div class="field"><label for="g-n">Çift başına kupon</label><input id="g-n" name="perCouple" type="number" min="1" max="10" value="${gs.perCouple}"></div>
        <div class="field"><label for="g-d">Geçerlilik (gün)</label><input id="g-d" name="validDays" type="number" min="30" max="1095" value="${gs.validDays}"></div>
      </div>
      <div class="field"><label for="g-r">Koşullar</label><textarea id="g-r" name="rules" rows="3" maxlength="400">${gs.rules}</textarea></div>
      <button class="btn btn--primary" type="submit">Kaydet</button>
    </form>
    ${stats.length ? h`<section class="panel-section"><div class="panel-section__head"><h2 class="panel-section__title">Kim kaç kişi getirdi</h2></div>
      <ul class="plain-stats">${stats.map((x) => h`<li><span><a href="/admin/ciftler/${x.id}#hediye">${x.name}</a></span><strong>${x.used || 0} / ${x.total}</strong></li>`)}</ul></section>` : ''}
  </div>`;
  return panelLayout(c, { title: 'Hediye kuponları', csrf, nav: adminNav('gifts', csrf, demoAdmin), home: '/admin', tabs: adminTabs('gifts', demoAdmin), body });
}

// Albüm tasarım onayı: sayfaları yükle, çifte gönder, çiftin notlarını gör
const ALBUM_STATE = { '': 'Henüz gönderilmedi', hazir: 'Çiftin incelemesinde', degisiklik: 'Çift değişiklik istedi', onaylandi: 'Çift onayladı' };
const PAGE_STATE = { bekliyor: ['İncelenmedi', 'upcoming'], onay: ['Beğendi', 'ok'], degisiklik: ['Değişiklik istiyor', 'soon'] };
function albumDesignSection(couple, pages, base, csrf) {
  const st = couple.album_design_state || '';
  const n = (k) => pages.filter((p) => p.status === k).length;
  const canSend = pages.length && st !== 'onaylandi' && (st !== 'hazir' || pages.some((p) => p.status === 'bekliyor' && p.version > 1));
  return h`<section class="panel-section" aria-labelledby="ad-title">
    <div class="panel-section__head">
      <h2 class="panel-section__title" id="ad-title">Albüm tasarımı</h2>
      <span class="state state--${st === 'onaylandi' ? 'ok' : st === 'degisiklik' ? 'soon' : 'upcoming'}">${ALBUM_STATE[st]}${couple.album_design_round > 1 ? ` · ${couple.album_design_round}. tur` : ''}</span>
    </div>
    <p class="muted">Tasarım sayfalarını (JPG) yükleyin ve “Çifte gönder”e basın. Çift her sayfayı “beğendim” ya da “değişiklik istiyorum + not” ile işaretler. Düzelttiğiniz sayfayı <strong>aynı dosya adıyla</strong> yüklerseniz eskisinin yerine geçer ve yeniden onaya düşer.</p>
    ${pages.length ? h`<p class="ad-sum">${pages.length} sayfa · <span class="is-ok">${n('onay')} beğenildi</span> · <span class="is-due">${n('degisiklik')} değişiklik</span> · ${n('bekliyor')} incelenmedi</p>` : ''}
    <form class="uploader" data-uploader data-endpoint="${base}/album-sayfa">
      <label class="uploader__drop">
        ${icon('upload')}
        <span><strong>Albüm sayfalarını seçin</strong> veya buraya sürükleyin</span>
        <span class="muted">JPG · sayfa sırası dosya adına göre (01.jpg, 02.jpg …)</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple data-files>
      </label>
      <ul class="uploader__list" data-list aria-live="polite"></ul>
    </form>
    ${pages.length ? h`<ul class="ad-grid">${pages.map((p, i) => h`<li class="ad-page ad-page--${p.status}">
      <a href="/m/a/${p.id}/display?v=${p.version}" data-lb data-caption="Sayfa ${i + 1} · ${p.original_name}"><img src="/m/a/${p.id}/thumb?v=${p.version}" alt="Sayfa ${i + 1}" loading="lazy" decoding="async"></a>
      <div class="ad-page__meta">
        <span><strong>${i + 1}.</strong> ${p.original_name}${p.version > 1 ? h` <span class="muted">· ${p.version}. sürüm</span>` : ''}</span>
        <span class="state state--${PAGE_STATE[p.status][1]}">${PAGE_STATE[p.status][0]}</span>
      </div>
      ${p.note ? h`<p class="ad-page__note">“${p.note}”</p>` : ''}
      <form method="post" action="${base}/album-sayfa/${p.id}/sil" class="inline-form" data-confirm="Bu sayfa silinsin mi?">
        <input type="hidden" name="csrf" value="${csrf}"><button class="btn btn--text btn--sm btn--danger-text" type="submit">${icon('trash')}Sil</button>
      </form>
    </li>`)}</ul>` : ''}
    ${canSend ? h`<form method="post" action="${base}/album-gonder" class="ad-send">
      <input type="hidden" name="csrf" value="${csrf}">
      <button class="btn btn--primary" type="submit">${icon('send')}${st === 'degisiklik' || st === 'hazir' ? 'Düzeltmeleri çifte gönder' : 'Çifte gönder'}</button>
      <span class="muted">Çifte telefon bildirimi gider; WhatsApp mesajı “Gönderilecek mesajlar”a düşer.</span>
    </form>` : ''}
  </section>`;
}

function coupleDetail(c, { couple, galleries = [], gal = null, card, contract: ct = null, selection = [], videos = [], edited = [], albumPages = [], gift = null, deliveries = [], events: evs, payments, photos, totalCount, favCount, view, csrf, flash: f, loginUrl, demoAdmin }) {
  const base = `/admin/ciftler/${couple.id}`;
  const body = h`
  <div class="container">
    <a class="back-link" href="/admin">${icon('left')}Bugün</a>
    <div class="panel-title-row">
      <div>
        <h1 class="page-title">${couple.name}</h1>
        <p class="muted">${(() => {
          const pay = payment(card);
          const first = evs.map((e) => e.event_date).filter(Boolean).sort()[0];
          return [couple.ref_no, first ? `${card.types ? card.types.split(', ')[0] + ' ' : ''}${formatDate(card.next_date || first)}` : card.types, card.total ? (pay[2] ? `Kalan ödeme ${tl(pay[2])}` : 'Ödendi') : '', panelSeen(couple)].filter(Boolean).join(' · ');
        })()}</p>
      </div>
    </div>
    ${flashBlock(f)}

    ${journey.adminBlock(c, { couple, card, contract: ct, events: evs, totalCount, favCount })}

    <nav class="cd-tabs" data-cd-tabs aria-label="Çift sayfası bölümleri" hidden>
      ${[['ozet', 'Özet'], ['odeme', 'Sözleşme ve ödeme'], ['foto', `Fotoğraflar${totalCount + edited.length ? ` ${totalCount + edited.length}` : ''}`], ['album', 'Albüm'], ['video', `Video${videos.length ? ` ${videos.length}` : ''}`], ['teslim', 'Teslim'], ['ayar', 'Ayarlar']]
        .map(([k, l]) => h`<a href="#${k}" data-tab="${k}">${l}</a>`)}
    </nav>

    <div class="cd-pane" data-pane="ozet">
    ${appointmentSummary(c, card, evs, payments, csrf)}

    <div id="plan">${planView(couple)}</div>

    <div>
      <section class="panel-section cd-stage" aria-labelledby="stage-title">
        <div class="panel-section__head"><h2 class="panel-section__title" id="stage-title">Çifte görünen durum</h2>
          <p class="muted">Aşama ve video durumu çiftin Durum sayfasında görünür. Son aşamaya geçince çifte teslim mesajı gider.</p></div>
        <form class="form" method="post" action="${base}/asama">
          ${csrfField(csrf)}
          <div class="field">
            <label for="stage">Aşama</label>
            <select id="stage" name="stage">
              ${c.stages.map((s, i) => h`<option value="${i}"${i === couple.stage ? raw(' selected') : ''}>${i + 1}. ${s}</option>`)}
            </select>
          </div>
          <div class="field">
            <label for="vstatus">Video durumu</label>
            <select id="vstatus" name="videoStatus">
              <option value="">Bu işte video yok</option>
              ${(c.appointments?.videoStages || []).map((v) => h`<option${v === couple.video_status ? raw(' selected') : ''}>${v}</option>`)}
            </select>
          </div>
          <div class="field">
            <label for="note">Çifte not <span class="muted">(isteğe bağlı)</span></label>
            <textarea id="note" name="note" rows="3" maxlength="500" placeholder="Örn. Video kurgusu bu hafta tamamlanacak.">${couple.stage_note}</textarea>
          </div>
          <button class="btn btn--primary" type="submit">Kaydet</button>
        </form>
      </section>


    </div>

    </div>

    <div class="cd-pane" data-pane="odeme">
    ${paymentsSection(c, card, payments, csrf)}
    ${require('./contract').adminSection({ coupleId: couple.id, k: ct, csrf, phone: couple.phone, loginUrl, coupleName: couple.name })}
    </div>

    <div class="cd-pane" data-pane="foto">

    <section class="panel-section" aria-labelledby="upload-title">
      <div class="panel-section__head">
        <h2 class="panel-section__title" id="upload-title">Fotoğraf yükle</h2>
        <p class="muted">Fotoğraflar tarayıcınızda web için küçültülür, sonra yüklenir. Dosyalar gizli klasörde saklanır; yalnızca bu çift ve siz görebilirsiniz.</p>
      </div>
      <form class="uploader" data-uploader data-endpoint="${base}/fotograflar">
        <div class="field field--inline">
          <label for="up-kind">Bu fotoğraflar</label>
          <select id="up-kind" data-category data-kind-select>
            <option value="secim">Seçim için (çift albüm karelerini seçer)</option>
            <option value="duzenli">Düzenlenmiş / renkli (teslim)</option>
          </select>
        </div>
        <div class="field field--inline" data-gallery-field>
          <label for="up-gal">Galeri</label>
          <select id="up-gal" data-gallery-select>
            ${galleries.length ? galleries.map((g) => h`<option value="${g.id}"${(gal ? g.id === gal.id : g === galleries[galleries.length - 1]) ? raw(' selected') : ''}>${g.name} (${g.photo_count})</option>`) : h`<option value="">Galeri 1</option>`}
          </select>
          <button type="submit" form="new-gal" class="btn btn--text btn--sm">${icon('plus')}Yeni galeri</button>
        </div>
        <label class="uploader__drop">
          ${icon('upload')}
          <span><strong>Fotoğraf seçin</strong> veya buraya sürükleyin</span>
          <span class="muted">JPG, PNG veya WEBP · çoklu seçim</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple data-files>
        </label>
        <label class="check">
          <input type="checkbox" data-keep-original checked>
          <span>Orijinal dosyaları da sakla (çift tam çözünürlükte indirebilsin)</span>
        </label>
        <ul class="uploader__list" data-list aria-live="polite"></ul>
      </form>
    </section>

    <section class="panel-section" aria-labelledby="gallery-title">
      <div class="panel-section__head">
        <h2 class="panel-section__title" id="gallery-title">Galeri ve albüm seçimi</h2>
        <p class="muted">Birden çok çekim varsa (ör. sokak ve plato) her birini ayrı galeriye yükleyin: “Yeni galeri” ile açın, adını verin. Çift tek galeri varsa doğrudan fotoğrafları, birden çok varsa galerileri görür; seçtikleri kareler tek albüm listesinde toplanır. Kalbe dokunarak çiftin albüm seçimini düzenleyebilirsiniz. ${icon('star')} ile çiftin Fotoğraflar sayfasındaki tam ekran kapak fotoğrafını seçin${couple.cover_photo_id ? '' : ' (seçmezseniz sistem yatay bir fotoğrafı otomatik koyar)'}.</p>
        ${totalCount ? h`<div class="dl-row"><a class="btn btn--outline btn--sm" href="${base}/indir" download>${icon('download')}Tümünü indir (${totalCount})</a>${favCount ? h`<a class="btn btn--text btn--sm" href="${base}/indir?g=fav" download>${icon('download')}Seçimi indir (${favCount})</a>` : ''}</div>` : ''}
      </div>
      <form id="new-gal" method="post" action="${base}/galeri" hidden>${csrfField(csrf)}</form>
      ${galleries.length > 1 || gal ? h`<nav class="galbar" aria-label="Galeriler">
        <a class="galbar__c${!gal && view !== 'fav' ? ' is-on' : ''}" href="${base}#foto">Tümü <span>${totalCount}</span></a>
        ${galleries.map((g) => h`<a class="galbar__c${gal && gal.id === g.id ? ' is-on' : ''}" href="${base}?gal=${g.id}#foto">${g.name} <span>${g.photo_count}</span></a>`)}
      </nav>` : ''}
      ${gal ? h`<div class="galedit">
        <form method="post" action="${base}/galeri/${gal.id}" class="galedit__name">${csrfField(csrf)}
          <label class="sr-only" for="gal-name">Galeri adı</label>
          <input id="gal-name" name="name" maxlength="60" value="${gal.name}" placeholder="Ör. Sokak çekimi">
          <button class="btn btn--outline btn--sm" type="submit">Adı kaydet</button>
        </form>
        <form method="post" action="${base}/galeri/${gal.id}/sil" class="inline-form" data-confirm="“${gal.name}” galerisi ve içindeki ${gal.photo_count} fotoğraf kalıcı olarak silinsin mi?">${csrfField(csrf)}
          <button class="btn btn--text btn--sm btn--danger-text" type="submit">${icon('trash')}Galeriyi sil</button>
        </form>
      </div>` : ''}
      ${galleryTabs(base, view, totalCount, favCount)}
      ${photos.length ? h`
      <ul class="tiles" data-gallery>
        ${photos.map((p) => photoTile(p, { favEndpoint: `${base}/favori`, canDelete: true, csrf, deleteAction: `${base}/fotograflar/${p.id}/sil`, coverAction: `${base}/kapak/${p.id}`, isCover: p.id === couple.cover_photo_id }))}
      </ul>` : h`<div class="empty-box">${icon('image')}<p>${view === 'fav' ? 'Bu çift henüz albüm için kare seçmedi.' : 'Henüz fotoğraf yüklenmedi.'}</p></div>`}
    </section>

    <section class="panel-section" id="duzenli" aria-labelledby="edited-title">
      <div class="panel-section__head">
        <h2 class="panel-section__title" id="edited-title">Düzenlenmiş fotoğraflar <span class="sec-count">${edited.length}</span></h2>
        <p class="muted">Renk ve ışık düzenlemesi yapılmış teslim fotoğrafları. Çift, Fotoğraflar sayfasında bunları ayrı görür ve tek tıkla indirir. Yüklerken yukarıda "Düzenlenmiş / renkli" seçin; orijinal dosyaları sakla işaretli kalsın.</p>
        ${edited.length ? h`<div class="dl-row"><a class="btn btn--outline btn--sm" href="${base}/indir?g=duzenli" download>${icon('download')}Tümünü indir (${edited.length})</a></div>` : ''}
      </div>
      ${edited.length ? h`<ul class="tiles" data-gallery>${edited.map((p) => photoTile(p, { canDelete: true, csrf, noFav: true, deleteAction: `${base}/fotograflar/${p.id}/sil`, coverAction: `${base}/kapak/${p.id}`, isCover: p.id === couple.cover_photo_id }))}</ul>` : h`<p class="sec-empty">Henüz düzenlenmiş fotoğraf yüklenmedi.</p>`}
    </section>

    </div>

    <div class="cd-pane" data-pane="album">
    <section class="panel-section" id="secim" aria-labelledby="pick-title">
      <div class="panel-section__head"><h2 class="panel-section__title" id="pick-title">Albüm seçimi</h2>
        <p class="muted">Çiftin seçtiği kareler. Seçimi düzenlemek için Fotoğraflar sekmesinde kalbe dokunun.</p></div>
      ${albumBar(couple, favCount, { admin: true, csrf, base })}
      ${selection.length ? h`<div class="sel-box">
        <div class="sel-box__head">
          <span><strong>Seçilen karelerin seri numaraları</strong> <span class="muted">(${selection.length}${couple.album_locked ? ', seçim tamamlandı' : ', çift seçmeye devam ediyor'})</span></span>
          <span class="sel__actions">
            <button type="button" class="btn btn--text btn--sm" data-copy="${selection.join(' ')}">Kopyala</button>
            <a class="btn btn--outline btn--sm" href="${base}/secim.txt">${icon('download')}Listeyi indir</a>
          </span>
        </div>
        <p class="sel-box__names">${selection.join(', ')}</p>
        ${(() => { const d = selection.filter((x, i) => selection.indexOf(x) !== i); return d.length ? h`<p class="sel-box__warn">Dikkat: aynı adla birden fazla dosya seçilmiş: ${[...new Set(d)].join(', ')}. RAW eşleştirmesinde kontrol edin.</p>` : ''; })()}
      </div>` : ''}
      ${totalCount ? '' : h`<p class="sec-empty">Henüz seçim fotoğrafı yüklenmedi.</p>`}
    </section>
    ${albumDesignSection(couple, albumPages, base, csrf)}
    </div>

    <div class="cd-pane" data-pane="video">
    <section class="panel-section" id="video" aria-labelledby="video-title">
      <div class="panel-section__head">
        <h2 class="panel-section__title" id="video-title">Video teslimi</h2>
        <p class="muted">Klip, düğün filmi ve reels. Çift "Video" sayfasından izleyip indirir. Büyük dosyalar parça parça yüklenir; yükleme sırasında bu sayfayı kapatmayın.</p>
      </div>
      ${videos.length ? h`<ul class="vlist">${videos.map((v) => h`
        <li class="vlist__item">
          <span class="vlist__main"><strong>${v.title || v.kind}</strong><span class="muted">${v.kind}${v.size ? `, ${Math.max(1, Math.round(v.size / 1024 / 1024))} MB` : ''}${v.link ? ', bağlantı' : ''}</span></span>
          <span class="sel__actions">
            ${v.file_key ? h`<a class="btn btn--text btn--sm" href="/v/${v.id}" target="_blank" rel="noopener">İzle</a>` : h`<a class="btn btn--text btn--sm" href="${v.link}" target="_blank" rel="noopener">Aç</a>`}
            <form method="post" action="${base}/video/${v.id}/sil" data-confirm="Bu video silinsin mi?">${csrfField(csrf)}<button class="btn btn--text btn--sm btn--danger-text" type="submit" aria-label="Sil">${icon('trash')}</button></form>
          </span>
        </li>`)}</ul>` : ''}
      <form class="vup" data-video-upload data-endpoint="${base}/video/parca">
        <div class="appt-row">
          <div class="field"><label for="v-title">Başlık</label><input id="v-title" type="text" maxlength="120" placeholder="Örn. Düğün klibi" data-v-title></div>
          <div class="field"><label for="v-kind">Tür</label><select id="v-kind" data-v-kind>${['Klip', 'Düğün filmi', 'Reels', 'Teaser', 'Diğer'].map((k) => h`<option>${k}</option>`)}</select></div>
        </div>
        <label class="btn btn--outline btn--sm vup__pick">${icon('upload')}Video seç ve yükle<input type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v" data-v-file></label>
        <div class="vup__progress" data-v-progress hidden><span class="vup__bar"><span data-v-bar></span></span><span class="vup__text" data-v-text></span></div>
      </form>
      <details class="vlink">
        <summary>Ya da bağlantı ekleyin (Google Drive, YouTube, Vimeo…)</summary>
        <form class="form" method="post" action="${base}/video/baglanti">
          ${csrfField(csrf)}
          <div class="appt-row">
            <div class="field"><label for="l-title">Başlık</label><input id="l-title" name="title" type="text" maxlength="120"></div>
            <div class="field"><label for="l-kind">Tür</label><select id="l-kind" name="kind">${['Klip', 'Düğün filmi', 'Reels', 'Teaser', 'Diğer'].map((k) => h`<option>${k}</option>`)}</select></div>
          </div>
          <div class="field"><label for="l-link">Bağlantı</label><input id="l-link" name="link" type="text" inputmode="url" placeholder="https://" required></div>
          <button class="btn btn--outline btn--sm" type="submit">Bağlantıyı ekle</button>
        </form>
      </details>
    </section>

    </div>

    <div class="cd-pane" data-pane="teslim">
      <section class="panel-section" id="teslim" aria-labelledby="dl-title">
        <div class="panel-section__head appt-card__head">
          <h2 class="panel-section__title" id="dl-title">Teslim tutanağı</h2>
          <a class="btn btn--primary btn--sm" href="${base}/teslim">${icon('check')}${deliveries.length ? 'Yeni tutanak' : 'Teslim et'}</a>
        </div>
        ${deliveries.length ? h`<ul class="dl-list">${deliveries.map((d) => h`<li><span class="paypill paypill--paid">İmzalandı</span> ${require('./contract').trTime(d.created_at)} · ${d.signer_name} · <a href="${base}/teslim/${d.id}">Tutanağı aç</a></li>`)}</ul>`
          : h`<p class="muted">Flash bellek, albüm ve baskıları ofiste teslim ederken “Teslim et”e basın; çift ekranda imzalar, iş “Teslim” aşamasına geçer.</p>`}
      </section>
      ${gift ? giftSection(couple, gift, base, csrf) : ''}
    </div>

    <div class="cd-pane" data-pane="ayar">
          <section class="panel-section" aria-labelledby="access-title">
        <div class="panel-section__head"><h2 class="panel-section__title" id="access-title">Giriş bilgileri</h2></div>
        <p class="muted">Giriş adresi: <code>${loginUrl}</code></p>
        <p class="muted">Erişim kodu: <code>${couple.access_code}</code></p>
        <p class="muted">${couple.first_seen_at ? `İlk giriş ${seenText(couple.first_seen_at)}, son giriş ${seenText(couple.last_seen_at)}, toplam ${couple.visit_count} kez.` : 'Çift panele henüz hiç girmedi. Giriş bilgilerini WhatsApp’tan yeniden gönderebilir ya da şifreyi yenileyebilirsiniz.'}</p>
        <form method="post" action="${base}/sifre" data-confirm="Yeni şifre oluşturulsun mu? Eski şifre çalışmayı bırakır.">
          ${csrfField(csrf)}
          <button class="btn btn--outline" type="submit">Şifre yenile</button>
        </form>
      </section>

    <section class="danger-zone" id="dosyalar" aria-labelledby="files-title">
      <h2 class="card__title" id="files-title">Sunucudan dosyaları sil</h2>
      ${couple.archived_at ? h`<p class="muted">Dosyalar ${shortDate(couple.archived_at)} tarihinde temizlendi (${couple.archived_photos} fotoğraf). Seçim listesi hâlâ indirilebilir: <a href="${base}/secim.txt">Listeyi indir</a></p>` : ''}
      <p class="muted">Teslim bittiyse yer açmak için yalnızca fotoğraf ve video dosyalarını silin. Çift kartı, randevular, ödemeler ve albüm seçim listesi kalır.</p>
      <form method="post" action="${base}/dosyalari-sil" class="form form--compact" data-confirm="${couple.name} için dosyalar sunucudan kalıcı olarak silinsin mi? Arşivi indirdiniz mi?">
        ${csrfField(csrf)}
        <div class="clear-what">
          <label class="check"><input type="radio" name="ne" value="hepsi" checked><span>Tüm fotoğraflar (seçim + düzenlenmiş)</span></label>
          <label class="check"><input type="radio" name="ne" value="secim"><span>Sadece seçim fotoğrafları (düzenlenmişler çiftte kalsın)</span></label>
        </div>
        <label class="check"><input type="checkbox" name="videolar" value="1"><span>Videoları da sil</span></label>
        <button class="btn btn--outline btn--sm btn--danger-text" type="submit">Dosyaları sil</button>
      </form>
    </section>

    <section class="danger-zone" aria-labelledby="danger-title">
      <h2 class="card__title" id="danger-title">Çifti sil</h2>
      <p class="muted">Çift, tüm fotoğrafları ve favorileri kalıcı olarak silinir.</p>
      <form method="post" action="${base}/sil" data-confirm="${couple.name} ve tüm fotoğrafları kalıcı olarak silinsin mi? Bu işlem geri alınamaz.">
        ${csrfField(csrf)}
        <button class="btn btn--danger" type="submit">${icon('trash')}Çifti sil</button>
      </form>
    </section>
    </div>
  </div>`;
  return panelLayout(c, { title: couple.name, csrf, nav: adminNav('couples', csrf, demoAdmin), home: '/admin', tabs: adminTabs('couples', demoAdmin), body, scripts: ['/js/panel.js?v=5', '/js/admin.js?v=7', '/js/video-upload.js?v=1', '/js/cdtabs.js?v=1'] });
}

function calendar(c, { couples, monthEvents = [], ym = today().slice(0, 7), csrf, demoAdmin }) {
  const t = today();
  const rows = couples.map((k) => ({ k, st: jobStatus(k, c.stages) }));
  const count = (key) => rows.filter((r) => r.st[0] === key).length;
  const deliveries = rows.filter((r) => ['late', 'soon', 'ok'].includes(r.st[0])).sort((a, b) => (a.k.due_date || '9').localeCompare(b.k.due_date || '9'));
  const shoots = rows.filter((r) => r.st[0] === 'upcoming').sort((a, b) => a.k.event_date.localeCompare(b.k.event_date));
  const done = rows.filter((r) => r.st[0] === 'done');
  const item = (r, mode) => {
    const d = mode === 'shoot' ? r.k.event_date : r.k.due_date;
    const dt = d ? new Date(`${d}T12:00:00`) : null;
    const n = d ? daysBetween(t, d) : null;
    const rel = n === null ? 'Teslim tarihi yok' : n === 0 ? 'bugün' : n > 0 ? `${n} gün kaldı` : `${Math.abs(n)} gün geçti`;
    return h`<li class="job">
      <div class="job__date" aria-hidden="true">${dt ? h`<span class="job__day">${dt.getDate()}</span><span class="job__mon">${dt.toLocaleDateString('tr-TR', { month: 'short' })}</span>` : h`<span class="job__day">—</span>`}</div>
      <div class="job__main"><a class="strong-link" href="/admin/ciftler/${r.k.id}">${r.k.name}</a>
        <span class="muted">${mode === 'shoot' ? `Çekim · ${formatDate(d)}` : `${d ? `Teslim · ${formatDate(d)}` : 'Teslim tarihi girilmedi'} · ${c.stages[r.k.stage] || ''}`}</span></div>
      <div class="job__side"><span class="state state--${r.st[0]}">${r.st[1]}</span>${mode === 'done' ? '' : h`<span class="muted job__rel">${rel}</span>`}</div>
    </li>`;
  };
  const body = h`
  <div class="container">
    <div class="panel-title-row"><h1 class="page-title">Takvim</h1><a class="btn btn--primary btn--sm" href="/admin/randevu/yeni">${icon('plus')}Yeni randevu</a></div>
    ${monthCalendar(monthEvents, ym)}
    <div class="stats stats--4">
      <div class="stat"><span class="stat__num">${count('late')}</span><span class="stat__label">Geciken teslim</span></div>
      <div class="stat"><span class="stat__num">${count('soon')}</span><span class="stat__label">Bu hafta teslim</span></div>
      <div class="stat"><span class="stat__num">${count('ok')}</span><span class="stat__label">Devam eden iş</span></div>
      <div class="stat"><span class="stat__num">${shoots.length}</span><span class="stat__label">Yaklaşan çekim</span></div>
    </div>
    <section class="panel-section" id="teslimler">
      <div class="panel-section__head"><h2 class="panel-section__title">Teslimler</h2>
        <p class="muted">En yakın teslim en üstte. Teslim tarihini çiftin sayfasındaki Bilgiler kartından değiştirebilirsiniz.</p></div>
      ${deliveries.length ? h`<ul class="jobs">${deliveries.map((r) => item(r, 'due'))}</ul>` : h`<div class="empty-box"><p>Bekleyen teslim yok.</p></div>`}
    </section>
    <section class="panel-section">
      <div class="panel-section__head"><h2 class="panel-section__title">Yaklaşan çekimler</h2></div>
      ${shoots.length ? h`<ul class="jobs">${shoots.map((r) => item(r, 'shoot'))}</ul>` : h`<div class="empty-box"><p>Planlanmış çekim yok. Çifte çekim tarihi girdiğinizde burada görünür.</p></div>`}
    </section>
    ${done.length ? h`<section class="panel-section">
      <div class="panel-section__head"><h2 class="panel-section__title">Teslim edilenler</h2></div>
      <ul class="jobs">${done.map((r) => item(r, 'done'))}</ul>
    </section>` : ''}
  </div>`;
  return panelLayout(c, { title: 'Takvim', csrf, nav: adminNav('calendar', csrf, demoAdmin), home: '/admin', tabs: adminTabs('calendar', demoAdmin), body });
}

function portfolioAdmin(c, { items, heroId, csrf, flash: f, demoAdmin }) {
  const catOptions = (selected) => h`<option value="">Etiket yok</option>${c.portfolio.categories.map((k) => h`<option value="${k}"${k === selected ? raw(' selected') : ''}>${k}</option>`)}`;
  const { slugify } = require('../routes/guards');
  const count = {};
  for (const p of items) for (const t of p.tags || []) count[t] = (count[t] || 0) + 1;
  const tagLinks = c.portfolio.categories.filter((t) => count[t]);
  const body = h`
  <div class="container">
    <div class="panel-title-row">
      <h1 class="page-title">Portfolyo</h1>
      <a class="btn btn--outline btn--sm" href="/portfolyo" target="_blank" rel="noopener">Sitede gör ${icon('arrow')}</a>
    </div>
    ${flashBlock(f)}

    <section class="panel-section" aria-labelledby="pf-links">
      <div class="panel-section__head">
        <h2 class="panel-section__title" id="pf-links">Etiket bağlantıları</h2>
        <p class="muted">Çift “Sinop’tan örnek var mı?” dediğinde ilgili bağlantıyı gönderin; yalnızca o etiketin fotoğrafları açılır. <a href="/admin/portfolyo-etiketleri">Etiketleri düzenle</a></p>
      </div>
      ${tagLinks.length ? h`<ul class="taglinks">${tagLinks.map((t) => {
        const url = `${config.siteUrl}/portfolyo/${slugify(t)}`;
        const text = `${t} çekimlerimizden örnekler: ${url}`;
        return h`<li class="taglinks__row">
          <span class="taglinks__name">${t} <span class="muted">· ${count[t]}</span></span>
          <span class="taglinks__acts">
            <button type="button" class="btn btn--text btn--sm" data-copy="${url}">${icon('copy')}Kopyala</button>
            <a class="btn btn--text btn--sm" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">${icon('whatsapp')}Gönder</a>
          </span>
        </li>`;
      })}</ul>` : h`<p class="muted">Fotoğraflara etiket verdiğinizde bağlantıları burada çıkar.</p>`}
    </section>

    <section class="panel-section" aria-labelledby="pf-upload">
      <div class="panel-section__head">
        <h2 class="panel-section__title" id="pf-upload">Portfolyoya fotoğraf ekle</h2>
        <p class="muted">Instagram'da paylaştığınız fotoğrafları buraya yükleyin. Bu fotoğraflar herkese açık sitede görünür.</p>
      </div>
      <form class="uploader" data-uploader data-endpoint="/admin/portfolyo">
        <div class="field field--inline">
          <label for="pf-cat">Etiket</label>
          <select id="pf-cat" data-category>${catOptions('')}</select>
        </div>
        <label class="uploader__drop">
          ${icon('upload')}
          <span><strong>Fotoğraf seçin</strong> veya buraya sürükleyin</span>
          <span class="muted">JPG, PNG veya WEBP · çoklu seçim</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple data-files>
        </label>
        <ul class="uploader__list" data-list aria-live="polite"></ul>
      </form>
    </section>

    <section class="panel-section" aria-labelledby="pf-list">
      <div class="panel-section__head">
        <h2 class="panel-section__title" id="pf-list">Yüklü fotoğraflar <span class="muted">(${items.length})</span></h2>
        <p class="muted">"Kapak yap" ile anasayfadaki büyük fotoğrafı seçin.</p>
      </div>
      ${items.length ? h`
      <ul class="pf-admin">
        ${items.map((p) => h`
        <li class="pf-admin__item${p.id === heroId ? ' is-hero' : ''}">
          <a class="pf-admin__img" href="${p.display}" data-lb><img src="${p.thumb}" alt="${p.alt || p.category || 'Portfolyo fotoğrafı'}" loading="lazy"></a>
          ${p.id === heroId ? h`<span class="badge badge--done pf-admin__badge">Kapak</span>` : ''}
          <form class="form form--compact" method="post" action="/admin/portfolyo/${p.id}">
            ${csrfField(csrf)}
            <fieldset class="tagpick"><legend class="sr-only">Etiketler</legend>
              ${c.portfolio.categories.map((t) => h`<label class="tagpick__c"><input type="checkbox" name="tags[]" value="${t}"${(p.tags || []).includes(t) ? raw(' checked') : ''}><span>${t}</span></label>`)}
            </fieldset>
            <label class="sr-only" for="alt-${p.id}">Açıklama</label>
            <input id="alt-${p.id}" name="alt" type="text" maxlength="160" placeholder="Kısa açıklama (erişilebilirlik)" value="${p.alt}">
            <button class="btn btn--outline btn--sm" type="submit">Kaydet</button>
          </form>
          <div class="pf-admin__actions">
            <form method="post" action="/admin/portfolyo/${p.id}/kapak">${csrfField(csrf)}<button class="btn btn--text btn--sm" type="submit">${icon('star')}Kapak yap</button></form>
            <form method="post" action="/admin/portfolyo/${p.id}/sil" data-confirm="Bu fotoğraf portfolyodan silinsin mi?">${csrfField(csrf)}<button class="btn btn--text btn--sm btn--danger-text" type="submit">${icon('trash')}Sil</button></form>
          </div>
        </li>`)}
      </ul>` : h`<div class="empty-box">${icon('image')}<p>Henüz portfolyo fotoğrafı yok.</p></div>`}
    </section>
  </div>`;
  return panelLayout(c, { title: 'Portfolyo', csrf, nav: adminNav('portfolio', csrf, demoAdmin), home: '/admin', tabs: adminTabs('portfolio', demoAdmin), body, scripts: ['/js/admin.js?v=7'] });
}

// Ekip: personel ekle, düzenle, sil; her kişinin görevleri
function teamPage(c, { team, member, memberEvents, csrf, flash: f, demoAdmin }) {
  const roles = c.appointments?.teamRoles || [];
  const t = today();
  const form = (m, action, submit) => h`
    <form class="form" method="post" action="${action}">
      ${csrfField(csrf)}
      <div class="appt-row">
        <div class="field"><label for="m-name">Ad soyad</label><input id="m-name" name="name" type="text" required maxlength="60" value="${m.name || ''}"></div>
        <div class="field"><label for="m-role">Görevi</label><select id="m-role" name="role"><option value="">Seçin</option>${roles.map((r) => h`<option${r === m.role ? raw(' selected') : ''}>${r}</option>`)}</select></div>
      </div>
      <div class="field"><label for="m-phone">Telefon (WhatsApp)</label><input id="m-phone" name="phone" type="tel" inputmode="tel" maxlength="20" placeholder="05XX XXX XX XX" value="${m.phone ? displayPhone(m.phone) : ''}"></div>
      <div class="field"><label for="m-notes">Bilgiler / notlar</label><textarea id="m-notes" name="notes" rows="3" maxlength="1000" placeholder="Ekipman, ücret, IBAN, beden, uygun olmadığı günler…">${m.notes || ''}</textarea></div>
      <label class="check"><input type="checkbox" name="active" value="1"${m.active === 0 ? '' : raw(' checked')}><span>Aktif (görev verilebilir)</span></label>
      <label class="check"><input type="checkbox" name="waOptin" value="1"${m.wa_optin === 0 ? '' : raw(' checked')}><span>Görev verilince WhatsApp mesajı gönderilsin</span></label>
      <div class="appt-actions"><button class="btn btn--primary" type="submit">${submit}</button>${member ? h`<a class="btn btn--text" href="/admin/ekip">Vazgeç</a>` : ''}</div>
    </form>`;
  const body = h`
  <div class="container">
    <a class="back-link" href="/admin/hesap">${icon('left')}Ayarlar</a>
    <div class="panel-title-row"><h1 class="page-title">Ekip</h1></div>
    ${flashBlock(f)}
    <div class="team-grid">
      <section aria-labelledby="team-list">
        <h2 class="panel-section__title" id="team-list">Personel <span class="muted">(${team.length})</span></h2>
        ${team.length ? h`<ul class="team-list">${team.map((m) => h`
          <li class="team-row${m.active ? '' : ' is-off'}${member && member.id === m.id ? ' is-current' : ''}">
            <div class="team-row__main">
              <strong>${m.name}</strong>
              <span class="muted">${[m.role, m.phone ? displayPhone(m.phone) : 'telefon yok', m.active ? '' : 'pasif'].filter(Boolean).join(' · ')}</span>
              ${m.upcoming ? h`<span class="team-row__up">${m.upcoming} yaklaşan görev</span>` : ''}
            </div>
            <div class="team-row__actions">
              <a class="btn btn--text btn--sm" href="/admin/ekip?duzenle=${m.id}">Düzenle</a>
              <form method="post" action="/admin/ekip/${m.id}/sil" data-confirm="${m.name} ekipten silinsin mi? Verilmiş görevlerden de çıkarılır.">${csrfField(csrf)}<button class="btn btn--text btn--sm btn--danger-text" type="submit" aria-label="Sil">${icon('trash')}</button></form>
            </div>
          </li>`)}</ul>` : h`<p class="muted">Henüz personel eklenmedi.</p>`}
      </section>
      <section class="card" aria-labelledby="team-form">
        <h2 class="card__title" id="team-form">${member ? `${member.name} · düzenle` : 'Personel ekle'}</h2>
        ${member ? form(member, `/admin/ekip/${member.id}`, 'Kaydet') : form({}, '/admin/ekip', 'Ekibe ekle')}
        ${member ? h`<div class="team-tasks">
          <h3 class="appt-sub">Görevleri</h3>
          ${memberEvents.length ? h`<ul class="plain-stats">${memberEvents.map((e) => h`<li><span><a href="/admin/ciftler/${e.couple_id}">${e.couple_name}</a> · ${e.event_type || 'Etkinlik'}</span><span class="${e.event_date >= t ? '' : 'muted'}">${shortDate(e.event_date)}${e.start_time ? ' ' + e.start_time : ''}</span></li>`)}</ul>` : h`<p class="muted">Görev verilmedi.</p>`}
        </div>` : ''}
      </section>
    </div>
  </div>`;
  return panelLayout(c, { title: 'Ekip', csrf, nav: adminNav('team', csrf, demoAdmin), home: '/admin', tabs: adminTabs('team', demoAdmin), body });
}

// Ayarlar › Mesajlar: WhatsApp mesaj metinleri
const MESSAGE_INFO = [
  ['randevu', 'Randevu oluşturuldu', 'Yeni randevu kaydedilince; panel giriş bilgileriyle birlikte.', ['ad', 'no', 'tarih', 'link', 'kod', 'sifre']],
  ['sozlesme', 'Sözleşme onaya sunuldu', 'Sözleşme çifte gönderilince.', ['ad', 'link']],
  ['kapora', 'Kapora hatırlatma', 'Kapora sözü verilen gün; kibar ödeme hatırlatması.', ['ad', 'tutar', 'tarih']],
  ['sozlesmeOnay', 'Sözleşme onaylandı', 'Çift sözleşmeyi onaylayınca; teşekkür ve bilgi mesajı.', ['ad', 'link']],
  ['plan', 'Çekim planı hatırlatması', 'Çekimden 3 gün önce, gün planı doldurulmadıysa.', ['ad', 'gun', 'link']],
  ['fotograflar', 'Seçim fotoğrafları hazır', 'Seçim fotoğrafları ilk yüklendiğinde.', ['ad', 'link']],
  ['teslim', 'Teslim edildi (video yok)', 'İş "Teslim" aşamasına alınınca, videosu olmayan işlerde.', ['ad', 'link']],
  ['teslimVideo', 'Teslim edildi (fotoğraf + video)', 'İş "Teslim" aşamasına alınınca, video da varsa.', ['ad', 'link']],
  ['yorum', 'Yorum isteği', 'Teslimden 7 gün sonra.', ['ad', 'link']],
  ['teklif', 'Fiyat teklifi', 'Teklif sayfasından “WhatsApp’tan gönder” ya da “Mesajı kopyala” ile.', ['ad', 'etkinlik', 'link']],
  ['albumTasarim', 'Albüm tasarımı hazır', 'Albüm sayfalarını çifte gönderdiğinizde.', ['ad', 'link']],
  ['yildonumu', 'Yıl dönümü kutlaması', 'Düğünden bir yıl (ve her yıl) sonra.', ['ad', 'yil', 'link']],
  ['gorev', 'Ekip görevi ve hatırlatması', 'Ekipten biri etkinliğe atanınca ve çekimden 3 gün önce.', ['ad', 'etkinlik', 'cift', 'tarih', 'saat', 'yer', 'not']],
];
const VAR_TEXT = { yil: 'kaçıncı yıl', ad: 'çiftin / kişinin adı', no: 'randevu no', tarih: 'tarih', link: 'bağlantı', kod: 'erişim kodu', sifre: 'şifre', gun: 'kalan gün', etkinlik: 'etkinlik türü', cift: 'çiftin adı', saat: 'saat', yer: 'mekân', not: 'not' };

// Ayarlar › Google ve şehir sayfaları
function citiesPage(c, { csrf, flash: f, demoAdmin, siteUrl }) {
  const b = c.business || {};
  const faqText = (faq) => (faq || []).map((x) => `${x.q}\n${x.a}`).join('\n\n');
  const body = h`
  <div class="container container--form">
    <a class="back-link" href="/admin/hesap">${icon('left')}Ayarlar</a>
    <h1 class="page-title">Google ve şehir sayfaları</h1>
    ${flashBlock(f)}
    <form class="form" method="post" action="/admin/sehirler">
      ${csrfField(csrf)}
      <p class="muted">Sayfaların Google’da görünen başlıkları: <a href="/admin/sayfa-basliklari">Ayarlar › Sayfa başlıkları</a>.</p>
      <section class="panel-section">
        <div class="panel-section__head"><h2 class="panel-section__title">İşletme bilgisi</h2></div>
        <p class="muted">Google’a “işletmemiz nerede, nerelere hizmet veriyor” diye bildirilir. Google İşletme Profilinizdeki bilgilerle aynı olmalı.</p>
        <div class="appt-row">
          <div class="field"><label for="b-loc">İlçe (adres)</label><input id="b-loc" name="locality" value="${b.locality || ''}" maxlength="60"></div>
          <div class="field"><label for="b-reg">İl (adres)</label><input id="b-reg" name="region" value="${b.region || ''}" maxlength="60"></div>
        </div>
        <div class="field"><label for="b-areas">Hizmet verilen şehirler <span class="muted">(virgülle)</span></label><input id="b-areas" name="areas" value="${(b.areas || []).join(', ')}" maxlength="200"></div>
        <div class="field"><label for="b-dg">Düğün.com profil bağlantınız <span class="muted">(isteğe bağlı)</span></label><input id="b-dg" name="dugunProfil" type="url" value="${b.dugunProfil || ''}" placeholder="https://www.dugun.com/…" maxlength="300"></div>
      </section>
      ${(c.cities || []).map((x, i) => h`
      <section class="panel-section">
        <div class="panel-section__head"><h2 class="panel-section__title">${x.title}</h2><a class="btn btn--text btn--sm" href="/${x.slug}" target="_blank" rel="noopener">Sayfayı aç ${icon('arrow')}</a></div>
        <p class="muted">${siteUrl}/${x.slug}</p>
        <div class="field"><label for="c${i}-t">Sayfa başlığı <span class="muted">(Google’da mavi başlık)</span></label><input id="c${i}-t" name="c${i}_title" value="${x.title}" maxlength="70"></div>
        <div class="field"><label for="c${i}-d">Google açıklaması <span class="muted">(başlığın altındaki 1–2 cümle, en fazla 160 harf)</span></label><textarea id="c${i}-d" name="c${i}_description" rows="2" maxlength="200">${x.description}</textarea></div>
        <div class="field"><label for="c${i}-l">Giriş cümlesi</label><input id="c${i}-l" name="c${i}_lead" value="${x.lead}" maxlength="200"></div>
        <div class="field"><label for="c${i}-p">Metin <span class="muted">(paragraflar arasında bir boş satır bırakın)</span></label><textarea id="c${i}-p" name="c${i}_paragraphs" rows="7" maxlength="3000">${(x.paragraphs || []).join('\n\n')}</textarea></div>
        <div class="field"><label for="c${i}-a">İlçeler ve semtler <span class="muted">(virgülle; mekân adları da yazabilirsiniz)</span></label><input id="c${i}-a" name="c${i}_areas" value="${(x.areas || []).join(', ')}" maxlength="400"></div>
        <div class="field"><label for="c${i}-f">Sık sorulan sorular <span class="muted">(ilk satır soru, alt satır cevap; sorular arasında bir boş satır)</span></label><textarea id="c${i}-f" name="c${i}_faq" rows="12" maxlength="5000">${faqText(x.faq)}</textarea></div>
      </section>`)}
      <button class="btn btn--primary" type="submit">Kaydet</button>
    </form>
  </div>`;
  return panelLayout(c, { title: 'Google ve şehir sayfaları', csrf, nav: adminNav('cities', csrf, demoAdmin), home: '/admin', tabs: adminTabs('cities', demoAdmin), body });
}

function reminderForm(c, { id, values: v = {}, action, title, errors = [], csrf, demoAdmin, today: t }) {
  const tm = addDays(t, 1);
  const body = h`
  <div class="container container--form">
    <a class="back-link" href="${v.back || '/admin'}">${icon('left')}Geri</a>
    <h1 class="page-title">${title}</h1>
    ${errors.length ? h`<div class="flash flash--error" role="alert">${errors.map((e) => h`<div>${e}</div>`)}</div>` : ''}
    <form class="form" method="post" action="${action}">
      ${csrfField(csrf)}
      <input type="hidden" name="back" value="${v.back || '/admin'}">
      <input type="hidden" name="couple" value="${v.couple || ''}"><input type="hidden" name="lead" value="${v.lead || ''}">
      <div class="field"><label for="rm-t">Ne yapılacak?</label><input id="rm-t" name="title" required maxlength="120" placeholder="Ör. Ayşe ile tanışma görüşmesi" value="${v.title || ''}" autofocus></div>
      <div class="appt-row">
        <div class="field"><label for="rm-d">Tarih</label><input id="rm-d" name="dueDate" type="date" required value="${v.dueDate || tm}"></div>
        <div class="field"><label for="rm-h">Saat <span class="muted">(isteğe bağlı)</span></label><input id="rm-h" name="dueTime" type="time" value="${v.dueTime || ''}"></div>
      </div>
      <div class="chips" aria-label="Hızlı tarih">
        <button type="button" class="chip" data-set-date="${t}">Bugün</button><button type="button" class="chip" data-set-date="${tm}">Yarın</button><button type="button" class="chip" data-set-date="${addDays(t, 7)}">1 hafta sonra</button>
      </div>
      <div class="appt-row">
        <div class="field"><label for="rm-p">Kişi <span class="muted">(isteğe bağlı)</span></label><input id="rm-p" name="person" maxlength="80" placeholder="Ör. Ayşe Yılmaz (Instagram)" value="${v.person || ''}"></div>
        <div class="field"><label for="rm-tel">Telefon <span class="muted">(isteğe bağlı)</span></label><input id="rm-tel" name="phone" type="tel" inputmode="tel" placeholder="05xx xxx xx xx" value="${v.phone || ''}"></div>
      </div>
      <div class="field"><label for="rm-n">Not <span class="muted">(isteğe bağlı)</span></label><textarea id="rm-n" name="note" rows="3" maxlength="600" placeholder="Ör. Ağustos düğünü, dış çekim de istiyor">${v.note || ''}</textarea></div>
      <p class="muted">Saatinde telefonunuza bildirim ve Telegram’a mesaj gelir; saat girmezseniz o gün sabah 9’da. Bugün sayfasındaki Yapılacaklar’da da görünür.</p>
      <button class="btn btn--primary" type="submit">${icon('bell')}Kaydet</button>
    </form>
    ${id ? h`<div class="cd-danger-row">
      <form method="post" action="/admin/hatirlatma/${id}/sil" class="inline-form" data-confirm="Bu hatırlatma silinsin mi?">${csrfField(csrf)}<button class="btn btn--text btn--sm btn--danger-text" type="submit">${icon('trash')}Sil</button></form>
    </div>` : ''}
  </div>`;
  return panelLayout(c, { title, csrf, nav: adminNav('couples', csrf, demoAdmin), home: '/admin', tabs: adminTabs('couples', demoAdmin), body, scripts: ['/js/admin.js?v=7'] });
}


// Ön randevular: tarihi belli olmayan çekimler
const preWhen = (p) => p.est_text || (p.est_date ? formatDate(p.est_date) : 'Tarih yok');
function preBadge(p, t) {
  if (!p.est_date) return h`<span class="pre-badge pre-badge--wait">Tarih bekleniyor</span>`;
  const d = daysBetween(t, p.est_date);
  if (d < 0) return h`<span class="pre-badge pre-badge--late">Tahmini tarih geçti</span>`;
  if (d <= 14) return h`<span class="pre-badge pre-badge--soon">${d === 0 ? 'Bugün' : `${d} gün kaldı`}</span>`;
  return h`<span class="pre-badge pre-badge--wait">Tarih bekleniyor</span>`;
}
function prebookRows(list, t) {
  return h`<ul class="pre-list">${list.map((p) => h`
    <li class="pre-item">
      <a class="pre-item__main" href="/admin/on-randevu/${p.id}">
        <b>${p.name}</b>
        <span class="muted">${p.event_type || 'Çekim'} · tahmini ${preWhen(p)}${p.deposit ? ` · kapora ${tl(p.deposit)}` : ''}</span>
      </a>
      ${preBadge(p, t)}
      <span class="pre-item__acts">
        ${p.phone ? h`<a class="btn btn--text btn--sm" href="https://wa.me/${p.phone}" target="_blank" rel="noopener" aria-label="WhatsApp">${icon('whatsapp')}</a>` : ''}
        <a class="btn btn--primary btn--sm" href="/admin/randevu/yeni?on=${p.id}">${icon('check')}Kesinleştir</a>
      </span>
    </li>`)}</ul>`;
}
function prebookBlock(list) {
  return h`<section class="pre-block" aria-labelledby="pre-title">
    <header class="sec-head"><h2 class="sec-title" id="pre-title">Ön randevular <span class="sec-count">${list.length}</span></h2>
      <a class="btn btn--text btn--sm" href="/admin/on-randevu/yeni">${icon('plus')}Ekle</a></header>
    ${list.length ? prebookRows(list.slice(0, 5), today()) : h`<p class="sec-empty">Tarihi belli olmayan çekim yok. Dış çekim gibi esnek randevuları buraya ekleyin.</p>`}
    ${list.length > 5 ? h`<a class="btn btn--text btn--sm" href="/admin/on-randevu">Tümü (${list.length})</a>` : ''}
  </section>`;
}
function prebookList(c, { list, csrf, demoAdmin, flash: f }) {
  const body = h`
  <div class="container">
    <a class="back-link" href="/admin">${icon('left')}Bugün</a>
    <div class="panel-title-row"><h1 class="page-title">Ön randevular</h1><a class="btn btn--primary btn--sm" href="/admin/on-randevu/yeni">${icon('plus')}Yeni ön randevu</a></div>
    ${flashBlock(f)}
    <p class="muted">Tarihi henüz belli olmayan çekimler. Takvimde görünmez, teslim süresi saymaz. Tahmini tarihten 2 hafta önce size hatırlatma gelir; tarih belli olunca “Kesinleştir” ile randevuya çevirin.</p>
    ${list.length ? prebookRows(list, today()) : h`<p class="sec-empty">Henüz ön randevu yok.</p>`}
  </div>`;
  return panelLayout(c, { title: 'Ön randevular', csrf, nav: adminNav('couples', csrf, demoAdmin), home: '/admin', tabs: adminTabs('couples', demoAdmin), body });
}
function prebookForm(c, { id, values: v = {}, action, title, errors = [], csrf, demoAdmin }) {
  const types = c.appointments?.eventTypes || [];
  const body = h`
  <div class="container container--form">
    <a class="back-link" href="/admin/on-randevu">${icon('left')}Ön randevular</a>
    <h1 class="page-title">${title}</h1>
    ${errors.length ? h`<div class="flash flash--error" role="alert">${errors.map((e) => h`<div>${e}</div>`)}</div>` : ''}
    <form class="form" method="post" action="${action}">
      ${csrfField(csrf)}
      <div class="appt-row">
        <div class="field"><label for="pb-n">Çiftin adı</label><input id="pb-n" name="name" required maxlength="120" placeholder="Ör. Ayşe & Ali" value="${v.name || ''}" autofocus></div>
        <div class="field"><label for="pb-p">Telefon <span class="muted">(isteğe bağlı)</span></label><input id="pb-p" name="phone" type="tel" inputmode="tel" placeholder="05xx xxx xx xx" value="${v.phone || ''}"></div>
      </div>
      <div class="appt-row">
        <div class="field"><label for="pb-t">Çekim türü</label><select id="pb-t" name="eventType">${[...new Set([v.eventType, ...types].filter(Boolean))].map((x) => h`<option${x === v.eventType ? raw(' selected') : ''}>${x}</option>`)}</select></div>
        <div class="field"><label for="pb-e">Tahmini tarih</label><input id="pb-e" name="estText" maxlength="80" placeholder="Ör. Nisan 2027, 10–25 Mayıs, Bahar" value="${v.estText || ''}"></div>
      </div>
      <div class="field"><label for="pb-d">En erken tarih <span class="muted">(isteğe bağlı, hatırlatma için)</span></label><input id="pb-d" name="estDate" type="date" value="${v.estDate || ''}">
        <p class="muted">Boş bırakırsanız tahmini tarihten anlaşılır (ör. “Nisan 2027” → 1 Nisan). 2 hafta önce hatırlatma gelir.</p></div>
      <div class="appt-row">
        <div class="field"><label for="pb-pr">Fiyat (₺) <span class="muted">(isteğe bağlı)</span></label><input id="pb-pr" name="price" inputmode="numeric" placeholder="0" value="${v.price || ''}" data-money></div>
        <div class="field"><label for="pb-dp">Kapora (₺) <span class="muted">(alındıysa)</span></label><input id="pb-dp" name="deposit" inputmode="numeric" placeholder="0" value="${v.deposit || ''}" data-money></div>
      </div>
      <div class="field"><label for="pb-no">Not <span class="muted">(isteğe bağlı)</span></label><textarea id="pb-no" name="note" rows="3" maxlength="600" placeholder="Ör. Hava güzel olunca, Kastamonu'da">${v.note || ''}</textarea></div>
      <button class="btn btn--primary" type="submit">${icon('check')}Kaydet</button>
    </form>
    ${id ? h`<div class="cd-danger-row">
      <a class="btn btn--outline btn--sm" href="/admin/randevu/yeni?on=${id}">${icon('check')}Kesinleştir, randevuya çevir</a>
      <form method="post" action="/admin/on-randevu/${id}/sil" class="inline-form" data-confirm="Bu ön randevu silinsin mi?">${csrfField(csrf)}<button class="btn btn--text btn--sm btn--danger-text" type="submit">${icon('trash')}Sil</button></form>
    </div>` : ''}
  </div>`;
  return panelLayout(c, { title, csrf, nav: adminNav('couples', csrf, demoAdmin), home: '/admin', tabs: adminTabs('couples', demoAdmin), body, scripts: ['/js/admin.js?v=7'] });
}

// Sayfa başlıkları: her sayfanın Google'da görünen başlığı ve açıklaması, canlı önizlemeyle
function seoPages(c) {
  const b = c.brand.name;
  const host = (() => { try { return new URL(config.siteUrl).host; } catch { return 'hm4studio.com'; } })();
  return [
    { key: 'home', name: 'Ana sayfa', path: '/', defT: c.seo?.title || b, defD: c.seo?.description || '' },
    { key: 'portfolio', name: 'Portfolyo', path: '/portfolyo', defT: `${c.portfolio.title} — ${b}`, defD: c.portfolio.text || '' },
    { key: 'about', name: 'Hakkımızda', path: '/hakkimizda', defT: `${c.about.title} — ${b}`, defD: c.about.lead || '' },
    { key: 'contact', name: 'İletişim', path: '/iletisim', defT: `${c.contact.title} — ${b}`, defD: c.contact.text || '' },
    { key: 'talep', name: 'Uygunluk sorun (form)', path: '/talep', defT: `Uygunluk sorun — ${b}`, defD: c.seo?.description || '' },
    ...(c.cities || []).map((x) => ({ key: `city:${x.slug}`, name: `Şehir: ${x.title}`, path: `/${x.slug}`, defT: `${x.title} | ${b}`, defD: x.description || '' })),
  ].map((p) => ({ ...p, host, cur: p.key === 'home' ? { title: c.seo?.title || '', description: c.seo?.description || '' } : (c.pageSeo?.[p.key] || {}) }));
}
// Müşteri kaynakları: randevu formundaki seçenekler ve kaç çiftin hangi kaynaktan geldiği

function portfolioTagsPage(c, { counts = {}, csrf, flash: f, demoAdmin }) {
  const list = c.portfolio.categories || [];
  const { slugify } = require('../routes/guards');
  const row = (t, i) => h`<li class="tagrow" data-tagrow>
      <input type="hidden" name="old_${i}" value="${t}">
      <label class="sr-only" for="tg-${i}">Etiket adı</label>
      <input id="tg-${i}" name="name_${i}" maxlength="40" value="${t}" placeholder="Yeni etiket, ör. Sinop">
      <span class="tagrow__n muted">${t ? `${counts[t] || 0} foto` : ''}</span>
      <span class="tagrow__acts">
        <button type="button" class="btn btn--text btn--sm" data-tag-up aria-label="Yukarı taşı">${icon('up')}</button>
        <button type="button" class="btn btn--text btn--sm" data-tag-del aria-label="Sil">${icon('trash')}</button>
      </span>
    </li>`;
  const body = h`
  <div class="container container--form">
    <a class="back-link" href="/admin/hesap">${icon('left')}Ayarlar</a>
    <h1 class="page-title">Portfolyo etiketleri</h1>
    ${flashBlock(f)}
    <p class="muted">Sitedeki portfolyoda üstte görünen mekan ve tarz başlıkları (ör. Ankara sokak, Göksu Restoran, Sinop, Gün batımı). Her etiketin kendi bağlantısı olur: <code>${config.siteUrl}/portfolyo/${slugify(list[0] || 'sinop')}</code></p>
    <form class="form" method="post" action="/admin/portfolyo-etiketleri" data-tagform>
      ${csrfField(csrf)}
      <ul class="tagrows" data-tagrows>${list.map((t, i) => row(t, i))}${[0, 1, 2].map((k) => row('', list.length + k))}</ul>
      <p class="muted">Adı değiştirirseniz fotoğraflardaki etiket de değişir. Silerseniz fotoğraflar silinmez, yalnızca o etiketten çıkar. Fotoğrafı olmayan etiketler sitede görünmez.</p>
      <button class="btn btn--primary" type="submit">${icon('check')}Kaydet</button>
    </form>
  </div>`;
  return panelLayout(c, { title: 'Portfolyo etiketleri', csrf, nav: adminNav('account', csrf, demoAdmin), home: '/admin', tabs: adminTabs('account', demoAdmin), body, scripts: ['/js/admin.js?v=7'] });
}

function sourcesPage(c, { counts = {}, csrf, flash: f, demoAdmin }) {
  const list = c.appointments?.sources || [];
  const extra = Object.keys(counts).filter((s) => !list.includes(s));
  const body = h`
  <div class="container container--form">
    <a class="back-link" href="/admin/hesap">${icon('left')}Ayarlar</a>
    <h1 class="page-title">Müşteri kaynakları</h1>
    ${flashBlock(f)}
    <p class="muted">Randevu eklerken “Müşteri kaynağı” listesinde çıkan seçenekler. Raporda hangi kanaldan kaç çift geldiğini bu seçimlerle görürsünüz.</p>
    <form class="form" method="post" action="/admin/kaynaklar">
      ${csrfField(csrf)}
      <div class="field"><label for="src-list">Kaynaklar <span class="muted">(her satıra bir tane, sırası listedeki sıradır)</span></label>
        <textarea id="src-list" name="sources" rows="${Math.max(list.length + 2, 6)}" maxlength="700">${list.join('\n')}</textarea></div>
      <button class="btn btn--primary" type="submit">Kaydet</button>
    </form>
    <section class="panel-section">
      <div class="panel-section__head"><h2 class="panel-section__title">Şu ana kadar</h2></div>
      <ul class="plain-stats">${[...list, ...extra].map((s) => h`<li><span>${s}${extra.includes(s) ? h` <span class="muted">(listede yok)</span>` : ''}</span><strong>${counts[s] || 0} çift</strong></li>`)}</ul>
      <p class="muted">Bir kaynağı listeden çıkarırsanız eski çiftlerdeki kayıt silinmez; yalnızca yeni randevularda seçilemez.</p>
    </section>
  </div>`;
  return panelLayout(c, { title: 'Müşteri kaynakları', csrf, nav: adminNav('account', csrf, demoAdmin), home: '/admin', tabs: adminTabs('account', demoAdmin), body });
}

function seoTitlesPage(c, { csrf, flash: f, demoAdmin }) {
  const pages = seoPages(c);
  const body = h`
  <div class="container container--form">
    <a class="back-link" href="/admin/hesap">${icon('left')}Ayarlar</a>
    <h1 class="page-title">Sayfa başlıkları</h1>
    ${flashBlock(f)}
    <p class="muted">Her sayfanın Google arama sonuçlarında ve paylaşımlarda (WhatsApp, Instagram) görünen başlığı ve açıklaması. Boş bırakırsanız gri yazan varsayılan kullanılır. Başlık 60, açıklama 155 harfi geçmesin; Google fazlasını keser.</p>
    <form class="form" method="post" action="/admin/sayfa-basliklari">
      ${csrfField(csrf)}
      ${pages.map((p) => h`<section class="panel-section seo-row" data-seo-row>
        <div class="panel-section__head"><h2 class="panel-section__title">${p.name}</h2></div>
        <div class="seo-prev" aria-hidden="true">
          <span class="seo-prev__url">${p.host}${p.path === '/' ? '' : p.path.replace(/\//g, ' › ')}</span>
          <span class="seo-prev__t" data-seo-pt>${p.cur.title || p.defT}</span>
          <span class="seo-prev__d" data-seo-pd>${p.cur.description || p.defD}</span>
        </div>
        <div class="field"><label for="st-${p.key}">Başlık <span class="muted" data-seo-n></span></label>
          <input id="st-${p.key}" name="t_${p.key}" maxlength="90" value="${p.cur.title || ''}" placeholder="${p.defT}" data-seo-t data-max="60"></div>
        <div class="field"><label for="sd-${p.key}">Açıklama <span class="muted" data-seo-n></span></label>
          <textarea id="sd-${p.key}" name="d_${p.key}" rows="2" maxlength="220" placeholder="${p.defD}" data-seo-d data-max="155">${p.cur.description || ''}</textarea></div>
      </section>`)}
      <button class="btn btn--primary" type="submit">Kaydet</button>
    </form>
  </div>`;
  return panelLayout(c, { title: 'Sayfa başlıkları', csrf, nav: adminNav('account', csrf, demoAdmin), home: '/admin', tabs: adminTabs('account', demoAdmin), body, scripts: ['/js/admin.js?v=7'] });
}

function deliverySettingsPage(c, { csrf, flash: f, demoAdmin }) {
  const d = c.delivery || {};
  const body = h`
  <div class="container container--form">
    <a class="back-link" href="/admin/hesap">${icon('left')}Ayarlar</a>
    <h1 class="page-title">Teslim</h1>
    ${flashBlock(f)}
    <form class="form" method="post" action="/admin/teslim-ayarlari">
      ${csrfField(csrf)}
      <section class="panel-section">
        <div class="panel-section__head"><h2 class="panel-section__title">Teslim tutanağındaki ürünler</h2></div>
        <p class="muted">Her satıra bir ürün. Tutanakta işaretli gelir; teslimde adet/açıklama eklenebilir.</p>
        <div class="field"><label for="dl-items" class="sr-only">Ürünler</label><textarea id="dl-items" name="items" rows="5">${(d.items || []).join('\n')}</textarea></div>
      </section>
      <section class="panel-section">
        <div class="panel-section__head"><h2 class="panel-section__title">Tutanak metni</h2></div>
        <p class="muted">Çiftin imzaladığı cümle. <code>{ad}</code> çiftin adı, <code>{tarih}</code> teslim tarihi, <code>{firma}</code> firma adı, <code>{gun}</code> saklama süresi olarak dolar.</p>
        <div class="field"><label for="dl-st" class="sr-only">Tutanak metni</label><textarea id="dl-st" name="statement" rows="6" maxlength="1500">${d.statement || ''}</textarea></div>
      </section>
      <section class="panel-section">
        <div class="panel-section__head"><h2 class="panel-section__title">Dosyaların saklanma süresi</h2></div>
        <p class="muted">Teslimden sonra çifte “son indirme günü” olarak gösterilir. Süre dolunca Yapılacaklar’a hatırlatma düşer; dosyaları siz silersiniz.</p>
        <div class="field field--narrow"><label for="dl-keep">Gün</label><input id="dl-keep" name="keepDays" type="number" min="7" max="730" value="${d.keepDays || 90}"></div>
      </section>
      <button class="btn btn--primary" type="submit">Kaydet</button>
    </form>
  </div>`;
  return panelLayout(c, { title: 'Teslim', csrf, nav: adminNav('account', csrf, demoAdmin), home: '/admin', tabs: adminTabs('account', demoAdmin), body });
}

function messagesPage(c, { wa: w, base, csrf, flash: f, demoAdmin }) {
  const k = w.kurallar || {};
  const body = h`
  <div class="container container--form">
    <a class="back-link" href="/admin/hesap">${icon('left')}Ayarlar</a>
    <h1 class="page-title">Mesajlar</h1>
    ${flashBlock(f)}
    <p class="muted">Çiftlere ve ekibe giden WhatsApp mesajları. Süslü parantez içindeki alanlar (örneğin <code>{ad}</code>) her mesajda kendiliğinden dolar; silmeyin. Bir metni boş bırakırsanız ilk hâline döner.</p>
    <form class="form" method="post" action="/admin/mesajlar">
      ${csrfField(csrf)}
      <section class="panel-section">
        <div class="panel-section__head"><h2 class="panel-section__title">Google yorum bağlantısı</h2></div>
        <p class="muted">Google İşletme Profilinizde “Yorum isteyin” / “Profili paylaş” ile alınan bağlantı (https://g.page/r/… gibi). Yorum mesajında ve teslimden sonra çift panelinde kullanılır.</p>
        <div class="field"><label for="wa-yl" class="sr-only">Google yorum bağlantısı</label><input id="wa-yl" name="yorumLinki" type="url" inputmode="url" placeholder="https://g.page/r/..." value="${/^https:/.test(w.yorumLinki || '') ? w.yorumLinki : ''}"></div>
      </section>
      <section class="panel-section">
        <div class="panel-section__head"><h2 class="panel-section__title">Zamanlama</h2></div>
        <div class="appt-row">
          <div class="field"><label for="wa-h">Etkinlik hatırlatması <span class="muted">(kaç gün önce)</span></label><input id="wa-h" name="hatirlatmaGunOnce" type="number" min="1" max="30" value="${k.hatirlatmaGunOnce ?? 3}"></div>
          <div class="field"><label for="wa-y">Yorum isteği <span class="muted">(çekimden kaç gün sonra)</span></label><input id="wa-y" name="yorumIstemeGunSonra" type="number" min="1" max="60" value="${k.yorumIstemeGunSonra ?? 7}"></div>
          <div class="field"><label for="wa-a">Yıldönümü mesajı <span class="muted">(en geç kaç gün sonra)</span></label><input id="wa-a" name="yildonumuGunSonra" type="number" min="0" max="60" value="${k.yildonumuGunSonra ?? 7}"></div>
        </div>
      </section>
      ${MESSAGE_INFO.map(([key, title, when, vars]) => {
        const cur = w.sablonlar[key]?.metin || '';
        const def = base.sablonlar[key]?.metin || '';
        return h`<section class="panel-section msg-edit" id="m-${key}">
          <div class="panel-section__head"><h2 class="panel-section__title">${title}</h2>${cur !== def ? h`<span class="badge">Düzenlendi</span>` : ''}</div>
          <p class="muted">${when}</p>
          <div class="field"><label for="m-t-${key}" class="sr-only">${title}</label><textarea id="m-t-${key}" name="m_${key}" rows="${Math.min(12, cur.split('\n').length + 2)}" maxlength="1000">${cur}</textarea></div>
          <p class="msg-vars">${vars.map((v) => h`<span><code>{${v}}</code> ${VAR_TEXT[v]}</span>`)}</p>
          ${cur !== def ? h`<label class="check"><input type="checkbox" name="reset_${key}" value="1"><span>İlk hâline döndür</span></label>` : ''}
        </section>`;
      })}
      <button class="btn btn--primary" type="submit">Kaydet</button>
      <p class="muted">Not: İleride WhatsApp otomatik gönderim (Meta) kurulursa, Meta'da onaylatılan şablon metinleri buradakilerle aynı olmalıdır.</p>
    </form>
  </div>`;
  return panelLayout(c, { title: 'Mesajlar', csrf, nav: adminNav('messages', csrf, demoAdmin), home: '/admin', tabs: adminTabs('messages', demoAdmin), body });
}

function account(c, { admin, csrf, flash: f, demoAdmin }) {
  const gs = (() => { try { return require('../gifts').settings(); } catch { return {}; } })();
  const groups = [
    { title: 'İşletme', links: [
      { href: '/admin/paketler', title: 'Paketler', text: 'Hizmetler, fiyatlar ve içerikleri' },
      { href: '/admin/ekip', title: 'Ekip', text: 'Personel ve iletişim' },
      { href: '/admin/kaynaklar', title: 'Müşteri kaynakları', text: 'Instagram, Düğün.com, tavsiye… randevu formundaki seçenekler' },
      { href: '/admin/sozlesme', title: 'Sözleşme ve KVKK', text: 'Sözleşme metni, firma bilgileri ve KVKK' },
      { href: '/admin/teslim-ayarlari', title: 'Teslim', text: 'Tutanaktaki ürünler, tutanak metni, dosya saklama süresi' },
    ] },
    { title: 'Müşteriyle iletişim', links: [
      { href: '/admin/mesajlar', title: 'Mesajlar', text: 'WhatsApp metinleri, zamanlama, Google yorum bağlantısı' },
      { href: '/admin/hediye', title: 'Hediye kuponları', text: `Tavsiye programı · ${gs.active ? 'açık' : 'kapalı'}` },
    ] },
    { title: 'Web sitesi', links: [
      { href: '/admin/site', title: 'Site', text: 'Metinler, renkler, kapak, iletişim' },
      { href: '/admin/portfolyo', title: 'Portfolyo', text: 'Sitedeki fotoğraflar ve etiket bağlantıları' },
      { href: '/admin/portfolyo-etiketleri', title: 'Portfolyo etiketleri', text: 'Mekan ve tarz başlıkları: Sinop, Göksu, Gün batımı…' },
      { href: '/admin/sayfa-basliklari', title: 'Sayfa başlıkları', text: 'Her sayfanın Google’da görünen başlığı ve açıklaması' },
      { href: '/admin/sehirler', title: 'Google ve şehir sayfaları', text: 'Şehir sayfaları ve işletme bilgileri' },
    ] },
    { title: 'Hesap', links: [
      { href: '#bildirim', title: 'Telefon bildirimleri', text: 'Bu cihaza bildirim' },
      { href: '/admin/veriler', title: 'Veriler ve yedek', text: 'Sezon arşivleri ve gece yedekleri' },
      { href: '#sifre', title: 'Şifre', text: `Kullanıcı adı: ${admin.username}` },
      ...(demoAdmin ? [] : [{ href: '/admin/gorusler', title: 'Görüşler', text: 'Demo ziyaretçilerinin görüşleri' }]),
    ] },
  ];
  const body = h`
  <div class="container container--form">
    <h1 class="page-title">Ayarlar</h1>
    ${flashBlock(f)}
    ${groups.map((g) => h`<section class="set-group">
      <h2 class="set-group__title">${g.title}</h2>
      <ul class="set-links">${g.links.map((l) => h`<li><a href="${l.href}"><span class="set-links__title">${l.title}</span><span class="set-links__text">${l.text}</span>${icon('right')}</a></li>`)}</ul>
    </section>`)}

    <section class="panel-section" id="sifre">
      <div class="panel-section__head"><h2 class="panel-section__title">Şifre</h2></div>
      <p class="muted">Kullanıcı adı: ${admin.username}</p>
      <form class="form" method="post" action="/admin/hesap">
        ${csrfField(csrf)}
        <div class="appt-row">
          <div class="field"><label for="cur">Mevcut şifre</label><input id="cur" name="current" type="password" autocomplete="current-password" required></div>
          <div class="field"><label for="new">Yeni şifre (en az 10 karakter)</label><input id="new" name="next" type="password" autocomplete="new-password" minlength="10" required></div>
        </div>
        <button class="btn btn--primary" type="submit">Şifreyi değiştir</button>
      </form>
    </section>
    <section class="panel-section" id="bildirim">
      <div class="panel-section__head"><h2 class="panel-section__title">Telefon bildirimleri</h2></div>
      <div class="pushbox" data-push data-off-text="Yeni talep geldiğinde, sözleşme onaylandığında ve albüm seçimi bittiğinde bu cihaza bildirim gelsin." hidden><span class="pushbox__icon" aria-hidden="true">${icon('bell')}</span><p class="pushbox__text" data-push-text></p><button type="button" class="btn btn--primary btn--sm" data-push-btn hidden></button></div>
    </section>
    <section class="panel-section">
      <div class="panel-section__head"><h2 class="panel-section__title">Oturum</h2></div>
      ${logoutForm(csrf, 'Bu cihazda çıkış yap')}
    </section>
  </div>`;
  return panelLayout(c, { title: 'Ayarlar', csrf, nav: adminNav('account', csrf, demoAdmin), home: '/admin', tabs: adminTabs('account', demoAdmin), body, scripts: ['/js/push.js?v=2'] });
}

// Veriler: sezon arşivleri ve veritabanı yedekleri
function dataPage(c, { disk = null, storage = [], diskTotal = 0, backups, seasons, csrf, flash: f, demoAdmin }) {
  const mb = (n) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1).replace('.', ',')} GB` : n > 1024 * 1024 ? `${Math.round(n / 1024 / 1024)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const body = h`
  <div class="container container--form">
    <a class="back-link" href="/admin/hesap">${icon('left')}Ayarlar</a>
    <h1 class="page-title">Veriler</h1>
    ${flashBlock(f)}

    <section class="panel-section">
      <div class="panel-section__head">
        <h2 class="panel-section__title">Sezon arşivleri</h2>
        <p class="muted">Bir sezonu tek dosya olarak indirin: o yılın randevuları ve ödemeleri (Excel), veritabanının kopyası ve çiftlerin tüm fotoğrafları. Sezon bitince indirip harici diske veya buluta koymanızı öneririz.</p>
      </div>
      ${seasons.length ? h`<ul class="data-list">${seasons.map((x) => h`
        <li>
          <span class="data-list__main"><span class="data-list__title">${x.year} sezonu</span><span class="data-list__meta">${x.couples} çift, ${x.events} etkinlik, ${x.photos} fotoğraf</span></span>
          <a class="btn btn--outline btn--sm" href="/admin/veriler/sezon/${x.year}" download>${icon('download')}Arşivi indir</a>
        </li>`)}</ul>` : h`<p class="sec-empty">Henüz etkinlik yok.</p>`}
      <p class="hint">Arşiv .tar biçimindedir; Mac'te çift tıklayınca, Windows'ta "Tümünü ayıkla" ile açılır. Fotoğraf sayısına göre indirme birkaç dakika sürebilir.</p>
    </section>

    <section class="panel-section" id="alan">
      <div class="panel-section__head">
        <h2 class="panel-section__title">Sunucu alanı</h2>
        ${disk ? (() => {
          const used = disk.total - disk.free;
          const pct = Math.round((used / disk.total) * 100);
          return h`<div class="disk">
            <div class="disk__nums"><span><strong>${mb(disk.free)}</strong> boş</span><span class="muted">${mb(disk.total)} diskin %${pct}'i dolu · fotoğraf ve videolar ${mb(diskTotal)}</span></div>
            <span class="disk__bar${pct >= 85 ? ' is-full' : ''}"><span data-pct="${pct}"></span></span>
            ${pct >= 85 ? h`<p class="disk__warn">Disk dolmak üzere. Teslimi biten çiftlerin dosyalarını aşağıdan silin.</p>` : ''}
          </div>`;
        })() : h`<p class="muted">Fotoğraf ve videolar: ${mb(diskTotal)}</p>`}
        <p class="muted">Teslimi biten çiftlerin fotoğraf (ve isterseniz video) dosyalarını sunucudan silin. Çift kartı, randevular, ödemeler ve albüm seçim listesi (seri numaraları) silinmez. Silmeden önce sezon arşivini indirmeyi unutmayın.</p>
      </div>
      ${storage.length ? h`<form method="post" action="/admin/veriler/temizle" data-confirm="Seçilen çiftlerin dosyaları sunucudan kalıcı olarak silinsin mi? Sezon arşivini indirdiniz mi?">
        ${csrfField(csrf)}
        <ul class="data-list store-list">${storage.map(({ k, u, done }) => h`
          <li>
            <label class="store-row">
              <input type="checkbox" name="cift[]" value="${k.id}"${done ? raw(' checked') : ''}>
              <span class="data-list__main"><span class="data-list__title">${k.name}</span><span class="data-list__meta">${c.stages[k.stage] || ''}${k.event_date ? `, ${shortDate(k.event_date)}` : ''}</span></span>
            </label>
            <span class="store-size">${mb(u.photos)} fotoğraf${u.videos ? h`<br>${mb(u.videos)} video` : ''}</span>
          </li>`)}</ul>
<div class="clear-what">
          <label class="check"><input type="radio" name="ne" value="hepsi" checked><span>Tüm fotoğraflar (seçim + düzenlenmiş)</span></label>
          <label class="check"><input type="radio" name="ne" value="secim"><span>Sadece seçim fotoğrafları (düzenlenmişler çiftte kalsın)</span></label>
        </div>
        <label class="check"><input type="checkbox" name="videolar" value="1"><span>Videoları da sil</span></label>
        <button class="btn btn--outline btn--sm btn--danger-text" type="submit">Seçilenlerin dosyalarını sil</button>
        <p class="hint">"Teslim" aşamasındaki çiftler önceden işaretli gelir.</p>
      </form>` : h`<p class="sec-empty">Sunucuda çift dosyası yok.</p>`}
    </section>

    <section class="panel-section">
      <div class="panel-section__head">
        <h2 class="panel-section__title">Veritabanı yedekleri</h2>
        <p class="muted">Her gece kendiliğinden alınır, son 14 gün saklanır. Bir sorun olursa bu dosyadan her şey geri yüklenebilir.</p>
      </div>
      <form method="post" action="/admin/veriler/yedek" class="data-now">${csrfField(csrf)}<button class="btn btn--primary btn--sm" type="submit">Şimdi yedek al</button></form>
      ${backups.length ? h`<ul class="data-list">${backups.map((b) => h`
        <li>
          <span class="data-list__main"><span class="data-list__title">${shortDate(b.date)}${b.manual ? ', elle alınan' : ''}</span><span class="data-list__meta">${mb(b.size)}</span></span>
          <a class="btn btn--text btn--sm" href="/admin/veriler/yedek/${b.name}" download>${icon('download')}İndir</a>
        </li>`)}</ul>` : h`<p class="sec-empty">${demoAdmin ? 'Demoda gece yedeği alınmaz; "Şimdi yedek al" ile deneyebilirsiniz.' : 'İlk gece yedeği sunucu açıldıktan kısa süre sonra alınır.'}</p>`}
    </section>
  </div>`;
  return panelLayout(c, { title: 'Veriler', csrf, nav: adminNav('data', csrf, demoAdmin), home: '/admin', tabs: adminTabs('data', demoAdmin), body });
}

// Site ayarları: sitede görünen her şey panelden
function sitePage(c, { accents, heroUrl, csrf, flash: f, demoAdmin }) {
  const b = c.brand || {}, ban = c.banner || {}, hero = c.hero || {}, intro = c.intro || {}, about = c.about || {}, k = c.contact || {};
  const svc = [...(c.services || [])];
  while (svc.length < 6) svc.push({ title: '', text: '' });
  const field = (id, label, value, opts = {}) => h`<div class="field"><label for="${id}">${label}</label>${opts.area
    ? h`<textarea id="${id}" name="${id}" rows="${opts.rows || 3}" maxlength="${opts.max || 600}" placeholder="${opts.ph || ''}">${value || ''}</textarea>`
    : h`<input id="${id}" name="${id}" type="${opts.type || 'text'}" maxlength="${opts.max || 120}" value="${value || ''}" placeholder="${opts.ph || ''}"${opts.type === 'tel' ? raw(' inputmode="tel"') : ''}>`}${opts.hint ? h`<p class="hint">${opts.hint}</p>` : ''}</div>`;
  const imageSlot = (slot, title, url, hint) => h`
    <div class="img-slot">
      <div class="img-slot__preview${slot === 'logo' ? ' is-logo' : ''}">${url ? h`<img src="${url}" alt="">` : h`<span>${slot === 'logo' ? 'Logo yok, marka adı yazıyla görünür' : 'Görsel yok'}</span>`}</div>
      <div class="img-slot__side">
        <p class="img-slot__title">${title}</p>
        <p class="hint">${hint}</p>
        <form class="uploader uploader--inline" data-uploader data-endpoint="/admin/site/gorsel">
          <input type="hidden" data-category value="${slot}">
          ${slot === 'logo' ? h`<input type="checkbox" data-keep-original checked hidden>` : ''}
          <label class="btn btn--outline btn--sm uploader__drop">${icon('upload')}${url ? 'Değiştir' : 'Yükle'}<input type="file" accept="image/jpeg,image/png,image/webp" data-files></label>
          <ul class="uploader__list" data-list aria-live="polite"></ul>
        </form>
        ${url ? h`<form method="post" action="/admin/site/gorsel-kaldir" data-confirm="Görsel kaldırılsın mı?">${csrfField(csrf)}<input type="hidden" name="slot" value="${slot}"><button class="btn btn--text btn--sm btn--danger-text" type="submit">Kaldır</button></form>` : ''}
      </div>
    </div>`;
  const body = h`
  <div class="container container--form">
    <a class="back-link" href="/admin/hesap">${icon('left')}Ayarlar</a>
    <div class="panel-title-row"><h1 class="page-title">Site</h1><a class="btn btn--outline btn--sm" href="/" target="_blank" rel="noopener">Siteyi aç</a></div>
    ${flashBlock(f)}

    <section class="appt-group site-group">
      <h2 class="site-group__title">Görseller</h2>
      ${imageSlot('logo', 'Logo', b.logo, 'Şeffaf zeminli PNG önerilir, en fazla 2 MB.')}
      ${imageSlot('about', 'Hakkımızda fotoğrafı', about.image, 'Dikey bir ekip veya çalışma fotoğrafı.')}
      <div class="img-slot">
        <div class="img-slot__preview">${heroUrl ? h`<img src="${heroUrl}" alt="">` : h`<span>Kapak yok</span>`}</div>
        <div class="img-slot__side">
          <p class="img-slot__title">Anasayfa kapağı</p>
          <p class="hint">Portfolyodaki bir fotoğrafta "Kapak yap"a dokunarak değiştirilir.</p>
          <a class="btn btn--outline btn--sm" href="/admin/portfolyo">Portfolyoya git</a>
        </div>
      </div>
    </section>

    <form class="form appt-form" method="post" action="/admin/site">
      ${csrfField(csrf)}
      <fieldset class="appt-group">
        <legend>Marka</legend>
        <div class="appt-row">${field('brandName', 'Marka adı', b.name, { max: 60 })}${field('tagline', 'Kısa tanım', b.tagline, { max: 80 })}</div>
        <div class="appt-row">
          <div class="field"><label for="logoPosition">Logo konumu</label><select id="logoPosition" name="logoPosition"><option value="left"${b.logoPosition !== 'center' ? raw(' selected') : ''}>Solda, menü sağda</option><option value="center"${b.logoPosition === 'center' ? raw(' selected') : ''}>Ortada, menü altında</option></select></div>
          <div class="field"><span class="ev-team__label">Vurgu rengi</span>
            <div class="swatches">${Object.entries(accents).map(([key, a]) => h`<label class="swatch" title="${a.label}"><input type="radio" name="accent" value="${key}"${(c.theme?.accent || 'kina') === key ? raw(' checked') : ''}><span class="swatch__dot" data-sw="${key}"></span><span class="sr-only">${a.label}</span></label>`)}</div>
          </div>
        </div>
      </fieldset>

      <fieldset class="appt-group">
        <legend>Duyuru bandı</legend>
        <p class="appt-help">Sitenin en üstünde ince bir şerit. Örneğin: "2027 sezonu için tarihler açıldı."</p>
        <label class="check"><input type="checkbox" name="bannerOn" value="1"${ban.on ? raw(' checked') : ''}><span>Bandı göster</span></label>
        ${field('bannerText', 'Metin', ban.text, { max: 160 })}
        <div class="appt-row">${field('bannerLinkText', 'Bağlantı yazısı', ban.linkText, { max: 30, ph: 'Uygunluk sor' })}${field('bannerLink', 'Bağlantı', ban.link, { max: 200, ph: '/talep' })}</div>
      </fieldset>

      <fieldset class="appt-group">
        <legend>Anasayfa</legend>
        ${field('heroTitle', 'Kapak başlığı', hero.title, { max: 90 })}
        ${field('heroText', 'Kapak metni', hero.text, { area: true, max: 300 })}
        <div class="appt-row">${field('introTitle', 'Giriş başlığı', intro.title, { max: 90 })}</div>
        ${field('introText', 'Giriş metni', intro.text, { area: true, rows: 4, max: 600 })}
      </fieldset>

      <fieldset class="appt-group">
        <legend>Hizmetler</legend>
        <p class="appt-help">En fazla 6 hizmet. Başlığı boş bırakılan satır sitede görünmez.</p>
        ${svc.slice(0, 6).map((x, i) => h`<div class="svc-row">${field(`svc${i}_title`, `${i + 1}. başlık`, x.title, { max: 60 })}${field(`svc${i}_text`, 'Açıklama', x.text, { max: 240 })}</div>`)}
      </fieldset>

      <fieldset class="appt-group">
        <legend>Hakkımızda</legend>
        ${field('aboutLead', 'Giriş cümlesi', about.lead, { max: 240 })}
        ${field('aboutText', 'Metin', (about.paragraphs || []).join('\n\n'), { area: true, rows: 8, max: 3000, hint: 'Paragrafları boş bir satırla ayırın.' })}
      </fieldset>

      <fieldset class="appt-group">
        <legend>İletişim</legend>
        ${field('contactText', 'İletişim sayfası metni', k.text, { area: true, max: 300 })}
        <div class="appt-row">${field('phone', 'Telefon', k.phoneDisplay && !/X/.test(k.phoneDisplay) ? k.phoneDisplay : '', { type: 'tel', max: 20, ph: '0532 123 45 67' })}${field('whatsapp', 'WhatsApp numarası', k.whatsapp && !/X/.test(k.whatsapp) ? displayPhone(k.whatsapp) : '', { type: 'tel', max: 20, ph: '0532 123 45 67' })}</div>
        ${field('whatsappMessage', 'WhatsApp hazır mesajı', k.whatsappMessage, { max: 200 })}
        <div class="appt-row">${field('email', 'E-posta', k.email, { max: 120, ph: 'iletisim@hm4studio.com' })}${field('instagram', 'Instagram kullanıcı adı', k.instagram, { max: 60, ph: 'hm4studio' })}</div>
        ${field('regions', 'Çalışma bölgeleri', (k.regions || []).join('\n'), { area: true, rows: 3, hint: 'Her satıra bir bölge.' })}
        ${field('hours', 'Çalışma saatleri', k.hours, { max: 120 })}
      </fieldset>

      <fieldset class="appt-group">
        <legend>Talep formu ve çift paneli</legend>
        <div class="appt-row">
          ${field('dailyCapacity', 'Günde en fazla kaç çekim alırsınız?', String(c.appointments?.dailyCapacity || 2), { max: 2, hint: 'Talep formunda tarih seçilince "boş / yer olabilir / dolu" bilgisi buna göre gösterilir. Çift isimleri gösterilmez.' })}
          ${field('deliveryDays', 'Varsayılan teslim süresi (gün)', String(c.appointments?.defaultDeliveryDays || 45), { max: 3 })}
        </div>
        <label class="check"><input type="checkbox" name="showPayments" value="1"${c.couplePanel?.showPayments ? raw(' checked') : ''}><span>Çift panelinde ödeme özetini göster (toplam, ödenen, kalan)</span></label>
      </fieldset>

      <fieldset class="appt-group">
        <legend>İş akışı</legend>
        <p class="appt-help">Her satıra bir tane. Aşamaları çiftler de panelinde görür; sırası işin sırasıdır. Aşama sayısını azaltırsanız sondaki aşamadaki çiftler yeni son aşamaya geçer.</p>
        <div class="appt-row">
          ${field('stages', 'İş aşamaları', c.stages.join('\n'), { area: true, rows: 7, max: 500 })}
          ${field('eventTypes', 'Etkinlik türleri', (c.appointments?.eventTypes || []).join('\n'), { area: true, rows: 7, max: 500 })}
        </div>
        <div class="appt-row">
          <p class="appt-help">Müşteri kaynakları: <a href="/admin/kaynaklar">Ayarlar › Müşteri kaynakları</a></p>
          ${field('teamRoles', 'Ekip görevleri', (c.appointments?.teamRoles || []).join('\n'), { area: true, rows: 6, max: 500 })}
        </div>
        <div class="appt-row">
          ${field('videoStages', 'Video aşamaları', (c.appointments?.videoStages || []).join('\n'), { area: true, rows: 5, max: 400 })}
          <div></div>
        </div>
      </fieldset>

      <div class="appt-actions"><button class="btn btn--primary" type="submit">Siteyi güncelle</button></div>
    </form>
  </div>`;
  return panelLayout(c, { title: 'Site', csrf, nav: adminNav('site', csrf, demoAdmin), home: '/admin', tabs: adminTabs('site', demoAdmin), body, scripts: ['/js/admin.js?v=7'] });
}

// Paketler: ad, fiyat, içerik; randevu formunda seçilince fiyat ve içerik dolar
function packagesPage(c, { packages, pkg, csrf, flash: f, demoAdmin }) {
  const types = c.appointments?.eventTypes || [];
  const form = (x, action, submit) => h`
    <form class="form" method="post" action="${action}">
      ${csrfField(csrf)}
      <div class="field"><label for="k-name">Paket adı</label><input id="k-name" name="name" type="text" required maxlength="80" value="${x.name || ''}" placeholder="Örn. Düğün · Fotoğraf + Video"></div>
      <div class="appt-row">
        <div class="field"><label for="k-price">Fiyat (₺)</label><input id="k-price" name="price" type="text" inputmode="numeric" value="${x.price ? x.price.toLocaleString('tr-TR') : ''}" data-money></div>
        <div class="field"><label for="k-type">Etkinlik türü</label><select id="k-type" name="eventType"><option value="">Hepsi</option>${types.map((t) => h`<option${t === x.event_type ? raw(' selected') : ''}>${t}</option>`)}</select></div>
      </div>
      <div class="field"><label for="k-detail">İçerik</label><textarea id="k-detail" name="detail" rows="5" maxlength="1500" placeholder="Fotoğraf sayısı, çekim süresi, klip, albüm ölçüsü…">${x.detail || ''}</textarea></div>
      <label class="check"><input type="checkbox" name="active" value="1"${x.active === 0 ? '' : raw(' checked')}><span>Randevu formunda göster</span></label>
      <div class="appt-actions"><button class="btn btn--primary" type="submit">${submit}</button>${pkg ? h`<a class="btn btn--text" href="/admin/paketler">Vazgeç</a>` : ''}</div>
    </form>`;
  const body = h`
  <div class="container">
    <a class="back-link" href="/admin/hesap">${icon('left')}Ayarlar</a>
    <h1 class="page-title">Paketler</h1>
    ${flashBlock(f)}
    <div class="team-grid">
      <section>
        <div class="panel-section__head"><h2 class="panel-section__title">Paket listesi <span class="sec-count">${packages.length}</span></h2></div>
        ${packages.length ? h`<ul class="pkg-list">${packages.map((x) => h`
          <li class="pkg${x.active ? '' : ' is-off'}${pkg && pkg.id === x.id ? ' is-current' : ''}">
            <div class="pkg__main">
              <span class="pkg__name">${x.name}</span>
              <span class="pkg__meta">${x.event_type || 'Tüm etkinlikler'}${x.used ? `, ${x.used} randevuda kullanıldı` : ''}${x.active ? '' : ', gizli'}</span>
              ${x.detail ? h`<p class="pkg__detail">${x.detail}</p>` : ''}
            </div>
            <span class="pkg__price">${x.price ? tl(x.price) : '—'}</span>
            <div class="team-row__actions">
              <a class="btn btn--text btn--sm" href="/admin/paketler?duzenle=${x.id}">Düzenle</a>
              <form method="post" action="/admin/paketler/${x.id}/sil" data-confirm="${x.name} silinsin mi? Bu paketle yapılmış randevular etkilenmez.">${csrfField(csrf)}<button class="btn btn--text btn--sm btn--danger-text" type="submit" aria-label="Sil">${icon('trash')}</button></form>
            </div>
          </li>`)}</ul>` : h`<p class="sec-empty">Henüz paket yok. Sağdaki formdan ilk paketinizi ekleyin.</p>`}
      </section>
      <section>
        <div class="panel-section__head"><h2 class="panel-section__title">${pkg ? 'Paketi düzenle' : 'Paket ekle'}</h2></div>
        ${pkg ? form(pkg, `/admin/paketler/${pkg.id}`, 'Kaydet') : form({}, '/admin/paketler', 'Paketi ekle')}
      </section>
    </div>
  </div>`;
  return panelLayout(c, { title: 'Paketler', csrf, nav: adminNav('packages', csrf, demoAdmin), home: '/admin', tabs: adminTabs('packages', demoAdmin), body, scripts: ['/js/dashboard.js?v=12', '/js/outbox.js?v=3'] });
}

module.exports = {
  portfolioTagsPage,
  prebookList, prebookForm,
  sourcesPage,
  seoTitlesPage,
  seoPages,
  reminderForm,
  deliverySettingsPage, giftCards, giftSettingsPage, citiesPage, messagesPage, MESSAGE_INFO, flashBlock, dataPage, sitePage, packagesPage, teamPage, appointmentPage, appointmentDoc, report, calendar, adminNav, adminTabs, dashboard, coupleDetail, portfolioAdmin, account };
