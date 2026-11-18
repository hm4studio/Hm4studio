--[[ Yardımcılar (Lightroom'a bağlı değil; Lua 5.1 uyumlu, ayrıca test edilir). ]]
local Util = {}

function Util.trim(s) return (tostring(s or ''):gsub('^%s+', ''):gsub('%s+$', '')) end

-- Düz metni ayırıcıya göre böl (desen değil)
function Util.split(s, sep)
  local out, start = {}, 1
  while true do
    local i = string.find(s, sep, start, true)
    if not i then out[#out + 1] = string.sub(s, start); break end
    out[#out + 1] = string.sub(s, start, i - 1)
    start = i + #sep
  end
  return out
end

-- "OK\t12\n1\tAd\n" → { {'OK','12'}, {'1','Ad'} }
function Util.parseLines(body)
  local rows = {}
  for _, line in ipairs(Util.split((tostring(body or ''):gsub('\r', '')), '\n')) do
    if line ~= '' then rows[#rows + 1] = Util.split(line, '\t') end
  end
  return rows
end

function Util.urlEncode(s)
  return (tostring(s or ''):gsub('[^%w%-_%.~]', function(c) return string.format('%%%02X', string.byte(c)) end))
end

-- "DSC04387.ARW" → "DSC04387"; büyük harf
function Util.baseName(fileName)
  local b = tostring(fileName or ''):gsub('%.[%w]+$', '')
  return string.upper(b)
end

function Util.ext(fileName) return string.lower(tostring(fileName or ''):match('%.([%w]+)$') or '') end

local RAW = { arw = true, cr2 = true, cr3 = true, nef = true, raf = true, dng = true, orf = true, rw2 = true, pef = true, srw = true }
function Util.isRaw(fileName) return RAW[Util.ext(fileName)] == true end

-- Dosya adı seri numarasıyla eşleşiyor mu? Tam eşit ya da ad içinde ayrı bir parça olarak geçiyor
-- ("BÜYÜK DSC04387" ⊃ "DSC04387" evet; "DSC043870" hayır)
function Util.nameMatches(fileName, serial)
  local base, s = Util.baseName(fileName), string.upper(Util.trim(serial))
  if s == '' then return false end
  if base == s then return true end
  local i, j = string.find(base, s, 1, true)
  while i do
    local before = i > 1 and string.sub(base, i - 1, i - 1) or ''
    local after = j < #base and string.sub(base, j + 1, j + 1) or ''
    if not before:match('[%w]') and not after:match('[%w]') then return true end
    i, j = string.find(base, s, i + 1, true)
  end
  return false
end

-- Seri numarası için arama anahtarı: ilk "harf+rakam" parçası (DSC04387, HM307409, DSC_0012)
function Util.serialKey(fileName)
  local base = Util.baseName(fileName)
  return base:match('(%a+_?%d%d%d+)') or base
end

return Util
