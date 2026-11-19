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

// G3 · Dosya boyutu ve bellek: zip içeriği açılmadan ölçülür, PDF'te sayfa sınırı sayfalar dolaşılmadan uygulanır.
test('dosya sınırları: zip açılmadan ölçülür, sınırı aşan dosya kodlu hatayla reddedilir', async () => {
  const docx = new Uint8Array(ornek('rapor.docx'));
  const z = S.zipInflated(docx);
  assert.ok(z.entries > 3 && z.total > docx.length, 'açılmış boyut ve parça sayısı okunur');
  assert.equal(S.zipInflated(new TextEncoder().encode('düz metin')), null, 'zip olmayan dosya');
  const small = { ...S.LIMITS, inflated: 1000 };
  assert.throws(() => S.checkZip(docx, small), e => e.code === 'too_big_inflated' && e.total === z.total);
  // Gerçek bir "zip bombası": 300 MB sıfır ~300 KB'a sıkışır; sınır parçaları açmadan yakalar.
  const bomb = new JSZip(); bomb.file('[Content_Types].xml', '<Types/>'); bomb.file('xl/worksheets/sheet1.xml', new Uint8Array(300 * 1024 * 1024));
  const bombBytes = await bomb.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  assert.ok(bombBytes.length < 2 * 1024 * 1024);
  assert.throws(() => S.checkZip(bombBytes), e => e.code === 'too_big_inflated');
  await assert.rejects(O.excelRestore(bombBytes, S.newKey()), e => e.code === 'too_big_inflated');
  await assert.rejects(O.docInfo(bombBytes), e => e.code === 'too_big_inflated');
  await assert.rejects(O.pdfText(new Uint8Array(ornek('belge.pdf')), { maxPages: 0 }), e => e.code === 'too_many_pages' && e.pages >= 1);
  assert.equal(S.fileLimit('xlsx'), S.LIMITS.file.sheet);
  assert.equal(S.fileLimit('pptx'), S.LIMITS.file.office);
  assert.equal(S.fileLimit('pdf'), S.LIMITS.file.pdf);
  assert.equal(S.fileLimit('csv'), S.LIMITS.file.text);
});

// G4 · Görseller maskelenmez: kullanıcı kendi dosyasında hangi slayta, paragrafa bakacağını görür.
test('görsel yerleri: PowerPoint slaytı, Word paragrafı ve yanındaki metin, üst bilgi, şablon', async () => {
  const blip = '<a:blip r:embed="rId9"/>';
  const ppt = new JSZip();
  ppt.file('ppt/presentation.xml', '<p:presentation/>');
  ppt.file('ppt/slides/slide1.xml', '<p:sld><a:t>Kapak</a:t></p:sld>');
  ppt.file('ppt/slides/slide2.xml', `<p:sld><a:p><a:r><a:t>Müşteri ekranı</a:t></a:r></a:p><p:pic>${blip}</p:pic><p:pic>${blip}</p:pic></p:sld>`);
  ppt.file('ppt/slides/slide10.xml', `<p:sld><p:pic>${blip}</p:pic></p:sld>`);
  ppt.file('ppt/slideMasters/slideMaster1.xml', `<p:sldMaster>${blip}</p:sldMaster>`);
  const pi = await O.docInfo(await ppt.generateAsync({ type: 'uint8array' }));
  assert.equal(pi.images.total, 4);
  assert.deepEqual(pi.images.places, [{ where: 'slide', n: 2, count: 2, near: 'Müşteri ekranı' }, { where: 'slide', n: 10, count: 1, near: '' }, { where: 'template', count: 1 }]);

  const doc = new JSZip();
  doc.file('word/document.xml', '<w:document><w:body>'
    + '<w:p><w:r><w:t>Giriş</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t>Aşağıda Kuzey Lojistik sipariş ekranı var:</w:t></w:r></w:p>'
    + `<w:p><w:r><w:drawing><wp:inline>${blip}</wp:inline></w:drawing></w:r></w:p>`
    + '<w:p><w:r><w:drawing><c:chart r:id="rId3"/></w:drawing></w:r></w:p>'
    + '</w:body></w:document>');
  doc.file('word/header1.xml', `<w:hdr><w:drawing>${blip}</w:drawing></w:hdr>`);
  const di = await O.docInfo(await doc.generateAsync({ type: 'uint8array' }));
  assert.equal(di.images.total, 2, 'grafik resim sayılmaz');
  assert.equal(di.images.places[0].where, 'para');
  assert.equal(di.images.places[0].n, 3);
  assert.match(di.images.places[0].near, /sipariş ekranı var:$/);
  assert.deepEqual(di.images.places[1], { where: 'header', count: 1 });
  // Maskeleme görseli değiştirmez: aynı yer ve sayı maskeli dosyada da durur.
  const out = await O.docMask(await doc.generateAsync({ type: 'uint8array' }), S.newKey(), { manual: [{ term: 'Kuzey Lojistik', label: 'FIRMA' }] });
  const after = await O.docInfo(out.bytes);
  assert.equal(after.images.total, 2);
  assert.ok(!after.text.includes('Kuzey Lojistik'));
});

// Dış inceleme (G3 devamı): zip dizinindeki boyut beyanına güvenilmez; parçalar açılırken gerçek bayt sayılır.
test('yanlış beyanlı zip: dizin küçük der, açılan veri büyük; açılırken durdurulur', async () => {
  const z = new JSZip(); z.file('[Content_Types].xml', '<Types/>'); z.file('word/document.xml', new Uint8Array(300 * 1024 * 1024));
  const bytes = await z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Yerel başlıklarda ve merkezi dizinde açılmış boyutu 1000 bayt diye yaz.
  for (let o = 0; o + 46 <= bytes.length; o++) {
    const sig = dv.getUint32(o, true);
    if (sig === 0x04034b50 && dv.getUint32(o + 22, true) > 1000) dv.setUint32(o + 22, 1000, true);
    if (sig === 0x02014b50 && dv.getUint32(o + 24, true) > 1000) dv.setUint32(o + 24, 1000, true);
  }
  assert.ok(S.zipInflated(bytes).total < 5000, 'dizin küçük beyan ediyor');
  S.checkZip(bytes); // beyana bakan ön kontrol geçer
  const t0 = Date.now();
  await assert.rejects(O.checkInflate(bytes), e => e.code === 'too_big_inflated' && e.measured && e.total > S.LIMITS.inflated);
  assert.ok(Date.now() - t0 < 20000, 'makul sürede durur');
  await assert.rejects(O.docInfo(bytes), e => e.code === 'too_big_inflated');
  await assert.rejects(O.excelRestore(bytes, S.newKey()), e => e.code === 'too_big_inflated');
  assert.ok(await O.checkInflate(new Uint8Array(ornek('rapor.docx'))), 'normal dosya geçer');
  assert.equal(await O.checkInflate(new TextEncoder().encode('zip değil')), null);
});
