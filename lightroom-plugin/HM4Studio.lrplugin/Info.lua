--[[ HM4 Studio — Lightroom Classic eklentisi
  • Yayın hizmeti: "Seçim için" / "Düzenlenmiş" klasörlerine sürüklenen fotoğrafları çiftin sitesine yükler.
  • Kitaplık › Eklenti Ekstraları › HM4: Çiftleri getir — sitedeki çiftler için klasörleri oluşturur.
  • Kitaplık › Eklenti Ekstraları › HM4: Çiftin seçimini çek — çiftin seçtiği kareleri koleksiyona toplar. ]]
return {
  LrSdkVersion = 10.0,
  LrSdkMinimumVersion = 6.0,
  LrToolkitIdentifier = 'com.hm4studio.lightroom',
  LrPluginName = 'HM4 Studio',
  LrPluginInfoProvider = 'PluginInfo.lua',
  LrExportServiceProvider = {
    title = 'HM4 Studio',
    file = 'PublishService.lua',
  },
  LrLibraryMenuItems = {
    { title = 'HM4: Çiftleri getir / güncelle', file = 'SyncCouples.lua' },
    { title = 'HM4: Çiftin seçimini çek', file = 'PullSelection.lua' },
  },
  VERSION = { major = 1, minor = 0, revision = 0, display = '1.0.0' },
}
