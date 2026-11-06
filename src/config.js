'use strict';
// Ortam ayarlarını .env dosyasından okur. Gizli anahtarlar kodda değil, .env'de durur.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(path.join(ROOT, '.env'));

const env = process.env;
const isProd = env.NODE_ENV === 'production';

let sessionSecret = env.SESSION_SECRET || '';
if (sessionSecret.length < 32) {
  if (isProd) {
    console.error('HATA: .env içinde SESSION_SECRET en az 32 karakter olmalı. Ayrıntı: .env.example');
    process.exit(1);
  }
  // Geliştirme ortamında geçici anahtar — sunucu her açıldığında oturumlar sıfırlanır.
  sessionSecret = require('node:crypto').randomBytes(48).toString('hex');
  console.warn('Uyarı: SESSION_SECRET tanımlı değil; geçici anahtar kullanılıyor (yalnızca geliştirme için).');
}

const dataDir = path.resolve(ROOT, env.DATA_DIR || './data');

module.exports = {
  ROOT,
  isProd,
  port: Number(env.PORT) || 3000,
  siteUrl: (env.SITE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  sessionSecret,
  dataDir,
  dbFile: path.join(dataDir, 'hm4.db'),
  privateDir: path.join(dataDir, 'private'),   // çift fotoğrafları — asla doğrudan servis edilmez
  publicMediaDir: path.join(dataDir, 'public'), // portfolyo fotoğrafları — herkese açık
  maxUploadBytes: (env.DEMO_MODE === 'true' ? Math.min(Number(env.MAX_UPLOAD_MB) || 10, 10) : (Number(env.MAX_UPLOAD_MB) || 60)) * 1024 * 1024,
  // Demo modu: örnek verilerle açılır, ziyaretçiler tek tıkla çift veya stüdyo olarak girer,
  // veriler belirli aralıklarla sıfırlanır. Görüşler (geri bildirimler) sıfırlanmaz.
  demoMode: env.DEMO_MODE === 'true',
  demoResetHours: Number(env.DEMO_RESET_HOURS) || 6,
  demoMaxPhotos: 40,
  instagramToken: env.INSTAGRAM_ACCESS_TOKEN || '',
  // n8n + WhatsApp (boşsa bu özellikler kapalı kalır)
  n8nWebhookUrl: env.N8N_WEBHOOK_URL || '',
  n8nApiKey: env.N8N_API_KEY || '',
  waPhoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || '',
  waVerifyToken: env.WHATSAPP_VERIFY_TOKEN || '',
  waApiVersion: env.WHATSAPP_API_VERSION || 'v23.0',
  // Çift panelindeki yapay zekâ asistanı (anahtar yoksa asistan görünmez)
  openaiKey: env.OPENAI_API_KEY || '',
  openaiModel: env.OPENAI_MODEL || 'gpt-4.1-mini',
  openaiBase: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
  // Düğün.com taleplerini Gmail'den (Apps Script) göndermek için ayrı anahtar (deploy/dugun-gmail-kur.sh)
  leadApiKey: env.LEAD_API_KEY || '',
  // Stüdyo sahibinin Telegram asistanı (deploy/telegram-kur.sh kurar)
  telegramToken: env.TELEGRAM_BOT_TOKEN || '',
  telegramChatIds: String(env.TELEGRAM_CHAT_IDS || '').split(',').map((x) => x.trim()).filter(Boolean),
  sessionDays: 14,
};
