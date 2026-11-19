// Ofis katmanı testleri: biçimli Excel, Word, PowerPoint, PDF (Node'da, ExcelJS + JSZip + pdf.js ile).
import './konsol.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const S = require('../src/core.js'), O = require('../src/ofis.js'), XLSX = require('../lib/xlsx.full.min.js'), JSZip = require('jszip');
O.init({ ExcelJS: require('exceljs'), JSZip, pdfjsLib: await import('pdfjs-dist/legacy/build/pdf.mjs') });
const ornek = f => readFileSync(path.join(import.meta.dirname, '..', 'test', 'ornek', f));
const allText = async bytes => { const z = await JSZip.loadAsync(bytes); return (await Promise.all(Object.keys(z.files).filter(n => !z.files[n].dir && !/\.(png|jpe?g|emf|bin)$/.test(n)).map(n => z.file(n).async('string')))).join('\n'); };
const terms = [{ term: 'Proje Atlas', label: 'OPERASYON' }, { term: 'Kuzey Hattı', label: 'OPERASYON' }];

test('Excel biçimi korunur; formül, not, açılır liste, gizli sayfa ve yazar temizlenir', async () => {
  const bytes = ornek('tablo.xlsx');
  const book = O.bookFromSheetJS(XLSX, XLSX.read(bytes, { cellDates: true }), 'tr');
  assert.deepEqual(book.sheets.map(s => s.hidden), [false, true]);
  assert.deepEqual(book.sheets[0].pos.r, [0, 1, 2, 4]);
  const key = S.newKey();
  const res = S.maskBook(book, key, { sheets: [{ hdr: true, cols: { 0: { action: 'tag' }, 1: { action: 'date' }, 2: { action: 'scale' } } }, { hdr: true, include: false }], propagate: true, hideSheetNames: true });
  S.commit(key, res);
  const out = await O.excelMaskPreserve(bytes, book, res, { hideSheetNames: true });
  assert.deepEqual([out.report.formulas, out.report.notes, out.report.validations, out.report.sheetsRemoved], [1, 1, 1, 1]);
  const txt = await allText(out.bytes);
  for (const s of ['Proje Atlas', 'Kuzey', 'Selin', 'Yusuf', 'ALFA', 'ACME', 'SUM(']) assert.ok(!txt.includes(s), 'sızdı: ' + s);
  const w = XLSX.read(out.bytes, { cellStyles: true, cellNF: true }), s0 = w.Sheets[w.SheetNames[0]];
  assert.deepEqual(w.SheetNames, ['Sayfa 1']);
  assert.equal(s0.A1.s.fgColor.rgb, '14222B');
  assert.equal(s0.C2.z, '#,##0 "TL"');
  const back = await O.excelRestore(out.bytes, key, { numbers: true, dates: true });
  const r = XLSX.read(back.bytes, { cellDates: true }), r0 = r.Sheets['Müşteri ACME'];
  assert.equal(r0.A2.v, 'Proje Atlas'); assert.equal(r0.C2.v, 412000); assert.equal(r0.B2.v.getDate(), 2); assert.equal(r0.D2.v, 'Kuzey Hattı ile');
});

test('Word biçimiyle maskelenir ve geri açılır; belge özellikleri temizlenir', async () => {
  const key = S.newKey();
  const m = await O.docMask(ornek('rapor.docx'), key, { manual: terms, auto: true });
  S.commit(key, m.result);
  assert.match(m.preview, /^\[OPERASYON_1\] haftalık rapor\nBu hafta \[OPERASYON_1\] ile \[OPERASYON_2\] birlikte ilerledi\. Sorumlu \[AD_1\]\./);
  const txt = await allText(m.bytes);
  for (const s of ['Proje Atlas', 'Kuzey Hatt', 'Selin', 'Yusuf']) assert.ok(!txt.includes(s), 'sızdı: ' + s);
  assert.ok(txt.includes('<w:b/>'), 'kalın biçim kalmalı');
  const back = await O.docRestore(m.bytes, key);
  assert.match((await O.docInfo(back.bytes)).text, /Bu hafta Proje Atlas ile Kuzey Hattı birlikte ilerledi\. Sorumlu Selin Aksoy\./);
});

test('PowerPoint: slayt, konuşmacı notu ve grafik etiketleri gizlenir; grafik verisi boşaltılır', async () => {
  const key = S.newKey();
  const m = await O.docMask(ornek('sunum.pptx'), key, { manual: terms, auto: true });
  assert.equal(m.report.embedded, 1);
  const txt = await allText(m.bytes);
  for (const s of ['Proje Atlas', 'Kuzey Hatt', 'Selin', 'Kerem Tan', 'Yusuf']) assert.ok(!txt.includes(s), 'sızdı: ' + s);
});

test('PDF metni sayfa sayfa çıkarılır', async () => {
  const r = await O.pdfText(new Uint8Array(ornek('belge.pdf')));
  assert.equal(r.pages, 2);
  assert.match(r.text, /^Proje Atlas raporu: Selin Aksoy \(T\.C\. 10000000146\)\nToplam 412\.000 TL/);
});
