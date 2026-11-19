--[[ Dosya › Eklenti Yöneticisi › HM4 Studio: bağlantı kodu ve site adresi ]]
local LrView = import 'LrView'
local LrDialogs = import 'LrDialogs'
local LrTasks = import 'LrTasks'

local Api = require 'Api'

return {
  sectionsForTopOfDialog = function(f, propertyTable)
    local prefs = Api.prefs()
    local bind = LrView.bind
    return {
      {
        title = 'HM4 Studio bağlantısı',
        f:row {
          f:static_text { title = 'Bağlantı kodu:', width = LrView.share 'hm4_l' },
          f:password_field { value = bind { key = 'token', bind_to_object = prefs }, width_in_chars = 42, immediate = true },
        },
        f:row {
          f:static_text { title = 'Site:', width = LrView.share 'hm4_l' },
          f:edit_field { value = bind { key = 'site', bind_to_object = prefs }, width_in_chars = 42, placeholder_string = Api.site() },
        },
        f:row {
          f:static_text { title = '', width = LrView.share 'hm4_l' },
          f:push_button { title = 'Bağlantıyı dene', action = function()
            LrTasks.startAsyncTask(function()
              local ok, msg = Api.test()
              LrDialogs.message('HM4 Studio', msg, ok and 'info' or 'warning')
            end)
          end },
        },
        f:static_text {
          title = '1) Kodu panelden alın: Editör › Lightroom › Bağlantı kodu oluştur.\n'
            .. '2) Kitaplık › sol panel › Yayın Hizmetleri › + › HM4 Studio’yu ekleyin.\n'
            .. '3) Kitaplık › Eklenti Ekstraları › "HM4: Çiftleri getir" ile çift klasörlerini oluşturun.',
          height_in_lines = 3, width_in_chars = 70,
        },
      },
    }
  end,
}
