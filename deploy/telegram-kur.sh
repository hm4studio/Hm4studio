#!/usr/bin/env bash
# Stüdyo sahibinin Telegram asistanını kurar (bir kez; yeniden çalıştırmak güvenlidir).
#   bash /opt/hm4studio/deploy/telegram-kur.sh
# Önce Telegram'da @BotFather'a /newbot yazıp bir bot oluşturun ve verdiği anahtarı (token) hazır tutun.
set -euo pipefail
DIR="/opt/hm4studio"; ENV_FILE="$DIR/.env"
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
setenv() { sed -i "/^$1=/d" "$ENV_FILE"; echo "$1=$2" >> "$ENV_FILE"; chmod 600 "$ENV_FILE"; }

if ! grep -q '^OPENAI_API_KEY=sk-' "$ENV_FILE"; then
  echo "Önce OpenAI anahtarını kurun: bash $DIR/deploy/asistan-kur.sh"; exit 1
fi

say "1/3 · Bot anahtarı"
echo "@BotFather'ın verdiği anahtarı yapıştırın (123456:ABC... biçiminde; ekranda görünmez)."
read -r -s -p "Anahtar: " TOKEN </dev/tty; echo
TOKEN="$(printf '%s' "$TOKEN" | tr -d '[:space:]')"
ME="$(curl -s "https://api.telegram.org/bot$TOKEN/getMe" || true)"
if ! printf '%s' "$ME" | grep -q '"ok":true'; then echo "Anahtar çalışmadı. Kontrol edip yeniden deneyin."; exit 1; fi
BOT="$(printf '%s' "$ME" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p')"
echo "Bot bulundu: @$BOT"

say "2/3 · Sizin Telegram hesabınız"
# Site çalışırken bot mesajlarını o okur; eşleştirme bitene kadar siteyi eski ayarla bırakmak için anahtarı sonra yazıyoruz
cd "$DIR/deploy"
docker compose --env-file "$ENV_FILE" stop site >/dev/null 2>&1 || true
curl -s "https://api.telegram.org/bot$TOKEN/deleteWebhook" >/dev/null
OFFSET="$(curl -s "https://api.telegram.org/bot$TOKEN/getUpdates" | grep -o '"update_id":[0-9]*' | tail -1 | cut -d: -f2 || true)"
OFFSET=$(( ${OFFSET:-0} + 1 ))
echo "Telegram'da @$BOT botunu açın ve  /start  yazın (2 dakika bekliyorum)…"
CHAT=""
for i in $(seq 1 24); do
  R="$(curl -s "https://api.telegram.org/bot$TOKEN/getUpdates?offset=$OFFSET&timeout=5" || true)"
  CHAT="$(printf '%s' "$R" | grep -o '"chat":{"id":-\?[0-9]*' | head -1 | grep -o -- '-\?[0-9]*$' || true)"
  [ -n "$CHAT" ] && break
done
if [ -z "$CHAT" ]; then
  docker compose --env-file "$ENV_FILE" start site >/dev/null
  echo "Mesaj gelmedi. Betiği yeniden çalıştırıp botunuza /start yazın."; exit 1
fi
NEXT="$(printf '%s' "$R" | grep -o '"update_id":[0-9]*' | tail -1 | cut -d: -f2)"
curl -s "https://api.telegram.org/bot$TOKEN/getUpdates?offset=$((NEXT + 1))" >/dev/null
echo "Hesabınız eşleşti (sohbet no: $CHAT)."

say "3/3 · Kaydediliyor ve site yeniden başlatılıyor"
setenv TELEGRAM_BOT_TOKEN "$TOKEN"
setenv TELEGRAM_CHAT_IDS "$CHAT"
docker compose --env-file "$ENV_FILE" up -d --force-recreate site >/dev/null
curl -s -X POST "https://api.telegram.org/bot$TOKEN/sendMessage" -d chat_id="$CHAT" \
  --data-urlencode text="Bağlandım. Örneğin şunu sorabilirsin: En yakın çekimim ne zaman?" >/dev/null
echo "Tamam. Telegram'da @$BOT ile konuşabilirsiniz. Bot yalnızca sizin hesabınıza cevap verir."
