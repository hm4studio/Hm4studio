#!/usr/bin/env bash
# HM4 Studio — Hostinger VPS tek komutla kurulum (Ubuntu 22.04 / 24.04)
# Kullanım (hPanel › VPS › Tarayıcı terminali, root olarak):
#   curl -fsSL https://raw.githubusercontent.com/hm4studio/Hm4studio/main/deploy/kur.sh | bash
# Yeniden çalıştırmak güvenlidir: mevcut ayarları ve verileri korur.
set -euo pipefail

REPO="https://github.com/hm4studio/Hm4studio.git"
DIR="/opt/hm4studio"
ENV_FILE="$DIR/.env"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ask() { local q="$1" def="${2:-}" a; read -r -p "$q${def:+ [$def]}: " a </dev/tty || true; echo "${a:-$def}"; }

[ "$(id -u)" = "0" ] || { echo "Bu betik root olarak çalıştırılmalı."; exit 1; }

say "1/6 · Sistem güncelleniyor ve gerekli araçlar kuruluyor"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y >/dev/null
apt-get install -y ca-certificates curl git openssl ufw >/dev/null
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
systemctl enable --now docker >/dev/null

say "2/6 · Kod GitHub'dan indiriliyor"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only -q; else git clone -q "$REPO" "$DIR"; fi

say "3/6 · Ayarlar"
IP="$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')"
if [ -f "$ENV_FILE" ]; then
  echo "Mevcut ayarlar korunuyor ($ENV_FILE)."
else
  echo "Alan adınız varsa yazın (örn. hm4studio.com). Yoksa boş bırakın; geçici olarak"
  echo "ücretsiz ve HTTPS'li bir adres kullanılır: ${IP//./-}.sslip.io"
  DOMAIN="$(ask 'Alan adı')"
  if [ -z "$DOMAIN" ]; then DOMAIN="${IP//./-}.sslip.io"; N8N="n8n.${IP//./-}.sslip.io"; else DOMAIN="${DOMAIN#www.}"; N8N="n8n.$DOMAIN"; fi
  EMAIL="$(ask 'E-posta (SSL sertifikası bildirimleri için)' 'hm4studio@gmail.com')"
  echo "Yönetici şifresi en az 10 karakter olmalı. Kullanıcı adı: hm4studio"
  while :; do
    read -r -s -p "Yönetici şifresi: " PASS </dev/tty; echo
    [ "${#PASS}" -ge 10 ] && break
    echo "En az 10 karakter olmalı, tekrar deneyin."
  done
  umask 077
  cat > "$ENV_FILE" <<EOF
# HM4 Studio sunucu ayarları — GİZLİ, paylaşmayın
SITE_DOMAIN=$DOMAIN
N8N_DOMAIN=$N8N
ACME_EMAIL=$EMAIL
SITE_URL=https://$DOMAIN
SESSION_SECRET=$(openssl rand -hex 48)
TRUST_PROXY=1
DEMO_MODE=false
MAX_UPLOAD_MB=60
ADMIN_USERNAME=hm4studio
ADMIN_PASSWORD=$PASS
N8N_API_KEY=$(openssl rand -hex 24)
N8N_WEBHOOK_URL=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=hm4-$(openssl rand -hex 6)
EOF
  chmod 600 "$ENV_FILE"
fi
set -a; . "$ENV_FILE"; set +a

say "4/6 · Güvenlik duvarı (22, 80, 443)"
ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
yes | ufw enable >/dev/null || true

say "5/6 · Site, n8n ve HTTPS başlatılıyor (ilk seferde birkaç dakika sürer)"
cd "$DIR/deploy"
docker compose --env-file "$ENV_FILE" up -d --build

say "6/6 · Otomatik güncelleme (GitHub'daki her yeni sürüm 5 dakika içinde siteye gelir)"
chmod +x "$DIR/deploy/guncelle.sh"
cat > /etc/cron.d/hm4studio <<EOF
*/5 * * * * root $DIR/deploy/guncelle.sh >> /var/log/hm4-guncelle.log 2>&1
EOF

cat <<EOF

────────────────────────────────────────────────────────
 Kurulum tamam.

 Site     : https://$SITE_DOMAIN
 Panel    : https://$SITE_DOMAIN/uygulama  (kullanıcı adı: hm4studio)
 n8n      : https://$N8N_DOMAIN  (ilk açılışta n8n hesabınızı oluşturun)
 Sunucu IP: $IP

 Alan adı kullandıysanız DNS'te şu iki kaydın bu IP'ye yönlendiğinden emin olun:
   A  @    $IP
   A  n8n  $IP
 SSL sertifikası DNS doğru olduğunda birkaç dakika içinde kendiliğinden alınır.

 Ayarlar dosyası: $ENV_FILE
────────────────────────────────────────────────────────
EOF
