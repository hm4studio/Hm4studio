#!/usr/bin/env bash
# Google Drive yedeğini kurar (bir kez çalıştırılır, yeniden çalıştırmak güvenlidir).
#   bash /opt/hm4studio/deploy/drive-kur.sh
set -euo pipefail
DIR="/opt/hm4studio"; ENV_FILE="$DIR/.env"
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

say "1/4 · rclone kuruluyor"
command -v rclone >/dev/null 2>&1 || { apt-get install -y unzip >/dev/null; curl -fsSL https://rclone.org/install.sh | bash >/dev/null; }
rclone version | head -1

say "2/4 · Yedek şifresi"
if grep -q '^BACKUP_PASSPHRASE=' "$ENV_FILE"; then
  echo "Mevcut yedek şifresi korunuyor."
else
  PASS="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-28)"
  echo "BACKUP_PASSPHRASE=$PASS" >> "$ENV_FILE"
  echo "Yedekler bu şifreyle kilitlenir. ŞİMDİ bir yere kaydedin (ör. iCloud Anahtar Zinciri / Notlar):"
  echo
  echo "    $PASS"
  echo
  echo "Bu şifre olmadan Drive'daki yedekler açılamaz."
  read -r -p "Kaydettiyseniz Enter'a basın… " _ </dev/tty
fi

say "3/4 · Google Drive bağlantısı"
if rclone listremotes | grep -q '^gdrive:$'; then
  echo "Google Drive zaten bağlı."
else
  cat <<'TXT'
MacBook'unuzda Terminal'i açın ve şu satırı yapıştırın (tarayıcı açılır, Google hesabınızla izin verin):

  cd /tmp && curl -sLO "https://downloads.rclone.org/rclone-current-osx-$([ "$(uname -m)" = arm64 ] && echo arm64 || echo amd64).zip" && unzip -oq rclone-current-osx-*.zip && ./rclone-*-osx-*/rclone authorize "drive" "eyJzY29wZSI6ImRyaXZlLmZpbGUifQ=="

İzin verdikten sonra Mac Terminal'inde {"access_token": ... ile başlayan uzun bir satır çıkar.
O satırın TAMAMINI kopyalayıp aşağıya yapıştırın ve Enter'a basın.
(Bu izinle rclone yalnızca kendi oluşturduğu HM4-Yedek klasörünü görebilir, Drive'ınızdaki diğer dosyaları göremez.)
TXT
  read -r -p "Token: " TOKEN </dev/tty
  case "$TOKEN" in \{*access_token*\}) ;; *) echo "Bu bir token gibi görünmüyor. Betiği yeniden çalıştırın."; exit 1;; esac
  rclone config create gdrive drive scope=drive.file token="$TOKEN" --non-interactive >/dev/null
  echo "Google Drive bağlandı."
fi

say "4/4 · İlk yedek ve her gece 04:30 otomatik yedek"
chmod +x "$DIR/deploy/drive-yedek.sh"
cat > /etc/cron.d/hm4-drive <<CRON
# 01:30 UTC = 04:30 Türkiye
30 1 * * * root $DIR/deploy/drive-yedek.sh >> /var/log/hm4-drive.log 2>&1
CRON
"$DIR/deploy/drive-yedek.sh"
echo
echo "Tamam. Google Drive'ınızda HM4-Yedek klasörünü görebilirsiniz. Kayıt: /var/log/hm4-drive.log"
