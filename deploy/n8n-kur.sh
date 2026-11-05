#!/usr/bin/env bash
# n8n otomasyonlarını kurar: site bağlantısı, 3 akış (gelen mesajlar, site olayları, günlük hatırlatmalar).
# WhatsApp (Meta) bağlantısı ayrıca: deploy/whatsapp-kur.sh
# Yeniden çalıştırmak güvenlidir (akışlar güncellenir, kopya oluşmaz).
#   bash /opt/hm4studio/deploy/n8n-kur.sh
set -euo pipefail
DIR="/opt/hm4studio"; ENV_FILE="$DIR/.env"
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
setenv() { sed -i "/^$1=/d" "$ENV_FILE"; echo "$1=$2" >> "$ENV_FILE"; }
set -a; . "$ENV_FILE"; set +a
cd "$DIR/deploy"
DC=(docker compose --env-file "$ENV_FILE")

say "1/4 · Site ↔ n8n bağlantı anahtarı"
if [ -z "${N8N_API_KEY:-}" ]; then N8N_API_KEY="$(openssl rand -hex 24)"; setenv N8N_API_KEY "$N8N_API_KEY"; fi
setenv N8N_WEBHOOK_URL "http://n8n:5678/webhook/hm4-olay"
echo "Tamam."

say "2/4 · n8n çalışıyor mu"
"${DC[@]}" up -d n8n >/dev/null
for i in $(seq 1 30); do "${DC[@]}" exec -T n8n n8n --version >/dev/null 2>&1 && break; sleep 2; done
echo "n8n sürümü: $("${DC[@]}" exec -T n8n n8n --version 2>/dev/null | tail -1)"

say "3/4 · Kimlik bilgisi ve akışlar içe aktarılıyor"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
umask 077
printf '[{"id":"hm4SiteKey000001","name":"HM4 Site","type":"httpHeaderAuth","data":{"name":"Authorization","value":"Bearer %s"}}]' "$N8N_API_KEY" > "$TMP/creds.json"
# Dosyalar n8n'in içine kendi kullanıcısıyla (node) yazılır; "docker cp" root sahipli kopyalar ve n8n okuyamaz
put() { "${DC[@]}" exec -T n8n sh -c "umask 077; cat > '$2'" < "$1"; }
"${DC[@]}" exec -T -u root n8n sh -c 'rm -f /tmp/hm4-*.json /tmp/1-*.json /tmp/2-*.json /tmp/3-*.json' || true
put "$TMP/creds.json" /tmp/hm4-creds.json
"${DC[@]}" exec -T n8n n8n import:credentials --input=/tmp/hm4-creds.json
"${DC[@]}" exec -T n8n rm -f /tmp/hm4-creds.json
for f in "$DIR"/n8n/*.json; do
  put "$f" /tmp/hm4-akis.json
  "${DC[@]}" exec -T n8n n8n import:workflow --input=/tmp/hm4-akis.json
  "${DC[@]}" exec -T n8n rm -f /tmp/hm4-akis.json
done

say "4/4 · Site ve n8n yeniden başlatılıyor"
"${DC[@]}" up -d --force-recreate site >/dev/null
"${DC[@]}" restart n8n >/dev/null
sleep 5
code="$("${DC[@]}" exec -T site node -e "fetch('http://n8n:5678/healthz').then(r=>console.log(r.status)).catch(()=>console.log(0))" 2>/dev/null | tail -1)"
[ "$code" = "200" ] && echo "Site n8n'e ulaşabiliyor." || echo "Uyarı: site n8n'e ulaşamadı (kod $code)."
cat <<TXT

Tamam. n8n'de 3 akış hazır: https://${N8N_DOMAIN:-n8n}
WhatsApp (Meta) bağlantısı için sıradaki adım:
  bash $DIR/deploy/whatsapp-kur.sh
TXT
