#!/usr/bin/env node
'use strict';
// HM4 Ayıkla — komut satırı ve Claude (MCP) sunucusu
//   hm4-ayikla <klasör> [--min 4] [--max 5] [--benzerlik siki|normal|gevsek] [--sarsinti siki|normal|gevsek] [--alt]
//   hm4-ayikla --mcp        Claude uygulaması için sunucu (Claude bunu kendisi başlatır)
//   hm4-ayikla --kur        Claude masaüstü uygulamasına ekler
//   hm4-ayikla --kontrol    ffmpeg ve kurulum kontrolü
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

if (process.platform === 'darwin') process.env.PATH = `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`;
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };

function check() {
  const ok = (cmd) => { try { execFileSync(cmd, ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } };
  const ff = ok('ffmpeg'), fp = ok('ffprobe');
  console.log(`Node ${process.version} ${Number(process.versions.node.split('.')[0]) >= 20 ? '✓' : '✗ (20 veya üstü gerekli)'}`);
  console.log(`ffmpeg ${ff ? '✓' : '✗  → Terminal: brew install ffmpeg'}`);
  console.log(`ffprobe ${fp ? '✓' : '✗  → ffmpeg ile birlikte gelir'}`);
  return ff && fp;
}

function install() {
  const cfgDir = process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support', 'Claude') : path.join(os.homedir(), '.config', 'Claude');
  const cfg = path.join(cfgDir, 'claude_desktop_config.json');
  fs.mkdirSync(cfgDir, { recursive: true });
  let data = {};
  if (fs.existsSync(cfg)) {
    try { data = JSON.parse(fs.readFileSync(cfg, 'utf8')); } catch { console.error('claude_desktop_config.json okunamadı; elle düzeltin.'); process.exit(1); }
    fs.copyFileSync(cfg, cfg + '.yedek');
  }
  data.mcpServers = data.mcpServers || {};
  data.mcpServers['hm4-ayikla'] = { command: process.execPath, args: [path.resolve(__filename), '--mcp'] };
  fs.writeFileSync(cfg, JSON.stringify(data, null, 2));
  console.log(`Claude uygulamasına eklendi: ${cfg}\nClaude uygulamasını tamamen kapatıp (Cmd+Q) yeniden açın.`);
}

async function main() {
  if (flag('--mcp')) return require('./lib/mcp').serve();
  if (flag('--kur')) { check(); return install(); }
  if (flag('--kontrol')) { process.exit(check() ? 0 : 1); }
  const klasor = argv.find((a) => !a.startsWith('--') && ![val('--min'), val('--max'), val('--benzerlik'), val('--sarsinti')].includes(a));
  if (!klasor) { console.log('Kullanım: hm4-ayikla <klasör> [--min 4] [--max 5] [--benzerlik siki|normal|gevsek] [--sarsinti siki|normal|gevsek] [--alt]\n          hm4-ayikla --kur   (Claude uygulamasına ekle)'); return; }
  if (!check()) process.exit(1);
  const { runFolder, outDir } = require('./lib/run');
  let last = '';
  const data = await runFolder(klasor, {
    min: val('--min') ? Number(val('--min')) : undefined, max: val('--max') ? Number(val('--max')) : undefined,
    benzerlik: val('--benzerlik'), sarsinti: val('--sarsinti'), altKlasorler: flag('--alt'),
    onProgress: (t, p) => { const line = `%${String(Math.round(p * 100)).padStart(3)} ${t}`; if (line !== last) { process.stdout.write(`\r${line.padEnd(70)}`); last = line; } },
  });
  process.stdout.write('\n');
  const o = data.ozet;
  console.log(`\n${o.klip} klip → ${o.secme} seçme (${o.sure} sn), ${o.yedek} yedek${o.hata ? `, ${o.hata} okunamadı` : ''}`);
  for (const c of data.klipler) console.log(`  ${c.ad}: ${c.durum === 'tamam' ? `${c.secmeler.length} seçme${c.yedekler.length ? `, ${c.yedekler.length} yedek` : ''}${c.reddedilen.length ? ` · elenen: ${c.reddedilen.map((r) => r.neden).filter((v, i, a) => a.indexOf(v) === i).join(', ')}` : ''}` : `okunamadı (${c.hata})`}`);
  console.log(`\nKare şeritleri ve Premiere XML: ${outDir(data.klasor)}`);
}

main().catch((err) => { console.error(`\nHata: ${err.message}`); process.exit(1); });
