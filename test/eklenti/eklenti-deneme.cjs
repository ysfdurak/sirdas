// Eklentiyi sahte bir Excel'le dener (Playwright gerekir). Önce: npm run serve:8765 ya da python3 -m http.server 8765
// Çalıştırma: node test/eklenti/eklenti-deneme.cjs
const { chromium } = require('playwright'); const fs = require('fs');
const XLSX = require(require('path').join(__dirname, '../../') + 'lib/xlsx.full.min.js');
const SP = process.env.SP || require('os').tmpdir();
const model = buf => { const wb = XLSX.read(buf, { cellNF: true, cellFormula: true }); return wb.SheetNames.map(n => { const ws = wb.Sheets[n], rg = XLSX.utils.decode_range(ws['!ref']); const V = [], F = [], N = []; for (let r = 0; r <= rg.e.r; r++) { V[r] = []; F[r] = []; N[r] = []; for (let c = 0; c <= rg.e.c; c++) { const x = ws[XLSX.utils.encode_cell({ r, c })]; V[r][c] = x ? x.v : ''; F[r][c] = x && x.f ? '=' + x.f : ''; N[r][c] = x && x.z ? x.z : 'General'; } } return { name: n, values: V, formulas: F, formats: N }; }); };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 360, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const file = fs.readFileSync(require('path').join(__dirname, '../../') + 'test/ornek/tablo.xlsx');
  await p.route('https://appsforoffice.microsoft.com/**', r => r.fulfill({ path: require('path').join(__dirname, 'office-mock.js'), contentType: 'text/javascript' }));
  await p.addInitScript(({ sheets, file }) => { window.__MOCK = { sheets, file: new Uint8Array(file) }; }, { sheets: model(file), file: [...file] });
  await p.goto('http://localhost:8765/eklenti/gorev.html'); await p.waitForTimeout(500);
  console.log('title:', await p.textContent('h1'));
  await p.evaluate(() => { window.__sel = { sheet: 'Müşteri ACME', r0: 0, c0: 0, rows: 1048576, cols: 1 }; });
  await p.click('#addSel');
  await p.selectOption('#newAct', 'scale'); await p.evaluate(() => { window.__sel = { sheet: 'Müşteri ACME', r0: 0, c0: 2, rows: 1048576, cols: 1 }; }); await p.click('#addSel');
  await p.click('#showHeads'); await p.waitForTimeout(200);
  console.log('heads:', await p.textContent('#heads'));
  await p.click('#heads label:nth-child(2) input');
  await p.evaluate(() => { window.__sel = { sheet: 'Müşteri ACME', r0: 2, c0: 3, rows: 1, cols: 1 }; }); await p.click('#addSel');
  await p.waitForTimeout(100);
  console.log('rules:', await p.evaluate(() => window.__sirdasEklenti.st.rules.map(r => `${r.kind}:${r.header || r.address}:${r.action}`).join(' | ')));
  await p.click('#mask'); await p.waitForFunction(() => window.__created || /Olmadı|açık kalacak/.test(document.getElementById('maskStatus').textContent + document.getElementById('check').textContent), null, { timeout: 30000 });
  console.log('mask status:', await p.textContent('#maskStatus'), '|', await p.textContent('#check'));
  const created = Buffer.from(await p.evaluate(() => window.__created || ''), 'base64');
  const w = XLSX.read(created, { cellDates: true, cellNF: true, cellStyles: true }); const s0 = w.Sheets[w.SheetNames[0]];
  console.log('copy:', w.SheetNames, JSON.stringify(XLSX.utils.sheet_to_json(s0, { header: 1, raw: false })), 'fill', JSON.stringify(s0.A1.s && s0.A1.s.fgColor));
  // AI'nın döndürdüğü kitap = maskeli kopya; açıp geri aç
  await p.evaluate(sheets => { window.__MOCK.sheets = sheets; }, model(created));
  await p.click('#restoreWb'); await p.waitForTimeout(500);
  console.log('restore:', await p.textContent('#restoreStatus'));
  console.log('model after:', JSON.stringify(await p.evaluate(() => window.__MOCK.sheets.map(s => [s.name, s.values.slice(0, 3)]))));
  await p.fill('#reply', 'En pahalı [OPERASYON_1], sorumlu bilgisi yok.'); await p.dispatchEvent('#reply', 'input');
  console.log('text restore:', await p.textContent('#restored'));
  // şablon ve anahtar
  await p.click('#t_tpl'); await p.fill('#tplName', 'Haftalık'); await p.click('#tplSave'); console.log('tpl:', await p.textContent('#tplStatus'));
  await p.click('#t_key'); await p.fill('#pass', 'parola12345'); await p.click('#keyStore'); await p.waitForTimeout(800); console.log('key:', await p.textContent('#keyStatus'));
  await p.click('#keyReset'); await p.fill('#pass', 'parola12345'); await p.click('#keyLoadLocal'); await p.waitForTimeout(800); console.log('key load:', await p.textContent('#keyStatus'), await p.textContent('#keyCount'));
  console.log('errors', errs);
  await p.screenshot({ path: SP + '/eklenti.png', fullPage: true });
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
