#!/usr/bin/env bash
# Düğün.com teklif taleplerini e-postadan okuyup sitedeki Talepler'e ekleyen n8n akışını kurar.
#   bash /opt/hm4studio/deploy/dugun-kur.sh
# Önce n8n-kur.sh çalıştırılmış olmalı. Gmail için "uygulama şifresi" gerekir (normal şifre çalışmaz).
set -euo pipefail
DIR="/opt/hm4studio"; ENV_FILE="$DIR/.env"
DC=(docker compose --env-file "$ENV_FILE" -f "$DIR/deploy/docker-compose.yml")
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
grep -q '^N8N_API_KEY=.\+' "$ENV_FILE" || { echo "Önce n8n'i kurun: bash $DIR/deploy/n8n-kur.sh"; exit 1; }

say "1/3 · Düğün.com bildirimlerinin geldiği e-posta hesabı"
read -r -p "E-posta adresi: " MAIL </dev/tty
MAIL="$(printf '%s' "$MAIL" | tr -d '[:space:]')"
case "${MAIL##*@}" in
  gmail.com|googlemail.com) HOST=imap.gmail.com ;;
  yandex.com|yandex.com.tr|yandex.ru) HOST=imap.yandex.com ;;
  outlook.com|hotmail.com|live.com|msn.com) HOST=outlook.office365.com ;;
  icloud.com|me.com) HOST=imap.mail.me.com ;;
  *) read -r -p "IMAP sunucusu (e-posta sağlayıcınızın ayarlarında yazar, ör. mail.alanadiniz.com): " HOST </dev/tty ;;
esac
echo "Sunucu: $HOST"
[ "$HOST" = imap.gmail.com ] && echo "Gmail: myaccount.google.com/apppasswords adresinden oluşturduğunuz 16 harfli uygulama şifresini girin."
read -r -p "Şifre (uygulama şifresi): " PASS </dev/tty
PASS="$(printf '%s' "$PASS" | tr -d '[:space:]')"
clear 2>/dev/null || true

say "2/3 · Bağlantı deneniyor"
if ! curl -s --max-time 20 --url "imaps://$HOST:993/INBOX" --user "$MAIL:$PASS" -X 'EXAMINE INBOX' >/dev/null; then
  echo "E-posta kutusuna bağlanılamadı. Adres, sunucu ve uygulama şifresini kontrol edip yeniden deneyin."
  [ "$HOST" = imap.gmail.com ] && echo "Gmail'de iki adımlı doğrulama açık olmalı ve normal şifre değil uygulama şifresi kullanılmalı."
  exit 1
fi
echo "Bağlantı tamam."

say "3/3 · n8n'e yükleniyor"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
umask 077
MAIL="$MAIL" PASS="$PASS" HOST="$HOST" python3 -c '
import json,os
print(json.dumps([{"id":"hm4ImapMail00001","name":"HM4 E-posta","type":"imap","data":{"user":os.environ["MAIL"],"password":os.environ["PASS"],"host":os.environ["HOST"],"port":993,"secure":True,"allowUnauthorizedCerts":False}}]))' > "$TMP/imap.json"
put() { "${DC[@]}" exec -T n8n sh -c "umask 077; cat > '$2'" < "$1"; }
"${DC[@]}" exec -T -u root n8n rm -f /tmp/hm4-imap.json /tmp/hm4-akis.json || true
put "$TMP/imap.json" /tmp/hm4-imap.json
"${DC[@]}" exec -T n8n n8n import:credentials --input=/tmp/hm4-imap.json
"${DC[@]}" exec -T n8n rm -f /tmp/hm4-imap.json
put "$DIR/n8n/4-dugun-com.json" /tmp/hm4-akis.json
"${DC[@]}" exec -T n8n n8n import:workflow --input=/tmp/hm4-akis.json
"${DC[@]}" exec -T n8n rm -f /tmp/hm4-akis.json
"${DC[@]}" exec -T n8n n8n publish:workflow --id=hm4Flow4Dugun001 >/dev/null 2>&1 \
  || "${DC[@]}" exec -T n8n n8n update:workflow --id=hm4Flow4Dugun001 --active=true >/dev/null 2>&1 || true
"${DC[@]}" restart n8n >/dev/null
echo "Tamam. Düğün.com'dan gelen yeni teklif talepleri birkaç saniye içinde Panel › Talepler'e düşer."
echo "E-postalar okunmamış olarak kalır; bir talep iki kez eklenmez."
