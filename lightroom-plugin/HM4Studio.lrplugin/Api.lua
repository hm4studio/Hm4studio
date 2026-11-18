--[[ HM4 Studio sitesiyle konuşma (Lua 5.1).
  Yanıtlar sade metin: her satır sekmeyle ayrılmış alanlar. İlk satır "OK…", "KEEP…" ya da "ERR<TAB>mesaj".
  Bu dosyadaki işlevler LrHttp kullandığı için bir görev (LrTasks) içinden çağrılmalıdır. ]]
local LrHttp = import 'LrHttp'
local LrPrefs = import 'LrPrefs'

local Util = require 'Util'

local Api = {}

local okCfg, cfg = pcall(require, 'Config')
if not okCfg or type(cfg) ~= 'table' then cfg = {} end

function Api.prefs() return LrPrefs.prefsForPlugin() end

function Api.site()
  local p = Api.prefs()
  local s = Util.trim(p.site or '')
  if s == '' then s = cfg.site or 'https://www.hm4studio.com' end
  return (s:gsub('/+$', ''))
end

function Api.token() return Util.trim(Api.prefs().token or '') end

-- İstek: durum kodu, satırlar (alan dizileri), hata mesajı
function Api.request(method, path, body, extraHeaders, timeout)
  local token = Api.token()
  if token == '' then
    return nil, nil, 'Bağlantı kodu girilmemiş. Dosya › Eklenti Yöneticisi › HM4 Studio bölümüne panelden aldığınız kodu yapıştırın.'
  end
  local headers = { { field = 'Authorization', value = 'Bearer ' .. token } }
  if extraHeaders then for _, hdr in ipairs(extraHeaders) do headers[#headers + 1] = hdr end end
  local url = Api.site() .. path
  local resBody, resHeaders
  if method == 'GET' then
    resBody, resHeaders = LrHttp.get(url, headers, timeout or 30)
  else
    resBody, resHeaders = LrHttp.post(url, body or '', headers, 'POST', timeout or 120)
  end
  local status = resHeaders and resHeaders.status
  if not resBody or not status then
    local why = resHeaders and resHeaders.error and (resHeaders.error.name or resHeaders.error.nativeCode)
    return nil, nil, 'Siteye bağlanılamadı (' .. tostring(why or 'internet bağlantısını kontrol edin') .. ').'
  end
  local lines = Util.parseLines(resBody)
  local first = lines[1] or {}
  if first[1] == 'ERR' then return status, lines, first[2] or ('Sunucu hatası (' .. tostring(status) .. ')') end
  if status >= 400 or (first[1] ~= 'OK' and first[1] ~= 'KEEP') then
    return status, lines, 'Beklenmeyen yanıt (' .. tostring(status) .. '). Site güncel mi?'
  end
  return status, lines, nil
end

function Api.get(path) return Api.request('GET', path) end
function Api.post(path, body, headers, timeout) return Api.request('POST', path, body, headers, timeout) end

-- Bağlantıyı dene: true/false, mesaj
function Api.test()
  local status, _, err = Api.get('/api/lr/durum')
  if status == 200 and not err then return true, 'Bağlantı tamam: ' .. Api.site() end
  return false, err or 'Bağlanılamadı.'
end

-- Çiftler: { id, name, date, sel ('none'|'doing'|'done'), favs, secim, duzenli }
function Api.couples()
  local status, lines, err = Api.get('/api/lr/ciftler')
  if err then return nil, err end
  local out = {}
  for i = 2, #lines do
    local f = lines[i]
    if f[1] and f[1] ~= '' then
      out[#out + 1] = { id = f[1], name = f[2] or ('Çift ' .. f[1]), date = f[3] or '', sel = f[4] or 'none',
        favs = tonumber(f[5]) or 0, secim = tonumber(f[6]) or 0, duzenli = tonumber(f[7]) or 0 }
    end
  end
  return out, nil
end

-- Çiftin seçimi: liste { photoId, serial }, durum, çift adı
function Api.selection(coupleId)
  local status, lines, err = Api.get('/api/lr/ciftler/' .. coupleId .. '/secim')
  if err then return nil, err end
  local head = lines[1] or {}
  local out = {}
  for i = 2, #lines do
    local f = lines[i]
    if f[1] and f[1] ~= '' then out[#out + 1] = { photoId = f[1], serial = f[2] or '', name = f[3] or '' } end
  end
  return out, nil, head[2], head[3]
end

-- Fotoğraf yükle (yeni ya da güncelle). Dönüş: site fotoğraf no, hata, durum kodu
function Api.uploadPhoto(path, thumb, display, fileName, uploadKey)
  local headers = {
    { field = 'Content-Type', value = 'application/octet-stream' },
    { field = 'X-Parts', value = 'thumb:' .. #thumb .. ',display:' .. #display },
    { field = 'X-Filename', value = Util.urlEncode(fileName or '') },
  }
  if uploadKey then headers[#headers + 1] = { field = 'X-Upload-Key', value = uploadKey } end
  local status, lines, err = Api.post(path, thumb .. display, headers, 300)
  if err then return nil, err, status end
  local id = lines[1] and lines[1][2]
  if not id or id == '' then return nil, 'Site fotoğraf numarası döndürmedi.', status end
  return id, nil, status
end

return Api
