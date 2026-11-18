// Çekirdek testleri: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/core.js');

const book = () => ({ sheets: [S.makeSheet('Operasyonlar', [
  ['Operasyon', 'Bölge', 'Sorumlu', 'Başlangıç', 'Maliyet (TL)', 'Not'],
  ['Proje Atlas', 'Marmara', 'Selin Aksoy', '02.03.2026', '412.000', 'Kuzey Hattı ile aynı ekip'],
  ['Kuzey Hattı', 'Ege', 'Kerem Tan', '16.03.2026', '268.500', 'Malzeme gecikti'],
  ['Proje Atlas', 'Ege', 'Kerem Tan', '30.03.2026', '533.200', 'Atlas deposu']
])] });
const cfg = cols => ({ sheets: [{ hdr: true, cols, cells: [], holes: [] }], propagate: true });
const text = (res, si = 0) => S.toTSV(res.sheets[si]);

test('doğrulayıcılar', () => {
  assert.ok(S.validTCKN('10000000146'));
  assert.ok(!S.validTCKN('12345678901'));
  assert.ok(S.validIBAN('TR330006100519786457841326'));
  assert.ok(S.luhn('4111111111111111'));
  assert.equal(S.slug('Maliyet (TL)'), 'MALIYET_TL');
  assert.equal(S.slug('Başlangıç'), 'BASLANGIC');
  assert.equal(S.colName(27), 'AB');
});

test('sütun etiketleme: aynı değer aynı etiketi alır, başka hücrede geçince de gizlenir', () => {
  const key = S.newKey();
  const r = S.maskBook(book(), key, cfg({ 0: { action: 'tag' } }));
  const t = text(r);
  assert.match(t, /\[OPERASYON_1\]\tMarmara/);
  assert.equal((t.match(/OPERASYON_1/g) || []).length, 2);
  assert.match(t, /\[OPERASYON_2\] ile aynı ekip/);
  assert.ok(!/Proje Atlas|Kuzey Hattı/.test(t));
  assert.equal(r.leaks.total, 0);
});

test('değer yayma kapalıyken açık kalan değer son kontrolde yakalanır', () => {
  const r = S.maskBook(book(), S.newKey(), Object.assign(cfg({ 0: { action: 'tag' } }), { propagate: false }));
  assert.ok(r.leaks.total >= 1);
  assert.equal(r.leaks.list[0].value, 'Kuzey Hattı');
});

test('sütunu çıkarma: çıktıda sütun yok, değerleri başka hücrelerde gizlenir', () => {
  const r = S.maskBook(book(), S.newKey(), cfg({ 2: { action: 'drop' }, 0: { action: 'tag' } }));
  const aoa = S.toAOA(r.sheets[0]);
  assert.equal(aoa[0].length, 5);
  assert.ok(!aoa[0].includes('Sorumlu'));
});

test('katsayıyla ölçekleme oranları korur ve geri çevrilir', () => {
  const key = S.newKey();
  const r = S.maskBook(book(), key, cfg({ 4: { action: 'scale' } }));
  S.commit(key, r);
  const aoa = S.toAOA(r.sheets[0]);
  const a = S.parseNumber(aoa[1][4]).n, b = S.parseNumber(aoa[2][4]).n;
  assert.notEqual(a, 412000);
  assert.ok(Math.abs(a / b - 412000 / 268500) < 0.0001);
  assert.match(aoa[1][4], /^\d{1,3}(\.\d{3})+$/); // Türkçe biçim korunur
  const back = S.restoreText(`Toplam ${aoa[1][4]} oldu, artış %12.`, key, { numbers: true });
  const s = S.restoredToText(back.parts);
  assert.match(s, /Toplam 41[12]\.\d{3} oldu, artış %12\./);
  assert.equal(S.roundest(411999.996, 2, 0.8).n, 412000);
  const cell = S.restoreValue(a, key, { numbers: true }, 'Maliyet (TL)');
  assert.ok(Math.abs(cell.value - 412000) <= 1);
  assert.equal(cell.value, Math.round(cell.value));
});

test('tarih kaydırma tam hafta: haftanın günü korunur, geri kaydırılır', () => {
  const key = S.newKey();
  const r = S.maskBook(book(), key, cfg({ 3: { action: 'date' } }));
  S.commit(key, r);
  const shifted = S.toAOA(r.sheets[0])[1][3];
  assert.notEqual(shifted, '02.03.2026');
  const d0 = S.parseDate('02.03.2026').d, d1 = S.parseDate(shifted).d;
  assert.equal(d0.getUTCDay(), d1.getUTCDay());
  assert.equal(Math.abs(Math.round((d1 - d0) / 864e5) % 7), 0);
  const back = S.restoredToText(S.restoreText(`Başlangıç ${shifted}`, key, { dates: true }).parts);
  assert.equal(back, 'Başlangıç 02.03.2026');
  // Excel tarih hücresi
  const ex = new Date(2026, 2, 2);
  const shiftedCell = S.addDays(ex, key.dayShift, true);
  assert.equal(S.restoreValue(shiftedCell, key, { dates: true }, 'Başlangıç').value.getTime(), ex.getTime());
});

