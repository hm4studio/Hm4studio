#!/usr/bin/env bash
# Düğün.com taleplerini Gmail Apps Script ile siteye göndermek için anahtar oluşturur (bir kez).
#   bash /opt/hm4studio/deploy/dugun-gmail-kur.sh
set -euo pipefail
DIR="/opt/hm4studio"; ENV_FILE="$DIR/.env"
KEY="$(grep '^LEAD_API_KEY=' "$ENV_FILE" | cut -d= -f2- || true)"
if [ -z "$KEY" ]; then
  KEY="$(openssl rand -hex 24)"
  echo "LEAD_API_KEY=$KEY" >> "$ENV_FILE"; chmod 600 "$ENV_FILE"
  cd "$DIR/deploy" && docker compose --env-file "$ENV_FILE" up -d --force-recreate site >/dev/null
fi
echo
echo "Apps Script kodundaki ANAHTAR satırına bunu yapıştırın:"
echo
echo "    $KEY"
echo
