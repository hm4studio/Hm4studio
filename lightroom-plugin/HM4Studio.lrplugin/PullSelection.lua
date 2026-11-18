--[[ Kitaplık › Eklenti Ekstraları › HM4: Çiftin seçimini çek
  Çiftin sitede seçtiği kareleri bulur ve "HM4 Studio – Albüm seçimleri" altında "<Çift> – Albüm" koleksiyonuna koyar.
  1) Eklentiyle yayınlanan fotoğraflar site numarasından birebir bulunur (en güvenilir yol).
  2) Kalanlar katalogda dosya adındaki seri numarasından aranır; aynı numaranın RAW'ı varsa RAW tercih edilir. ]]
local LrApplication = import 'LrApplication'
local LrDialogs = import 'LrDialogs'
local LrTasks = import 'LrTasks'
local LrFunctionContext = import 'LrFunctionContext'
local LrBinding = import 'LrBinding'
local LrView = import 'LrView'
local LrProgressScope = import 'LrProgressScope'

local Api = require 'Api'
local Util = require 'Util'

local SEL_TEXT = { done = 'seçim tamam', doing = 'seçiyor', none = 'seçmedi' }

local function chooseCouple(context, couples)
  local f = LrView.osFactory()
  local props = LrBinding.makePropertyTable(context)
  local items = {}
  for _, c in ipairs(couples) do
    if c.favs > 0 then
      items[#items + 1] = { title = c.name .. '  ·  ' .. c.favs .. ' kare  ·  ' .. (SEL_TEXT[c.sel] or ''), value = c.id }
    end
  end
  if #items == 0 then return nil, 'Henüz seçim yapmış çift yok.' end
  props.couple = items[1].value
  props.flag = true
  props.stars = true
  local result = LrDialogs.presentModalDialog {
    title = 'HM4 Studio — Çiftin seçimini çek',
    actionVerb = 'Seçimi çek',
    contents = f:column {
      bind_to_object = props, spacing = f:control_spacing(),
      f:static_text { title = 'Çift:' },
      f:popup_menu { value = LrView.bind 'couple', items = items, width_in_chars = 50 },
      f:checkbox { title = 'Bayrak ver (Seçildi)', value = LrView.bind 'flag' },
      f:checkbox { title = '5 yıldız ver', value = LrView.bind 'stars' },
      f:static_text { title = 'Kareler "HM4 Studio – Albüm seçimleri" altında, çiftin adıyla bir koleksiyonda toplanır.\nOrijinal fotoğraflara ve ayarlarına dokunulmaz.', height_in_lines = 2, width_in_chars = 56 },
    },
  }
  if result ~= 'ok' then return nil end
  for _, c in ipairs(couples) do if c.id == props.couple then return c, nil, props.flag, props.stars end end
  return nil
end

-- 1) Yayınlanmış fotoğraflar: site numarası → katalog fotoğrafı
local function publishedMap(catalog, coupleId)
  local map = {}
  local services = catalog:getPublishServices(_PLUGIN.id) or {}
  for _, service in ipairs(services) do
    for _, set in ipairs(service:getChildCollectionSets()) do
      if set:getRemoteId() == 'cift:' .. coupleId then
        for _, col in ipairs(set:getChildCollections()) do
          for _, pp in ipairs(col:getPublishedPhotos()) do
            local rid = pp:getRemoteId()
            if rid then map[tostring(rid)] = pp:getPhoto() end
          end
        end
      end
    end
  end
  return map
end

-- 2) Katalogdaki bütün dosya adları: seri anahtarı → fotoğraflar (bir kez okunur)
local function catalogIndex(catalog)
  local index = {}
  local photos = catalog:getAllPhotos()
  local meta = catalog:batchGetFormattedMetadata(photos, { 'fileName' })
  for _, photo in ipairs(photos) do
    local name = meta[photo] and meta[photo].fileName or ''
    local key = Util.serialKey(name)
    if not index[key] then index[key] = {} end
    table.insert(index[key], { photo = photo, name = name })
  end
  return index
end

