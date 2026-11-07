#!/usr/bin/env bash
# Siteyi kendi alan adınıza taşır (ör. www.hm4studio.com). Önce alan adının DNS kayıtlarını bu sunucuya yönlendirin.
#   bash /opt/hm4studio/deploy/alan-adi-gecis.sh www.hm4studio.com
# Asıl adres www'li olur; hm4studio.com ve eski sslip adresi oraya kalıcı yönlendirilir (Google sıralaması korunur).
set -euo pipefail
DIR="/opt/hm4studio"; ENV_FILE="$DIR/.env"
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
setenv() { sed -i "/^$1=/d" "$ENV_FILE"; echo "$1=$2" >> "$ENV_FILE"; chmod 600 "$ENV_FILE"; }

WWW="${1:-}"; [ -z "$WWW" ] && read -r -p "Alan adı (ör. www.hm4studio.com): " WWW </dev/tty
WWW="$(printf '%s' "$WWW" | tr -d '[:space:]' | sed 's#^https\?://##; s#/.*##' | tr 'A-Z' 'a-z')"
case "$WWW" in www.*) ;; *) WWW="www.$WWW" ;; esac
APEX="${WWW#www.}"
IP="$(curl -s --max-time 10 https://api.ipify.org || hostname -I | awk '{print $1}')"
OLD="$(grep '^SITE_DOMAIN=' "$ENV_FILE" | cut -d= -f2-)"

say "1/3 · DNS kontrolü ($WWW ve $APEX → $IP)"
ok=1
for d in "$WWW" "$APEX"; do
  got="$(getent ahostsv4 "$d" | awk '{print $1}' | sort -u | tr '\n' ' ')"
  if printf '%s' "$got" | grep -qw "$IP"; then echo "  $d → $IP  ✓"; else echo "  $d → ${got:-kayıt yok}  ✗ (olması gereken: $IP)"; ok=0; fi
done
if [ "$ok" != 1 ]; then
  echo
  echo "DNS henüz bu sunucuyu göstermiyor. Wix › Alan Adları › DNS kayıtları:"
  echo "  A kaydı   @    → $IP"
  echo "  CNAME     www  → $APEX   (ya da A kaydı www → $IP)"
  echo "Kaydettikten sonra yayılması 10 dakika ile birkaç saat sürebilir; sonra bu betiği yeniden çalıştırın."
  exit 1
fi

say "2/3 · Ayarlar yazılıyor"
REDIRECTS="$APEX"
if [ -n "$OLD" ] && [ "$OLD" != "$WWW" ] && [ "$OLD" != "$APEX" ]; then REDIRECTS="$APEX, $OLD"; fi
setenv SITE_DOMAIN "$WWW"
setenv SITE_REDIRECTS "$REDIRECTS"
setenv SITE_URL "https://$WWW"
echo "  Asıl adres : https://$WWW"
echo "  Yönlenenler: $REDIRECTS"

say "3/3 · Site ve sertifika yenileniyor"
cd "$DIR/deploy"
docker compose --env-file "$ENV_FILE" up -d --force-recreate site caddy >/dev/null
for i in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$WWW/" || true)"
  [ "$code" = "200" ] && break; sleep 4
done
if [ "$code" = "200" ]; then
  echo "Tamam: https://$WWW yayında. Google Search Console'da site haritasını gönderin: https://$WWW/sitemap.xml"
else
  echo "Sertifika henüz alınamadı (kod $code). Birkaç dakika sonra https://$WWW adresini deneyin;"
  echo "olmazsa: cd $DIR/deploy && docker compose --env-file ../.env logs --tail 30 caddy"
fi
