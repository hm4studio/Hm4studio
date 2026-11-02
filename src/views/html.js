'use strict';
// Güvenli HTML şablonları: h`...` içindeki her değer otomatik olarak kaçışlanır (XSS koruması).
// Önceden üretilmiş HTML'i eklemek için raw(...) kullanılır.

class Raw {
  constructor(str) { this.str = str; }
  toString() { return this.str; }
}

const raw = (str) => new Raw(String(str));

function escape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render(value) {
  if (value === null || value === undefined || value === false || value === true) return '';
  if (value instanceof Raw) return value.str;
  if (Array.isArray(value)) return value.map(render).join('');
  return escape(value);
}

function h(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new Raw(out);
}

module.exports = { h, raw, escape, Raw };
