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
echo "@BotFather'ın verdiği anahtarı yapıştırın (123456789:AAH... biçiminde) ve Enter'a basın."
echo "(Tarayıcı terminalinde yapıştırmak için sağ tık › Yapıştır ya da Ctrl+Shift+V kullanın.)"
read -r -p "Anahtar: " TOKEN </dev/tty
TOKEN="$(printf '%s' "$TOKEN" | tr -d '[:space:]' | sed 's/^bot//')"
clear 2>/dev/null || true
if ! printf '%s' "$TOKEN" | grep -Eq '^[0-9]{6,}:[A-Za-z0-9_-]{30,}$'; then
  echo "Bu bir bot anahtarına benzemiyor (${#TOKEN} karakter geldi; '${TOKEN:0:4}…' ile başlıyor)."
  echo "Doğru biçim: rakamlar, iki nokta, ardından ~35 harf/rakam. Örn. 123456789:AAH4x…"
  echo "BotFather'daki anahtarın tamamını kopyalayıp betiği yeniden çalıştırın."; exit 1
fi
ME="$(curl -s --max-time 15 "https://api.telegram.org/bot$TOKEN/getMe" || true)"
if ! printf '%s' "$ME" | grep -q '"ok":true'; then
  if [ -z "$ME" ]; then echo "Sunucu Telegram'a ulaşamadı (internet/engel). Birkaç dakika sonra yeniden deneyin.";
  else echo "Telegram anahtarı kabul etmedi: $(printf '%s' "$ME" | sed -n 's/.*"description":"\([^"]*\)".*/\1/p')"; echo "BotFather'da /mybots › botunuz › API Token ile anahtarı yeniden kopyalayın."; fi
  exit 1
fi
BOT="$(printf '%s' "$ME" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p')"
echo "Bot bulundu: @$BOT"

say "2/3 · Sizin Telegram hesabınız"
# Site çalışırken bot mesajlarını o okur; eşleştirme bitene kadar siteyi eski ayarla bırakmak için anahtarı sonra yazıyoruz
cd "$DIR/deploy"
docker compose --env-file "$ENV_FILE" stop site >/dev/null 2>&1 || true
curl -s "https://api.telegram.org/bot$TOKEN/deleteWebhook" >/dev/null
echo "Telegram'da botunuzu açın:  https://t.me/$BOT"
echo "ve  /start  yazın (son 15 dakikada yazdıysanız tekrar yazmanıza gerek yok). 3 dakika bekliyorum…"
NOW="$(date +%s)"; CHAT=""
for i in $(seq 1 36); do
  R="$(curl -s --max-time 10 "https://api.telegram.org/bot$TOKEN/getUpdates?timeout=4" || true)"
  # Son 15 dakikadaki en yeni özel mesajın sohbet numarası
  CHAT="$(printf '%s' "$R" | python3 -c '
import json,sys,time
try: d=json.load(sys.stdin)
except Exception: sys.exit()
ids=[u["message"]["chat"]["id"] for u in d.get("result",[]) if "message" in u and u["message"]["chat"].get("type")=="private" and u["message"].get("date",0)>time.time()-900]
print(ids[-1] if ids else "")' 2>/dev/null || true)"
  [ -n "$CHAT" ] && break
  printf '.'
done
echo
if [ -z "$CHAT" ]; then
  echo "Bottan mesaj göremedim."
  echo "Telegram'da @userinfobot'a herhangi bir şey yazarsanız size 'Id' numaranızı söyler."
  read -r -p "O numarayı buraya yazın (boş bırakırsanız çıkılır): " CHAT </dev/tty
  CHAT="$(printf '%s' "$CHAT" | tr -dc '0-9-')"
  if [ -z "$CHAT" ]; then docker compose --env-file "$ENV_FILE" start site >/dev/null; echo "İptal edildi."; exit 1; fi
fi
# Okunan mesajları temizle (site eski /start'a cevap vermesin)
LAST="$(printf '%s' "${R:-}" | grep -o '"update_id":[0-9]*' | tail -1 | cut -d: -f2 || true)"
[ -n "$LAST" ] && curl -s "https://api.telegram.org/bot$TOKEN/getUpdates?offset=$((LAST + 1))" >/dev/null
echo "Hesabınız eşleşti (sohbet no: $CHAT)."

say "3/3 · Kaydediliyor ve site yeniden başlatılıyor"
setenv TELEGRAM_BOT_TOKEN "$TOKEN"
setenv TELEGRAM_CHAT_IDS "$CHAT"
docker compose --env-file "$ENV_FILE" up -d --force-recreate site >/dev/null
curl -s -X POST "https://api.telegram.org/bot$TOKEN/sendMessage" -d chat_id="$CHAT" \
  --data-urlencode text="Bağlandım. Örneğin şunu sorabilirsin: En yakın çekimim ne zaman?" >/dev/null
echo "Tamam. Telegram'da @$BOT ile konuşabilirsiniz. Bot yalnızca sizin hesabınıza cevap verir."
