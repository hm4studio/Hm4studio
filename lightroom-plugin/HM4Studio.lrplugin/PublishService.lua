--[[ HM4 Studio yayın hizmeti.
  Her çift bir klasör kümesi; içinde "Seçim için" (uzak no: "<çift>:secim") ve "Düzenlenmiş" ("<çift>:duzenli").
  Bu klasörler Kitaplık › Eklenti Ekstraları › HM4: Çiftleri getir ile oluşturulur.
  Yayınla: her fotoğraf 2400 px (büyük görünüm) + 640 px (galeri) JPEG olarak siteye gider; dosya adı orijinal kalır. ]]
local LrView = import 'LrView'
local LrDialogs = import 'LrDialogs'
local LrTasks = import 'LrTasks'
local LrFileUtils = import 'LrFileUtils'
local LrMD5 = import 'LrMD5'

local Api = require 'Api'
local Util = require 'Util'

local provider = {}

provider.supportsIncrementalPublish = 'only'
provider.small_icon = 'icon.png'
provider.hideSections = { 'exportLocation', 'postProcessing', 'fileNaming', 'fileSettings', 'imageSettings', 'outputSharpening', 'metadata', 'watermarking', 'video' }
provider.allowFileFormats = { 'JPEG' }
provider.allowColorSpaces = { 'sRGB' }
provider.hidePrintResolution = true
provider.canExportVideo = false
provider.exportPresetFields = {}
provider.titleForPublishedCollection = 'Klasör'
provider.titleForPublishedCollectionSet = 'Çift'
provider.titleForGoToPublishedCollection = 'Sitede çifti aç'
provider.titleForGoToPublishedPhoto = 'Sitede çifti aç'

-- Ayarlar sabit: site kendi küçültmesini yaptığı gibi (2400 px, sRGB). Dosya adı değişmez (seçim/ARW eşleşmesi için).
function provider.updateExportSettings(s)
  s.LR_format = 'JPEG'
  s.LR_jpeg_quality = 0.88
  s.LR_export_colorSpace = 'sRGB'
  s.LR_export_bitDepth = 8
  s.LR_size_doConstrain = true
  s.LR_size_doNotEnlarge = true
  s.LR_size_resizeType = 'longEdge'
  s.LR_size_maxWidth = 2400
  s.LR_size_maxHeight = 2400
  s.LR_size_units = 'pixels'
  s.LR_size_resolution = 240
  s.LR_outputSharpeningOn = true
  s.LR_outputSharpeningMedia = 'screen'
  s.LR_outputSharpeningLevel = 2
  s.LR_renamingTokensOn = false
  s.LR_minimizeEmbeddedMetadata = true
  s.LR_removeLocationMetadata = true
  s.LR_includeVideoFiles = false
  s.LR_useWatermark = false
end

function provider.getCollectionBehaviorInfo(publishSettings)
  return {
    defaultCollectionName = 'Seçim için',
    defaultCollectionCanBeDeleted = true,
    canAddCollection = true,
    maxCollectionSetDepth = 1,
  }
end

local function parseRemote(rid)
  local id, kind = tostring(rid or ''):match('^(%d+):(%a+)$')
  if kind ~= 'secim' and kind ~= 'duzenli' then return nil end
  return id, kind
end

local function readFile(path)
  local fh = path and io.open(path, 'rb')
  if not fh then return nil end
  local data = fh:read('*a')
  fh:close()
  return data
end

function provider.sectionsForTopOfDialog(f, propertyTable)
  local prefs = Api.prefs()
  local bind = LrView.bind
  return {
    {
      title = 'HM4 Studio bağlantısı',
      synopsis = 'Site: ' .. Api.site(),
      f:row {
        f:static_text { title = 'Bağlantı kodu:', width = LrView.share 'hm4_lbl' },
        f:password_field { value = bind { key = 'token', bind_to_object = prefs }, width_in_chars = 42, immediate = true },
      },
      f:row {
        f:static_text { title = '', width = LrView.share 'hm4_lbl' },
        f:push_button { title = 'Bağlantıyı dene', action = function()
          LrTasks.startAsyncTask(function()
            local ok, msg = Api.test()
            LrDialogs.message('HM4 Studio', msg, ok and 'info' or 'warning')
          end)
        end },
      },
      f:static_text {
        title = 'Kodu panelden alın: Editör › Lightroom › Bağlantı kodu oluştur (Photoshop eklentisiyle aynı kod).\n'
          .. 'Kaydettikten sonra Kitaplık › Eklenti Ekstraları › "HM4: Çiftleri getir" ile çiftlerin klasörlerini oluşturun.',
        height_in_lines = 3, width_in_chars = 70,
      },
    },
  }
