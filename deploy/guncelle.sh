#!/usr/bin/env bash
# GitHub'da yeni sürüm varsa çeker ve yalnızca siteyi yeniden başlatır. Veriler etkilenmez.
# kur.sh bunu 5 dakikada bir çalışacak şekilde ayarlar.
set -euo pipefail
DIR="/opt/hm4studio"
cd "$DIR"
git fetch -q origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "$(date '+%F %T') yeni sürüm: $(git log --oneline -1 origin/main)"
  git reset -q --hard origin/main
  chmod +x deploy/*.sh
  cd deploy && docker compose --env-file "$DIR/.env" up -d --build site
  docker image prune -f >/dev/null
fi
