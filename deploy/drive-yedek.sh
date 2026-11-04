#!/usr/bin/env bash
# Her gece: en yeni veritabanı yedeği + site görselleri → şifreli tek dosya → Google Drive (HM4-Yedek klasörü).
# Drive'da son 60 gün tutulur. Kurulum: deploy/drive-kur.sh
set -euo pipefail
DIR="/opt/hm4studio"
set -a; . "$DIR/.env"; set +a
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE yok, önce drive-kur.sh çalıştırın}"
REMOTE="${DRIVE_REMOTE:-gdrive:HM4-Yedek}"
DATA="${HM4_DATA:-$(docker volume inspect -f '{{.Mountpoint}}' deploy_hm4-data)}"

DB="$(ls -1t "$DATA"/backups/hm4-*.db 2>/dev/null | head -1 || true)"
[ -n "$DB" ] || { echo "$(date '+%F %T') veritabanı yedeği bulunamadı"; exit 1; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OUT="$TMP/hm4-$(date +%F).tar.gz.enc"
# Veritabanı (çiftler, randevular, ödemeler, sözleşmeler) + sitede kullanılan görseller
tar -C "$DATA" -czf - "backups/$(basename "$DB")" public 2>/dev/null \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$OUT"

rclone copy "$OUT" "$REMOTE" --quiet
rclone delete "$REMOTE" --min-age 60d --include 'hm4-*.enc' --quiet || true
echo "$(date '+%F %T') Drive yedeği gönderildi: $(basename "$OUT") ($(du -h "$OUT" | cut -f1))"
