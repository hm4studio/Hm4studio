#!/usr/bin/env bash
# GitHub'da yeni sürüm varsa çeker ve yalnızca siteyi yeniden başlatır. Veriler etkilenmez.
# kur.sh bunu 5 dakikada bir çalışacak şekilde ayarlar.
set -euo pipefail
DIR="/opt/hm4studio"
cd "$DIR"
git fetch -q origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  # Son 10 dakikada fotoğraf/video yüklendiyse siteyi yeniden başlatma (yükleme yarıda kalmasın); 5 dk sonra yine bakılır.
  # Hemen güncellemek için: bash guncelle.sh --zorla
  if [ "${1:-}" != "--zorla" ]; then
    LAST="$(cd deploy && docker compose --env-file "$DIR/.env" exec -T site cat /data/yukleme-zamani 2>/dev/null | tr -dc '0-9' || true)"
    if [ -n "$LAST" ] && [ $(( $(date +%s) - LAST )) -lt 600 ]; then
      echo "$(date '+%F %T') yükleme sürüyor, güncelleme ertelendi"
      exit 0
    fi
  fi
  echo "$(date '+%F %T') yeni sürüm: $(git log --oneline -1 origin/main)"
  git reset -q --hard origin/main
  chmod +x deploy/*.sh
  cd deploy && docker compose --env-file "$DIR/.env" up -d --build site
  docker image prune -f >/dev/null
fi