LrTasks.startAsyncTask(function()
  LrFunctionContext.callWithContext('hm4_pull', function(context)
    LrDialogs.attachErrorDialogToFunctionContext(context)
    local catalog = LrApplication.activeCatalog()

    local couples, err = Api.couples()
    if not couples then LrDialogs.message('HM4 Studio', err, 'warning'); return end
    local couple, why, flag, stars = chooseCouple(context, couples)
    if not couple then if why then LrDialogs.message('HM4 Studio', why, 'info') end; return end

    local list, err2, state = Api.selection(couple.id)
    if not list then LrDialogs.message('HM4 Studio', err2, 'warning'); return end
    if #list == 0 then LrDialogs.message('HM4 Studio', couple.name .. ' henüz kare seçmedi.', 'info'); return end

    local progress = LrProgressScope { title = 'HM4: ' .. couple.name .. ' seçimi aranıyor', functionContext = context }
    local byId = publishedMap(catalog, couple.id)
    local index = nil
    local found, missing, jpgOnly, dupes = {}, {}, 0, 0
    local added = {}
    for i, item in ipairs(list) do
      progress:setPortionComplete(i / #list)
      local photo = byId[tostring(item.photoId)]
      local picks = {}
      if photo then
        picks[1] = photo
      else
        index = index or catalogIndex(catalog)
        local cands, raws = {}, {}
        for _, c in ipairs(index[Util.serialKey(item.serial)] or {}) do
          if Util.nameMatches(c.name, item.serial) then
            cands[#cands + 1] = c.photo
            if Util.isRaw(c.name) then raws[#raws + 1] = c.photo end
          end
        end
        if #raws > 0 then picks = raws elseif #cands > 0 then picks = cands; jpgOnly = jpgOnly + 1 end
        if #raws > 1 then dupes = dupes + 1 end
      end
      if #picks == 0 then
        missing[#missing + 1] = item.serial
      else
        for _, p in ipairs(picks) do
          if not added[p] then added[p] = true; found[#found + 1] = p end
        end
      end
    end
    progress:done()

    local col
    if #found > 0 then
      catalog:withWriteAccessDo('HM4: seçimi çek', function()
        local set = catalog:createCollectionSet('HM4 Studio – Albüm seçimleri', nil, true)
        col = catalog:createCollection(couple.name .. ' – Albüm', set, true)
        col:addPhotos(found)
        for _, p in ipairs(found) do
          if flag then p:setRawMetadata('pickStatus', 1) end
          if stars then p:setRawMetadata('rating', 5) end
        end
      end, { timeout = 60 })
      if col then pcall(function() catalog:setActiveSources { col } end) end
    end

    local msg = string.format('%d karenin %d tanesi bulundu ve "%s – Albüm" koleksiyonuna eklendi.', #list, #list - #missing, couple.name)
    if state ~= 'done' then msg = msg .. '\n\nNot: Çift seçimini henüz bitirmedi; sonradan tekrar çekebilirsiniz (koleksiyona eklenir).' end
    if jpgOnly > 0 then msg = msg .. '\n\n' .. jpgOnly .. ' karenin yalnızca JPG’si bulundu (RAW katalogda yok).' end
    if dupes > 0 then msg = msg .. '\n\n' .. dupes .. ' numara için birden fazla RAW var (iki makine); hepsi eklendi, kontrol edin.' end
    if #missing == 0 then
      LrDialogs.message('HM4 Studio', msg, 'info')
    else
      local f = LrView.osFactory()
      LrDialogs.presentModalDialog {
        title = 'HM4 Studio — Seçim çekildi',
        cancelVerb = '< exclude >',
        contents = f:column {
          spacing = f:control_spacing(),
          f:static_text { title = msg, width_in_chars = 60, height_in_lines = 4 },
          f:static_text { title = 'Katalogda bulunamayanlar (' .. #missing .. ') — kopyalayıp arayabilirsiniz:' },
          f:edit_field { value = table.concat(missing, ' '), width_in_chars = 60, height_in_lines = 4 },
        },
      }
    end
  end)
end)