test('aralığa çevirme ve gruplama geri çevrilmez, eşlenmeyen değer etiketlenir', () => {
  const r = S.maskBook(book(), S.newKey(), cfg({ 4: { action: 'bucket' }, 1: { action: 'group', groups: { marmara: 'Kuzey bölgesi' } } }));
  const aoa = S.toAOA(r.sheets[0]);
  assert.match(aoa[1][4], /bin–/);
  assert.equal(aoa[1][1], 'Kuzey bölgesi');
  assert.equal(aoa[2][1], '[BOLGE_1]');
});

test('hücre seçimi, delik ve başlık gizleme etiket adını korur', () => {
  const b = book();
  const c = { sheets: [{ hdr: true, cols: { 2: { action: 'tag' } }, cells: ['0,2', '2,5'], holes: ['1,2'] }], propagate: true };
  const r = S.maskBook(b, S.newKey(), c);
  const aoa = S.toAOA(r.sheets[0]);
  assert.equal(aoa[0][2], '[BASLIK_1]');
  assert.equal(aoa[1][2], 'Selin Aksoy');
  assert.match(aoa[2][2], /^\[SUTUN_C_\d\]$/);
  assert.equal(aoa[2][5], '[NOT_1]');
});

test('çok sayfa ve sayfa adlarını gizleme', () => {
  const b = book(); b.sheets.push(S.makeSheet('Gizli Müşteri X', [['Kod'], ['ALFA-7']]));
  const key = S.newKey();
  const c = { sheets: [{ hdr: true, cols: { 0: { action: 'tag' } } }, { hdr: true, cols: { 0: { action: 'tag' } } }], propagate: true, hideSheetNames: true };
  const r = S.maskBook(b, key, c);
  S.commit(key, r);
  assert.deepEqual(r.sheets.map(s => s.outName), ['Sayfa 1', 'Sayfa 2']);
  assert.equal(key.sheetNames['Sayfa 2'], 'Gizli Müşteri X');
  assert.equal(S.toAOA(r.sheets[1])[1][0], '[KOD_1]');
});

test('seçimsiz sayfa son kontrolde uyarılır', () => {
  const b = book(); b.sheets.push(S.makeSheet('Ham', [['A'], ['x']]));
  const r = S.maskBook(b, S.newKey(), { sheets: [{ hdr: true, cols: { 0: { action: 'tag' } } }, { hdr: true }], propagate: true });
  assert.deepEqual(r.stats.sheetsNoMask, ['Ham']);
});

test('etiket adı gizli değeri ele verirse uyarır', () => {
  const b = { sheets: [S.makeSheet('S', [['Ürün', 'Proje Atlas'], ['Proje Atlas', '5']])] };
  const r = S.maskBook(b, S.newKey(), cfg({ 0: { action: 'tag' }, 1: { action: 'tag' } }));
  assert.ok(r.leaks.list.some(l => l.where.label));
});

test('geri açma: kaçışlı, köşeli parantezsiz ve bilinmeyen etiketler', () => {
  const key = S.newKey();
  const r = S.maskBook(book(), key, cfg({ 0: { action: 'tag' } }));
  S.commit(key, r);
  const x = S.restoreText('a \\[OPERASYON\\_1\\] b OPERASYON_2 c [operasyon_1] d [OPERASYON_9] e [1]', key);
  assert.equal(S.restoredToText(x.parts), 'a Proje Atlas b Kuzey Hattı c Proje Atlas d [OPERASYON_9] e [1]');
  assert.deepEqual(x.unknown, ['OPERASYON_9']);
  const held = S.restoreText('[OPERASYON_1]', key, { off: ['OPERASYON'] });
  assert.equal(S.restoredToText(held.parts), '[OPERASYON_1]');
});

test('metin maskeleme: kişisel veri ve elle eklenen terim, tutarlı numara', () => {
  const key = S.newKey();
  const r = S.maskText('Sayın Ayşe Demir (T.C. 10000000146) GİZLİ Plan için aradı. Demir yarın gelir.', key, { auto: true, manual: [{ term: 'GİZLİ Plan', label: 'PLAN' }] });
  assert.equal(r.masked, 'Sayın [AD_1] (T.C. [TCKN_1]) [PLAN_1] için aradı. [AD_1_SON] yarın gelir.');
  S.commit(key, r);
  const r2 = S.maskText('Yine gizli plan konuşuldu', key, { auto: false });
  assert.equal(r2.masked, 'Yine [PLAN_1] konuşuldu');
});

