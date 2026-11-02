'use strict';
// Yönetici hesabı oluşturur veya şifresini sıfırlar.
// Kullanım:  npm run admin
// (Otomasyon için: ADMIN_USERNAME=... ADMIN_PASSWORD=... npm run admin)
const readline = require('node:readline');
const db = require('../src/db');
const { hashPassword } = require('../src/auth');

async function ask(rl, question, hidden = false) {
  if (!hidden) return new Promise((r) => rl.question(question, r));
  return new Promise((resolve) => {
    const out = rl.output;
    const write = out.write.bind(out);
    rl.output.write = (s) => { if (s.includes(question)) write(s); };
    rl.question(question, (answer) => { rl.output.write = write; write('\n'); resolve(answer); });
  });
}

(async () => {
  let username = process.env.ADMIN_USERNAME;
  let password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    username = (await ask(rl, 'Admin kullanıcı adı: ')).trim();
    password = await ask(rl, 'Şifre (en az 10 karakter): ', true);
    rl.close();
  }
  if (!/^[a-zA-Z0-9._-]{3,60}$/.test(username || '')) {
    console.error('Kullanıcı adı 3-60 karakter olmalı (harf, rakam, . _ -).');
    process.exit(1);
  }
  if (!password || password.length < 10) {
    console.error('Şifre en az 10 karakter olmalı.');
    process.exit(1);
  }
  const existed = Boolean(db.getAdminByUsername(username));
  db.upsertAdmin(username, hashPassword(password));
  console.log(existed ? `"${username}" kullanıcısının şifresi güncellendi.` : `"${username}" yönetici hesabı oluşturuldu.`);
  console.log('Giriş: /admin/giris');
})();
