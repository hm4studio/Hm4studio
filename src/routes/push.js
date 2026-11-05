'use strict';
// Telefon bildirimi aboneliği: çift ve yönetici panellerinden açılıp kapatılır.
const push = require('../push');
const db = require('../db');
const { json, readJson, HttpError } = require('../http');
const { checkCsrf } = require('./guards');

function who(req) {
  const k = req.session?.kind;
  if (k !== 'couple' && k !== 'admin') throw new HttpError(401, 'Oturum gerekli');
  checkCsrf(req);
  return { kind: k, userId: req.session.userId };
}

const validEndpoint = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && u.length < 1000; } catch { return false; } };

function register(router) {
  router.get('/push/anahtar', (req, res) => json(res, { key: push.publicKey() }));

  router.post('/push/abone', async (req, res) => {
    const { kind, userId } = who(req);
    const body = await readJson(req);
    const s = body.subscription || {};
    const k = s.keys || {};
    if (!validEndpoint(s.endpoint) || !/^[A-Za-z0-9_-]{80,100}$/.test(k.p256dh || '') || !/^[A-Za-z0-9_-]{16,30}$/.test(k.auth || '')) throw new HttpError(400, 'Geçersiz abonelik');
    db.addPushSub({ endpoint: s.endpoint, kind, userId, p256dh: k.p256dh, auth: k.auth, device: String(req.headers['user-agent'] || '').slice(0, 200) });
    if (body.test) await push.notify(kind, userId, { title: 'Bildirimler açık', body: kind === 'admin' ? 'Yeni talep ve onaylar artık telefonunuza gelecek.' : 'İşinizdeki gelişmeleri artık buradan haber vereceğiz.', tag: 'hos-geldin' });
    json(res, { ok: true });
  });

  router.post('/push/iptal', async (req, res) => {
    const { kind, userId } = who(req);
    const body = await readJson(req);
    if (body.endpoint) db.deleteOwnPushSub(String(body.endpoint), kind, userId);
    json(res, { ok: true });
  });
}

module.exports = { register };