test('metinde zaten etiket varsa numara çakışmaz', () => {
  const r = S.maskText('Metinde [AD_1] yazıyor, Ahmet Yılmaz da var.', S.newKey(), { auto: true });
  assert.equal(r.masked, 'Metinde [AD_1] yazıyor, [AD_2] da var.');
});

test('şablon: başlığa göre eşleşir, sütun yeri değişse de uygulanır', () => {
  const b = book();
  const p = S.makeProfile('Haftalık', b, cfg({ 0: { action: 'tag', label: 'OP' }, 4: { action: 'scale' } }));
  assert.ok(S.validProfile(p));
  const other = { sheets: [S.makeSheet('x', [['Maliyet (TL)', 'Durum', 'OPERASYON'], ['100.000', 'ok', 'Mavi Köprü']])] };
  assert.equal(S.profileScore(other, p), 1);
  const a = S.applyProfile(other, p);
  assert.deepEqual(a.cfg.sheets[0].cols[2], { action: 'tag', label: 'OP', groups: undefined });
  assert.equal(a.cfg.sheets[0].cols[0].action, 'scale');
  assert.deepEqual(a.missing, []);
  const r = S.maskBook(other, S.newKey(), a.cfg);
  assert.equal(S.toAOA(r.sheets[0])[1][2], '[OP_1]');
});

test('anahtar şifreleme gidiş-dönüş, yanlış parola reddedilir', async () => {
  const key = S.newKey();
  S.commit(key, S.maskBook(book(), key, cfg({ 0: { action: 'tag' } })));
  const file = await S.encryptKey(key, 'parola12345');
  assert.ok(!JSON.stringify(file).includes('Proje Atlas'));
  const back = await S.decryptKey(JSON.parse(JSON.stringify(file)), 'parola12345');
  assert.equal(back.entries['V|proje atlas'].token, 'OPERASYON_1');
  assert.equal(back.factor, key.factor);
  await assert.rejects(() => S.decryptKey(file, 'yanlis-parola'));
  await assert.rejects(() => S.encryptKey(key, 'kisa'));
});

test('sayı ve tarih ayrıştırma', () => {
  assert.equal(S.parseNumber('412.000').n, 412000);
  assert.equal(S.parseNumber('1.234,50').n, 1234.5);
  assert.equal(S.parseNumber('1,234.50').n, 1234.5);
  assert.equal(S.parseNumber('₺ 4.250,00').n, 4250);
  assert.equal(S.parseNumber('abc'), null);
  assert.equal(S.parseNumber('215,767', 'en').n, 215767);
  assert.equal(S.parseNumber('215,767').n, 215.767);
  assert.equal(S.parseNumber('1.234', 'en').n, 1.234);
  assert.equal(S.parseNumber('1,234,567').n, 1234567);
  assert.equal(S.formatNumber(1234.5, 2, S.parseNumber('1.000,00').style), '1.234,50');
  assert.equal(S.parseDate('31.02.2026'), null);
  assert.equal(S.formatDate(S.parseDate('14 Mart 2026').d, S.parseDate('14 Mart 2026').fmt), '14 Mart 2026');
  assert.equal(S.parseDate('2026-03-02').d.getUTCDate(), 2);
});

test('büyük tablo makul sürede biter', () => {
  const rows = [['Operasyon', 'Not', 'Tutar']];
  for (let i = 0; i < 20000; i++) rows.push([`Operasyon ${i % 400} Hat`, `Operasyon ${(i * 7) % 400} Hat ile bağlantılı`, String(i)]);
  const t0 = Date.now();
  const r = S.maskBook({ sheets: [S.makeSheet('b', rows)] }, S.newKey(), cfg({ 0: { action: 'tag' } }));
  const ms = Date.now() - t0;
  assert.equal(r.leaks.total, 0);
  assert.ok(ms < 15000, `süre ${ms} ms`);
  console.log(`    20.000 satır: ${ms} ms`);
});

