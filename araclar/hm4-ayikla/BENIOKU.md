# HM4 Ayıkla

Ham klip klasörünü ayıklar: her klipten **4–5 saniyelik, net, sarsıntısız ve birbirine benzemeyen** seçmeler çıkarır.
Kötü kısımları (sarsıntı, odak dışı, karanlık, kapalı lens, çok hızlı çevirme) eler; aynı anın tekrarlarını "yedek"e ayırır.
Orijinal dosyalara dokunmaz. Sonuçlar klasörün içindeki `_HM4-Ayiklama` klasörüne yazılır:

- `kareler/` — her seçmenin başı | ortası | sonu (üç kare yan yana)
- `<klasör> - Seçmeler.xml` — Premiere'e aktarılır (Dosya › İçe aktar): "Tüm seçmeler", her sınıf için ayrı sekans ve "Yedekler"
- `ayiklama.json` — bütün sonuçlar (Claude bunu kullanır)
- `onbellek/` — klip analizleri; aynı klasör ikinci kez çok hızlı ayıklanır

## Kurulum (Mac, bir kere)

1. **Node.js 20+**: nodejs.org › LTS sürümünü indirip kurun.
2. **ffmpeg**: Terminal'de `brew install ffmpeg`
   (Homebrew yoksa önce brew.sh sayfasındaki tek satırlık komutla kurun.)
3. Bu klasörü kalıcı bir yere koyun, ör. `Belgeler/HM4/hm4-ayikla`.
4. Terminal'de: `node ~/Documents/HM4/hm4-ayikla/cli.js --kur`
   Claude masaüstü uygulamasına "hm4-ayikla" aracı eklenir. Claude'u Cmd+Q ile kapatıp açın.

Kontrol: `node ~/Documents/HM4/hm4-ayikla/cli.js --kontrol`

## Claude ile kullanım

"Şu klasörü ayıkla: /Volumes/Disk/HilalBaran/Klipler" deyin. Claude:
1. Klasörü ayıklar (uzun klasörlerde birkaç dakika),
2. Her seçmenin karelerine bakıp sınıflar (Hazırlık, Çift, Aile, Misafir, Tören / önemli an, Eğlence / dans…) ve kullanılmazları işaretler,
3. Premiere XML'ini sınıflara göre hazırlar; kurguda seçmeleri doğrudan kullanır.

## Elle kullanım (Terminal)

    node cli.js "/klasör/yolu"                      # ayıkla
    node cli.js "/klasör/yolu" --sarsinti gevsek    # elde çekimler çok eleniyorsa
    node cli.js "/klasör/yolu" --benzerlik siki     # benzerleri daha çok ele
    node cli.js "/klasör/yolu" --min 3 --max 6      # seçme süresi
    node cli.js "/klasör/yolu" --alt                # alt klasörler dahil

Ayarlar değişince analiz baştan yapılmaz, sadece seçmeler yeniden hesaplanır.
