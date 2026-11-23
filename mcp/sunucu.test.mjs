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
const S = require('../src/core.js');

const SECRETS = ['Proje Atlas', 'Kuzey Hattı', 'Selin Aksoy', 'Kerem Tan', 'ACME Müşteri', '10000000146', '412000', '268500'];

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
  try {
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
  assert.match(readFileSync(path.join(dir, 'yanit.md'), 'utf8'), /^Proje Atlas en pahalısı: 412000 TL\. Sorumlusu Selin Aksoy\.$/);

  const g = await call('geri_ac_dosya', { dosya: m.cikti });
  const back = XLSX.read(readFileSync(g.cikti), { cellDates: true });
  assert.deepEqual(back.SheetNames, ['ACME Müşteri']);
  const rows = XLSX.utils.sheet_to_json(back.Sheets['ACME Müşteri'], { header: 1, raw: true });
  assert.equal(rows[1][0], 'Proje Atlas'); assert.equal(rows[1][3], 412000); assert.equal(rows[1][2].getDate(), 2);
  // D06: Excel'in sakladığı değer de tam gün olmalı (saat dilimine göre kesir eklenmemeli, gün kaymamalı).
  const seri = ws => XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, cellDates: false });
  const gun = (y, m, d) => Date.UTC(y, m, d) / 864e5 + 25569;
  const serial = seri(XLSX.read(readFileSync(g.cikti)).Sheets['ACME Müşteri']);
  assert.equal(serial[1][2], gun(2026, 2, 2)); assert.equal(serial[2][2], gun(2026, 2, 16));
  const mSerial = seri(XLSX.read(readFileSync(m.cikti)).Sheets['Sayfa 1']);
  assert.ok(Number.isInteger(mSerial[1][2]) && Number.isInteger(mSerial[2][2]), 'maskeli tarih tam gün');

  // D14: CSV çıktısında ayırıcı içeren değer tırnaklanır; dosya yeniden okununca sütunlar kaymaz.
  const csv = path.join(dir, 'raf.csv');
  writeFileSync(csv, 'Sorumlu;Not;Adet\nSelin Aksoy;"Raf A; Raf B";4\nKerem Tan;"çok ""acil""\nikinci satır";7\n');
  const mc = await call('maskele_dosya', { dosya: csv, sutunlar: [{ baslik: 'Sorumlu', islem: 'tag' }] });
  const back2 = S.parseTable(readFileSync(mc.cikti, 'utf8'));
  assert.deepEqual(back2[1].slice(1), ['Raf A; Raf B', '4']);
  assert.equal(back2[0].length, 3); assert.equal(back2.length, 3); assert.equal(back2[2][1], 'çok "acil"\nikinci satır');

  const k = await call('anahtar_ozeti', {});
  assert.equal(k.sifreli, true);
  assert.ok(!readFileSync(path.join(home, 'anahtar.json'), 'utf8').includes('Proje Atlas'));

  // Word, PowerPoint, JSON, PDF: aynı anahtar, biçim korunur, gerçek değer AI tarafına gitmez
  const ornek = path.join(import.meta.dirname, '..', 'test', 'ornek');
  for (const f of ['rapor.docx', 'sunum.pptx', 'belge.pdf']) writeFileSync(path.join(dir, f), readFileSync(path.join(ornek, f)));
  writeFileSync(path.join(dir, 'kayit.json'), JSON.stringify({ kayitlar: [{ operasyon: 'Proje Atlas', tutar: 412000 }, { operasyon: 'Kuzey Hattı', tutar: 268500 }] }, null, 2));
  const w = await call('maskele_dosya', { dosya: path.join(dir, 'rapor.docx'), terimler: ['Proje Atlas', 'Kuzey Hattı'] });
  assert.match(w.onizleme, /\[OPERASYON_1\] haftalık rapor/, 'bilinen değer aynı etiketi almalı');
  assert.ok(w.ozet.temizlenen.properties > 0);
  const wr = await call('geri_ac_dosya', { dosya: w.cikti });
  assert.ok(wr.geri_acilan > 0 && existsSync(wr.cikti));
  const pp = await call('maskele_dosya', { dosya: path.join(dir, 'sunum.pptx') });
  assert.match(pp.onizleme, /\[OPERASYON_1\] durumu/);
  const fl = await call('basliklari_goster', { dosya: path.join(dir, 'kayit.json') });
  assert.deepEqual(fl.alanlar.map(a => a.yol), ['kayitlar[].operasyon', 'kayitlar[].tutar']);
  const js = await call('maskele_dosya', { dosya: path.join(dir, 'kayit.json'), alanlar: [{ yol: 'kayitlar[].tutar', islem: 'scale' }] });
  assert.match(js.onizleme, /"operasyon": "\[OPERASYON_1\]"/);
  const jr = await call('geri_ac_dosya', { dosya: js.cikti });
  assert.deepEqual(JSON.parse(readFileSync(jr.cikti, 'utf8')).kayitlar.map(k => k.tutar), [412000, 268500]);
  const pd = await call('maskele_dosya', { dosya: path.join(dir, 'belge.pdf') });
  assert.match(pd.onizleme, /\[OPERASYON_1\] raporu: \[SORUMLU_1\] \(T\.C\. \[TCKN_1\]\)/);
  assert.match(pd.cikti, /\.maskeli\.txt$/);

  await assert.rejects(() => call('basliklari_goster', { dosya: path.join(tmp, 'disarida.xlsx') }), /izin yok/);
  } finally { await client.close(); }

  const all = seen.join('\n');
  for (const s of SECRETS) assert.ok(!all.includes(s), `AI tarafına sızdı: ${s}`);
});
