# HM4 Studio · Hostinger VPS kurulumu

Tek sunucuda: **site + paneller**, **n8n** (WhatsApp otomasyonları) ve **HTTPS** (Caddy, ücretsiz SSL).

## Kurulum
1. hPanel › VPS › **İşletim sistemi**: **Ubuntu 24.04** (düz, şablonsuz) seçin. Bu işlem VPS'i sıfırlar.
2. hPanel › VPS › **Tarayıcı terminali**'ni açın ve şunu yapıştırın:
   ```
   curl -fsSL https://raw.githubusercontent.com/hm4studio/Hm4studio/main/deploy/kur.sh | bash
   ```
3. Sorulanları yanıtlayın: alan adı (yoksa boş bırakın, geçici `IP.sslip.io` adresi kullanılır),
   e-posta, yönetici şifresi (en az 10 karakter).
4. Alan adı kullandıysanız DNS'te iki A kaydı: `@` ve `n8n` → sunucunun IP'si.

## Sonrası
- **Güncellemeler:** GitHub'a gelen her sürüm 5 dakika içinde kendiliğinden yayına alınır (`/etc/cron.d/hm4studio`).
  Veriler etkilenmez. Günlük: `/var/log/hm4-guncelle.log`.
- **Veriler:** Docker birimi `hm4-data` (veritabanı, fotoğraflar, gece yedekleri). Panelden: Ayarlar › Veriler.
- **Ayarlar:** `/opt/hm4studio/.env` (gizli). Değiştirdikten sonra:
  `cd /opt/hm4studio/deploy && docker compose --env-file ../.env up -d`
- **Alan adını sonradan bağlamak:** `.env` içinde `SITE_DOMAIN`, `N8N_DOMAIN` ve `SITE_URL`'yi değiştirip yukarıdaki komutu çalıştırın.
- **n8n ile site arasında:** Sitenin `N8N_WEBHOOK_URL` değeri `http://n8n:5678/webhook/hm4-olay` olabilir;
  n8n akışlarındaki `siteUrl` için `http://site:3000` kullanılabilir (aynı sunucu içi, hızlı ve güvenli).
