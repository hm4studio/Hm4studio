// HM4 Studio · Düğün.com talepleri → site (Gmail Apps Script)
// script.google.com › Yeni proje › bu kodu yapıştırın › üstteki iki satırı doldurun › "kur" fonksiyonunu bir kez çalıştırın.
// 5 dakikada bir Düğün.com e-postalarına bakar, yenilerini sitenizdeki Talepler'e ekler. E-postalara dokunmaz.
const SITE = 'https://187-124-28-222.sslip.io';
const ANAHTAR = 'BURAYA-SUNUCUDAKI-ANAHTARI-YAPISTIRIN';

function dugunTalepleri() {
  const gonderilen = PropertiesService.getScriptProperties();
  const konular = GmailApp.search('(from:dugun OR "dugun.com" OR "düğün.com") newer_than:14d', 0, 100);
  for (const konu of konular) {
    for (const m of konu.getMessages()) {
      const id = m.getId();
      if (gonderilen.getProperty(id)) continue;
      const cevap = UrlFetchApp.fetch(SITE + '/api/dis-talep', {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + ANAHTAR },
        payload: JSON.stringify({ messageId: id, from: m.getFrom(), subject: m.getSubject(), text: m.getPlainBody() }),
        muteHttpExceptions: true,
      });
      console.log(m.getSubject() + ' → ' + cevap.getResponseCode() + ' ' + cevap.getContentText().slice(0, 160));
      if (cevap.getResponseCode() === 200) gonderilen.setProperty(id, '1');
    }
  }
}

// Son 14 günün Düğün.com e-postalarını yeniden gönderir (sitede olanlar ikinci kez eklenmez).
function tekrarDene() {
  PropertiesService.getScriptProperties().getKeys().filter((k) => !/^[A-Z]/.test(k)).forEach((k) => PropertiesService.getScriptProperties().deleteProperty(k));
  dugunTalepleri();
}

// Bir kez çalıştırın: 5 dakikalık zamanlayıcıyı kurar ve hemen bir kontrol yapar.
function kur() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dugunTalepleri').timeBased().everyMinutes(5).create();
  dugunTalepleri();
}
