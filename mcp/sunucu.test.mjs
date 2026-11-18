// MCP sunucusunu gerçek bir istemciyle uçtan uca dener: yapay zekâya giden yanıtlarda gerçek değer olmamalı.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const require = createRequire(import.meta.url);
const XLSX = require('../lib/xlsx.full.min.js');

const SECRETS = ['Proje Atlas', 'Kuzey Hattı', 'Selin Aksoy', 'Kerem Tan', 'ACME Müşteri'];

test('MCP: maskele, AI yanıtını kaydet, dosyayı geri aç; gerçek değer AI tarafına hiç gitmez', async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'sirdas-'));
  const dir = path.join(tmp, 'raporlar'), home = path.join(tmp, 'ev');
  mkdirSync(dir); mkdirSync(path.join(home, 'sablonlar'), { recursive: true });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Operasyon', 'Sorumlu', 'Başlangıç', 'Maliyet', 'Not'],
    ['Proje Atlas', 'Selin Aksoy', new Date(2026, 2, 2), 412000, 'Kuzey Hattı ile aynı ekip'],
    ['Kuzey Hattı', 'Kerem Tan', new Date(2026, 2, 16), 268500, 'gecikme']
  ], { cellDates: true }), 'ACME Müşteri');
  const file = path.join(dir, 'haftalik.xlsx'); writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true }));
  writeFileSync(path.join(home, 'sablonlar', 'haftalik.json'), JSON.stringify({ format: 'sirdas-sablon', v: 1, name: 'Haftalık', columns: [{ header: 'Operasyon', action: 'tag' }, { header: 'Maliyet', action: 'scale' }], options: { propagate: true, hideSheetNames: true }, terms: [] }));

  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(import.meta.dirname, 'sunucu.mjs'), dir], env: { ...process.env, SIRDAS_DIZIN: home, SIRDAS_PAROLA: 'parola12345' }, stderr: 'pipe' });
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(transport);
  const seen = [];
  const call = async (name, args) => { const r = await client.callTool({ name, arguments: args }); const txt = r.content.map(c => c.text).join(''); seen.push(txt); if (r.isError) throw new Error(txt); return JSON.parse(txt); };

  const tools = (await client.listTools()).tools.map(t => t.name).sort();
  assert.deepEqual(tools, ['anahtar_ozeti', 'basliklari_goster', 'geri_ac_dosya', 'maskele_dosya', 'sablonlari_listele', 'yaniti_kaydet']);

  const h = await call('basliklari_goster', { dosya: file });
  assert.deepEqual(h.sayfalar[0].sutunlar.map(c => c.tur), ['metin', 'metin', 'tarih', 'sayı', 'metin']);
  assert.deepEqual((await call('sablonlari_listele', {})).sablonlar.map(s => s.ad), ['Haftalık']);

  const m = await call('maskele_dosya', { dosya: file, sablon: 'Haftalık', sutunlar: [{ baslik: 'Sorumlu', islem: 'tag' }, { baslik: 'Başlangıç', islem: 'date' }] });
  assert.match(m.onizleme, /\[OPERASYON_1\]\t\[SORUMLU_1\]/);
  assert.match(m.onizleme, /\[OPERASYON_2\] ile aynı ekip/);
  assert.ok(existsSync(m.cikti));
  const masked = XLSX.read(readFileSync(m.cikti), { cellDates: true });
  assert.deepEqual(masked.SheetNames, ['Sayfa 1']);
  const cost = XLSX.utils.sheet_to_json(masked.Sheets['Sayfa 1'], { header: 1, raw: true })[1][3];
  assert.notEqual(cost, 412000);

  const y = await call('yaniti_kaydet', { metin: `[OPERASYON_1] en pahalısı: ${cost} TL. Sorumlusu [SORUMLU_1].`, cikti: path.join(dir, 'yanit.md') });
  assert.equal(y.geri_acilan_etiket, 2);
  assert.match(readFileSync(path.join(dir, 'yanit.md'), 'utf8'), /^Proje Atlas en pahalısı: 41(1999|2000|2001) TL\. Sorumlusu Selin Aksoy\.$/);

  const g = await call('geri_ac_dosya', { dosya: m.cikti });
  const back = XLSX.read(readFileSync(g.cikti), { cellDates: true });
  assert.deepEqual(back.SheetNames, ['ACME Müşteri']);
  const rows = XLSX.utils.sheet_to_json(back.Sheets['ACME Müşteri'], { header: 1, raw: true });
  assert.equal(rows[1][0], 'Proje Atlas'); assert.equal(rows[1][3], 412000); assert.equal(rows[1][2].getDate(), 2);

  const k = await call('anahtar_ozeti', {});
  assert.equal(k.sifreli, true);
  assert.ok(!readFileSync(path.join(home, 'anahtar.json'), 'utf8').includes('Proje Atlas'));

  await assert.rejects(() => call('basliklari_goster', { dosya: path.join(tmp, 'disarida.xlsx') }), /izin yok/);
  await client.close();

  const all = seen.join('\n');
  for (const s of SECRETS) assert.ok(!all.includes(s), `AI tarafına sızdı: ${s}`);
});
