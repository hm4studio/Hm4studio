#!/usr/bin/env bash
# Çift panelindeki asistan için OpenAI anahtarını sunucuya ekler (ekranda görünmez, kaynak koda yazılmaz).
#   bash /opt/hm4studio/deploy/asistan-kur.sh
set -euo pipefail
DIR="/opt/hm4studio"; ENV_FILE="$DIR/.env"
echo "OpenAI anahtarınızı yapıştırın (sk- ile başlar; yazarken ekranda görünmez). Asistanı kapatmak için boş bırakın."
read -r -s -p "Anahtar: " KEY </dev/tty; echo
KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"
if [ -n "$KEY" ] && [[ "$KEY" != sk-* ]]; then echo "Bu bir OpenAI anahtarı gibi görünmüyor (sk- ile başlamalı)."; exit 1; fi
sed -i '/^OPENAI_API_KEY=/d' "$ENV_FILE"
echo "OPENAI_API_KEY=$KEY" >> "$ENV_FILE"
chmod 600 "$ENV_FILE"
if [ -n "$KEY" ]; then
  code="$(curl -s -o /dev/null -w '%{http_code}' https://api.openai.com/v1/models -H "Authorization: Bearer $KEY" || true)"
  [ "$code" = "200" ] && echo "Anahtar çalışıyor." || echo "Uyarı: OpenAI anahtarı doğrulayamadı (HTTP $code). Anahtarı ve hesabınızdaki krediyi kontrol edin."
fi
cd "$DIR/deploy" && docker compose --env-file "$ENV_FILE" up -d --force-recreate site >/dev/null
echo "Tamam. ${KEY:+Asistan çift panelinde sağ altta görünür.}${KEY:-Asistan kapatıldı.}"
