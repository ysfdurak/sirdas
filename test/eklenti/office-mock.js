// Sahte Office.js: Excel nesne modelinin eklentinin kullandığı küçük bir parçası.
(() => {
  const M = window.__MOCK; // { sheets:[{ name, values:[[...]], formulas:[[...]], formats:[[...]] }], file: Uint8Array }
  const sheetOf = n => M.sheets.find(s => s.name === n);
  const used = s => { const R = s.values.length, C = Math.max(0, ...s.values.map(r => r.length)); return { r: 0, c: 0, R, C }; };
  const colL = c => { let n = c + 1, s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; };
  function Range(ws, r, c, R, C) {
    const s = ws._s, get = (A, i, j) => (A[i] && A[i][j] !== undefined) ? A[i][j] : '';
    const sub = A => Array.from({ length: Math.min(R, 2000) }, (_, i) => Array.from({ length: C }, (_, j) => get(A, r + i, c + j)));
    const o = { load() { return o; }, isNullObject: false, worksheet: ws, rowIndex: r, columnIndex: c, rowCount: R, columnCount: C,
      get address() { return `${s.name}!${colL(c)}${r + 1}:${colL(c + C - 1)}${r + R}`; },
      get values() { return sub(s.values); }, get numberFormat() { return sub(s.formats); },
      get text() { return sub(s.values).map(row => row.map(v => String(v))); },
      get formulas() { return sub(s.formulas).map((row, i) => row.map((f, j) => f || get(s.values, r + i, c + j))); },
      set formulas(F) { F.forEach((row, i) => row.forEach((v, j) => { if (typeof v === 'string' && v.startsWith('=')) return; s.values[r + i][c + j] = v; })); } };
    return o;
  }
  function WS(s) { const ws = { _s: s, load() { return ws; }, get name() { return s.name; }, set name(v) { s.name = v; },
    getUsedRangeOrNullObject() { const u = used(s); return Range(ws, u.r, u.c, u.R, u.C); },
    getRangeByIndexes(r, c, R, C) { return Range(ws, r, c, R, C); } }; return ws; }
  window.Excel = {
    run: async fn => fn({ sync: async () => {}, workbook: {
      getSelectedRange() { const x = window.__sel; return Range(WS(sheetOf(x.sheet)), x.r0, x.c0, x.rows, x.cols); },
      worksheets: { load() {}, get items() { return M.sheets.map(WS); } } } }),
    createWorkbook: async b64 => { window.__created = b64; }
  };
  window.Office = {
    onReady: cb => setTimeout(cb, 0), FileType: { Compressed: 'compressed' }, AsyncResultStatus: { Succeeded: 'succeeded' },
    context: { displayLanguage: 'tr-TR', document: { getFileAsync(type, opt, cb) {
      const d = M.file, size = 3000, n = Math.ceil(d.length / size);
      cb({ status: 'succeeded', value: { sliceCount: n, closeAsync() {}, getSliceAsync(i, cb2) { cb2({ status: 'succeeded', value: { data: Array.from(d.subarray(i * size, (i + 1) * size)) } }); } } });
    } } }
  };
})();
