#!/usr/bin/env bash
# WhatsApp Business (Meta) bağlantısı: kalıcı erişim anahtarı ve telefon numarası kimliğini kaydeder,
# n8n akışlarını açar ve Meta'ya girilecek webhook bilgilerini gösterir.
# Önce: deploy/n8n-kur.sh
#   bash /opt/hm4studio/deploy/whatsapp-kur.sh
set -euo pipefail
DIR="/opt/hm4studio"; ENV_FILE="$DIR/.env"
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
setenv() { sed -i "/^$1=/d" "$ENV_FILE"; echo "$1=$2" >> "$ENV_FILE"; }
set -a; . "$ENV_FILE"; set +a
cd "$DIR/deploy"
DC=(docker compose --env-file "$ENV_FILE")

say "1/4 · Meta bilgileri"
read -r -p "Telefon numarası kimliği (Phone number ID, yalnızca rakam): " PNID </dev/tty
PNID="$(printf '%s' "$PNID" | tr -dc '0-9')"
[ -n "$PNID" ] || { echo "Telefon numarası kimliği boş olamaz."; exit 1; }
echo "Kalıcı erişim anahtarını yapıştırın (EAA ile başlar; ekranda görünmez):"
read -r -s -p "Anahtar: " TOKEN </dev/tty; echo
TOKEN="$(printf '%s' "$TOKEN" | tr -d '[:space:]')"
[ -n "$TOKEN" ] || { echo "Anahtar boş olamaz."; exit 1; }
code="$(curl -s -o /dev/null -w '%{http_code}' "https://graph.facebook.com/${WHATSAPP_API_VERSION:-v23.0}/$PNID?fields=display_phone_number" -H "Authorization: Bearer $TOKEN" || true)"
if [ "$code" = "200" ]; then echo "Meta bağlantısı doğrulandı."; else echo "Uyarı: Meta anahtarı/numarayı doğrulamadı (HTTP $code). Yine de kaydediliyor; bilgileri kontrol edin."; fi

say "2/4 · Kaydediliyor"
setenv WHATSAPP_PHONE_NUMBER_ID "$PNID"
[ -n "${WHATSAPP_VERIFY_TOKEN:-}" ] || { WHATSAPP_VERIFY_TOKEN="hm4-$(openssl rand -hex 6)"; setenv WHATSAPP_VERIFY_TOKEN "$WHATSAPP_VERIFY_TOKEN"; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
umask 077
printf '[{"id":"hm4WhatsApp00001","name":"WhatsApp Cloud API","type":"httpHeaderAuth","data":{"name":"Authorization","value":"Bearer %s"}}]' "$TOKEN" > "$TMP/c.json"
"${DC[@]}" exec -T -u root n8n rm -f /tmp/hm4-wa.json || true
"${DC[@]}" exec -T n8n sh -c "umask 077; cat > /tmp/hm4-wa.json" < "$TMP/c.json"
"${DC[@]}" exec -T n8n n8n import:credentials --input=/tmp/hm4-wa.json
"${DC[@]}" exec -T n8n rm -f /tmp/hm4-wa.json

say "3/4 · Akışlar açılıyor"
for id in hm4Flow1Gelen001 hm4Flow2Olay0001 hm4Flow3Hatir001; do
  "${DC[@]}" exec -T n8n n8n publish:workflow --id="$id" >/dev/null 2>&1 \
    || "${DC[@]}" exec -T n8n n8n update:workflow --id="$id" --active=true >/dev/null 2>&1 \
    || echo "  $id otomatik açılamadı; n8n'de akışı açıp sağ üstten Active/Publish yapın."
done
"${DC[@]}" up -d --force-recreate site >/dev/null
"${DC[@]}" restart n8n >/dev/null

say "4/4 · Meta'ya girilecek bilgiler"
cat <<TXT
developers.facebook.com › uygulamanız › WhatsApp › Yapılandırma › Webhook:

  Callback URL : https://${N8N_DOMAIN}/webhook/hm4-whatsapp-ee952bb9
  Verify token : ${WHATSAPP_VERIFY_TOKEN}

"Doğrula ve kaydet"e basın, sonra Webhook alanlarında "messages" için Abone ol'u seçin.
TXT