test('çok parçalı metin: bölünmüş değer tek etikete döner, ilk parçanın biçimini alır', () => {
  const xml = '<w:p><w:r><w:t>Proje </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>Atlas</w:t></w:r><w:r><w:t xml:space="preserve"> &amp; Kuzey</w:t></w:r></w:p>';
  const nodes = S.xmlScan(xml, { textTags: ['w:t'], paraTags: ['w:p'] });
  assert.deepEqual(nodes.map(n => n.value), ['Proje ', 'Atlas', ' & Kuzey']);
  const r = S.maskTexts([nodes.map(n => n.value).join('')], S.newKey(), { manual: [{ term: 'Proje Atlas', label: 'OP' }] });
  const out = S.redistribute(nodes.map(n => n.value), r.parts[0], p => `[${p.t}]`);
  assert.deepEqual(out, ['[OP_1]', '', ' & Kuzey']);
  assert.equal(S.xmlApply(xml, nodes.map((n, i) => ({ start: n.start, end: n.end, text: S.encodeXml(out[i]) }))), xml.replace('Proje </w:t>', '[OP_1]</w:t>').replace('>Atlas<', '><'));
});

test('çok parçalı metin: sonraki paragrafta bulunan ad öncekinde de gizlenir', () => {
  const r = S.maskTexts(['Demir yarın gelir.', 'Sayın Ayşe Demir aradı.'], S.newKey(), { auto: true });
  assert.deepEqual(r.parts.map(S.partsToText), ['[AD_1_SON] yarın gelir.', 'Sayın [AD_1] aradı.']);
});

test('JSON: alan yoluyla maskeleme, yapı korunur, geri açma birebir', () => {
  const j = JSON.stringify({ musteriler: [{ ad: 'Selin Aksoy', tutar: 412000, tarih: '2026-03-02T10:00:00Z', not: 'Selin Aksoy aradı' }, { ad: 'Kerem Tan', tutar: 268500, tarih: '2026-03-16', gizli: 'x' }] }, null, 2);
  assert.deepEqual(S.structFields(j, 'json').map(f => f.path + ':' + f.type), ['musteriler[].ad:text', 'musteriler[].tutar:number', 'musteriler[].tarih:date', 'musteriler[].not:text', 'musteriler[].gizli:text']);
  const key = S.newKey();
  const m = S.maskStruct(j, 'json', key, { rules: { 'musteriler[].ad': { action: 'tag' }, 'musteriler[].tutar': { action: 'scale' }, 'musteriler[].tarih': { action: 'date' }, 'musteriler[].gizli': { action: 'drop' } } });
  const o = JSON.parse(m.masked);
  assert.equal(o.musteriler[0].ad, '[AD_1]'); assert.equal(o.musteriler[0].not, '[AD_1] aradı');
  assert.ok(!('gizli' in o.musteriler[1])); assert.match(o.musteriler[0].tarih, /T10:00:00Z$/);
  S.commit(key, m);
  const back = JSON.parse(S.restoreStruct(m.masked, 'json', key, { numbers: true, dates: true }).text);
  assert.deepEqual(back.musteriler.map(x => [x.ad, x.tutar, x.tarih]), [['Selin Aksoy', 412000, '2026-03-02T10:00:00Z'], ['Kerem Tan', 268500, '2026-03-16']]);
});

test('XML: metin, öznitelik ve CDATA; çıkar kuralı öğeyi siler', () => {
  const xml = '<Liste>\n  <Musteri vkn="1234567890"><Ad>Selin Aksoy</Ad><Not><![CDATA[Selin Aksoy & ekip]]></Not><Gizli>sil</Gizli></Musteri>\n</Liste>';
  const key = S.newKey();
  const m = S.maskStruct(xml, 'xml', key, { rules: { 'Liste/Musteri/Ad': { action: 'tag' }, 'Liste/Musteri/@vkn': { action: 'tag' }, 'Liste/Musteri/Gizli': { action: 'drop' } } });
  assert.equal(m.masked, '<Liste>\n  <Musteri vkn="[VKN_1]"><Ad>[AD_1]</Ad><Not><![CDATA[[AD_1] & ekip]]></Not></Musteri>\n</Liste>');
  S.commit(key, m);
  assert.equal(S.restoreStruct(m.masked, 'xml', key, {}).text, xml.replace('<Gizli>sil</Gizli>', ''));
});

test('ölçeklenen Excel sayısı iki ondalık fazla saklanır, geri açınca tam değer döner', () => {
  const b = { sheets: [S.makeSheet('S', [['Tutar'], ['412000']], [['Tutar'], [412000]])] };
  const key = S.newKey();
  const r = S.maskBook(b, key, cfg({ 0: { action: 'scale' } })); S.commit(key, r);
  const v = S.toAOA(r.sheets[0])[1][0];
  assert.equal(typeof v, 'number');
  assert.equal(S.restoreValue(v, key, { numbers: true }, 'Tutar').value, 412000);
  assert.equal(S.restoredToText(S.restoreText(`toplam ${v}`, key, { numbers: true }).parts), 'toplam 412000');
});