end

-- Galeri için 640 px küçük resim: Lightroom'un kendi önizlemesinden (ayrı dışa aktarma gerekmez)
local function makeThumb(photo)
  local data, done = nil, false
  local req = photo:requestJpegThumbnail(640, 640, function(jpeg, err)
    data = jpeg; done = true
  end)
  local waited = 0
  while not done and waited < 15 do LrTasks.sleep(0.1); waited = waited + 0.1 end
  req = nil
  if data and #data > 1000 then return data end
  return nil
end

function provider.processRenderedPhotos(functionContext, exportContext)
  local session = exportContext.exportSession
  local collection = exportContext.publishedCollection
  local rid = collection and collection:getRemoteId()
  local coupleId, kind = parseRemote(rid)
  local count = session:countRenditions()
  local progress = exportContext:configureProgress {
    title = count > 1 and ('HM4 Studio: ' .. count .. ' fotoğraf siteye yükleniyor') or 'HM4 Studio: fotoğraf siteye yükleniyor',
  }

  if not coupleId then
    local msg = 'Bu klasör bir çifte bağlı değil. Kitaplık › Eklenti Ekstraları › "HM4: Çiftleri getir" ile oluşan "Seçim için" ya da "Düzenlenmiş" klasörüne sürükleyin.'
    for _, rendition in exportContext:renditions { stopIfCanceled = true } do rendition:uploadFailed(msg) end
    return
  end

  local done, failed = 0, 0
  for i, rendition in exportContext:renditions { stopIfCanceled = true } do
    progress:setPortionComplete((i - 1) / count)
    progress:setCaption('Yükleniyor: ' .. i .. ' / ' .. count)
    local photo = rendition.photo
    local ok, pathOrMsg = rendition:waitForRender()
    if progress:isCanceled() then break end
    if not ok then
      rendition:uploadFailed(pathOrMsg or 'Fotoğraf hazırlanamadı')
      failed = failed + 1
    else
      local display = readFile(pathOrMsg)
      local thumb = makeThumb(photo) or display
      local fileName = Util.baseName(photo:getFormattedMetadata('fileName')) .. '.jpg'
      if not display then
        rendition:uploadFailed('Hazırlanan dosya okunamadı')
        failed = failed + 1
      else
        local id, err, status
        if rendition.publishedPhotoId then
          id, err, status = Api.uploadPhoto('/api/lr/foto/' .. rendition.publishedPhotoId .. '/guncelle', thumb, display, fileName)
          if status == 404 then id, err = nil, nil end -- sitede silinmiş: yeni olarak yükle
        end
        if not id and not err then
          local key = LrMD5.digest(tostring(photo.localIdentifier) .. ':' .. tostring(photo:getRawMetadata('uuid')) .. ':' .. rid)
          id, err = Api.uploadPhoto('/api/lr/ciftler/' .. coupleId .. '/foto?tur=' .. kind, thumb, display, fileName, key)
        end
        if id then
          rendition:recordPublishedPhotoId(id)
          rendition:recordPublishedPhotoUrl(Api.site() .. '/admin/ciftler/' .. coupleId)
          done = done + 1
        else
          rendition:uploadFailed(err or 'Yüklenemedi')
          failed = failed + 1
        end
      end
      LrFileUtils.delete(pathOrMsg)
    end
  end
  progress:setPortionComplete(1)
end

-- Lightroom'da yayından kaldırılan fotoğraf sitede silinir; çiftin albüm seçimindeyse sitede bırakılır
function provider.deletePhotosFromPublishedCollection(publishSettings, arrayOfPhotoIds, deletedCallback)
  local kept = 0
  for _, id in ipairs(arrayOfPhotoIds) do
    local status, lines, err = Api.post('/api/lr/foto/' .. tostring(id) .. '/sil', '')
    if err then error(err) end
    if lines and lines[1] and lines[1][1] == 'KEEP' then kept = kept + 1 end
    deletedCallback(id)
  end
  if kept > 0 then
    LrDialogs.message('HM4 Studio', kept .. ' fotoğraf çiftin albüm seçiminde olduğu için sitede bırakıldı (yalnızca Lightroom klasöründen çıkarıldı).', 'info')
  end
end

return provider
