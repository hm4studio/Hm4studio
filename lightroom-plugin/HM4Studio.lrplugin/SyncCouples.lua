--[[ Kitaplık › Eklenti Ekstraları › HM4: Çiftleri getir / güncelle
  Sitedeki her çift için yayın hizmetinin altında bir küme ve içinde "Seçim için" + "Düzenlenmiş" klasörleri oluşturur.
  Daha önce oluşturulanlar tekrar oluşturulmaz (uzak numarasından tanınır); yeniden adlandırılmışlarsa adlarına dokunulmaz. ]]
local LrApplication = import 'LrApplication'
local LrDialogs = import 'LrDialogs'
local LrTasks = import 'LrTasks'
local LrFunctionContext = import 'LrFunctionContext'

local Api = require 'Api'

local function findService(catalog)
  local services = catalog:getPublishServices(_PLUGIN.id)
  return services and services[1]
end

LrTasks.startAsyncTask(function()
  LrFunctionContext.callWithContext('hm4_sync', function(context)
    LrDialogs.attachErrorDialogToFunctionContext(context)
    local catalog = LrApplication.activeCatalog()
    local service = findService(catalog)
    if not service then
      LrDialogs.message('HM4 Studio', 'Önce yayın hizmetini kurun: Kitaplık’ta sol paneldeki "Yayın Hizmetleri" › + › "Yayın Hizmetine Git…" › HM4 Studio. Bağlantı kodunu orada girip Kaydet’e basın.', 'info')
      return
    end
    local couples, err = Api.couples()
    if not couples then LrDialogs.message('HM4 Studio', err, 'warning'); return end

    -- Aynı adlı iki çift karışmasın: ad tekrar ediyorsa tarihi eklenir
    local seenName = {}
    for _, c in ipairs(couples) do seenName[c.name] = (seenName[c.name] or 0) + 1 end

    local sets = {}
    for _, s in ipairs(service:getChildCollectionSets()) do
      local r = s:getRemoteId()
      if r then sets[r] = s end
    end

    local added = {}
    catalog:withWriteAccessDo('HM4: çiftleri getir', function()
      for _, c in ipairs(couples) do
        local key = 'cift:' .. c.id
        local set = sets[key]
        if not set then
          local name = c.name
          if seenName[c.name] > 1 and c.date ~= '' then name = name .. ' · ' .. c.date end
          set = service:createPublishedCollectionSet(name, nil, true)
          set:setRemoteId(key)
          set:setRemoteUrl(Api.site() .. '/admin/ciftler/' .. c.id)
          added[#added + 1] = name
        end
        local have = {}
        for _, col in ipairs(set:getChildCollections()) do
          local r = col:getRemoteId()
          if r then have[r] = true end
        end
        for _, def in ipairs({ { 'secim', 'Seçim için' }, { 'duzenli', 'Düzenlenmiş' } }) do
          local rid = c.id .. ':' .. def[1]
          if not have[rid] then
            local col = service:createPublishedCollection(def[2], set, true)
            col:setRemoteId(rid)
            col:setRemoteUrl(Api.site() .. '/admin/ciftler/' .. c.id)
          end
        end
      end
    end, { timeout = 60 })

    if #added > 0 then
      LrDialogs.message('HM4 Studio', #added .. ' çift eklendi:\n' .. table.concat(added, '\n'), 'info')
    else
      LrDialogs.message('HM4 Studio', 'Çiftler güncel (' .. #couples .. ' çift).', 'info')
    end
  end)
end)
