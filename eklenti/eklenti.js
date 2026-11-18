/*
 * Sırdaş Excel eklentisi (görev bölmesi).
 * Maskeleme, sitedeki ve MCP'deki aynı çekirdekle yapılır (src/core.js, src/ofis.js). Bölme yalnızca şunları yapar:
 *  - Excel'deki seçimi kurala çevirir (sütun ya da hücre aralığı)
 *  - açık çalışma kitabının dosyasını alır (Office.context.document.getFileAsync), maskeler ve yeni kitap olarak açar
 *  - yapay zekânın döndürdüğü kitabı yerinde geri çevirir (formüllere dokunmadan)
 */
(() => {
  'use strict';
  const S = window.Sirdas, O = window.SirdasOfis;
  const $ = id => document.getElementById(id);
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } } };
  let LANG = 'tr';

  const STR = {
    tr: {
      title: '<span class="bar">[OPERASYON_1]</span> yapay zekâya gitmesin.', lede: 'Gizlenecek sütun ve hücreleri seç, maskeli kopyayı biçimiyle aç, yanıtı bu çalışma kitabında geri çevir. Veri bilgisayarından çıkmaz.',
      s1: 'Neyi gizleyeceğini seç', s1hint: "Excel'de bir sütunu, aralığı ya da hücreyi seç, sonra ekle. Tüm sütunu seçersen kural sütuna uygulanır.",
      addSel: 'Seçili aralığı ekle', showHeads: 'Başlıklardan seç', hideHeads: 'Başlık listesini kapat', prop: 'Seçtiğim değerler başka hücrede geçerse orada da gizle', sheets: 'Sayfa adlarını gizle', auto: 'Kişisel verileri de otomatik bul',
      tpl: 'Şablon', apply: 'Uygula', save: 'Kaydet', tplName: 'Şablon adı', tplNone: 'Kayıtlı şablon yok', tplPick: 'Şablon seç',
      s2: 'Kontrol et ve maskeli kopyayı aç', mask: 'Maskeli kopya oluştur', maskAnyway: 'Yine de oluştur',
      s3: 'Yanıtı aç', s3hint: "Yapay zekânın döndürdüğü Excel'i aç ve bu düğmeye bas: etiketler, ölçeklenmiş sayılar ve kaydırılmış tarihler yerinde geri çevrilir. Formüllere dokunulmaz.",
      restoreWb: 'Bu çalışma kitabını geri aç', reply: 'ya da metin yanıtını yapıştır', copy: 'Kopyala', copied: 'Kopyalandı',
      key: 'Anahtar', keyhint: 'Bölme kapanınca anahtar silinir. Parolayla bu bilgisayarda sakla ya da metin olarak al; sitedeki Sırdaş ile aynı biçimdir.',
      pass: 'Parola (en az 8 karakter)', keyStore: 'Bu bilgisayarda sakla', keyLoadLocal: 'Saklananı yükle', keyCopy: 'Metin olarak kopyala', keyLoadText: 'Metinden yükle', keyReset: 'Yeni oturum', foot: 'PolyForm Shield 1.0.0 · sirdas.ysfdurak.com',
      act_tag: 'Etiketle', act_drop: 'Çıkar (gönderme)', act_scale: 'Katsayıyla ölçekle', act_bucket: 'Aralığa çevir', act_date: 'Tarihi kaydır', action: 'İşlem',
      noRules: 'Henüz kural yok. Excel’de bir sütun seçip “Seçili aralığı ekle”ye bas.', colRule: '{c} sütunu', cellRule: '{a} aralığı', remove: 'Kaldır', label: 'Etiket',
      needSel: 'Önce Excel’de bir hücre ya da aralık seç.', added: 'Eklendi: {w}.',
      ck_ready: '{n} kural hazır. Maskeli kopya yeni bir çalışma kitabı olarak açılır; bu kitaba dokunulmaz.', ck_none: 'Önce en az bir sütun ya da hücre seç.',
      working: 'Hazırlanıyor…', reading: 'Dosya okunuyor…', done: 'Maskeli kopya açıldı: {h} değer gizlendi, {s} sayı ölçeklendi, {d} tarih kaydırıldı. {r}',
      leaks: 'Gizlediğin değerlerden {n} tanesi kopyada açık kalacak: {l}', fixProp: 'Başka hücrelerde de gizle', hiddenSheets: 'Gizli sayfalar kopyaya alınmadı: {s}.',
      noCreate: 'Bu Excel sürümü yeni kitap açamıyor. Maskeli sayfa panoya kopyalandı; yeni bir kitaba yapıştırabilirsin.', fail: 'Olmadı: {e}',
      restored: '{n} hücre geri açıldı.', restoredNone: 'Bu kitapta anahtarla eşleşen etiket, sayı ya da tarih bulunamadı.', unknown: ' Anahtarda olmayan etiketler: {u}.',
      passShort: 'Parola en az 8 karakter olmalı.', keyStored: 'Saklandı. Aynı parolayla yükleyebilirsin.', keyLoaded: '{n} anahtar yüklendi.', keyBad: 'Açılamadı. Parolayı ve metni kontrol et.', keyNone: 'Bu bilgisayarda saklanan anahtar yok.', keyCopied: 'Kopyalandı. Parolayı ayrı bir yerde tut.', keyResetDone: 'Yeni oturum başladı.',
      tplApplied: '“{n}” uygulandı: {m} sütun eşleşti.', tplSaved: '“{n}” kaydedildi.', tplNeedName: 'Şablona bir ad ver.', tplNeedCols: 'Şablon yalnızca sütun kurallarını saklar; önce bir sütun ekle.',
      fmt_formulas: '{n} formül değere çevrildi', fmt_notes: '{n} not', fmt_validations: '{n} açılır liste', fmt_conditional: '{n} koşullu biçim kuralı', fmt_tables: '{n} tablo tanımı', fmt_images: '{n} görsel', fmt_sheetsRemoved: '{n} sayfa', fmt_cleaned: 'Temizlenenler: {l}.'
    },
    en: {
      title: '<span class="bar">[OPERATION_1]</span> never reaches the AI.', lede: 'Pick the columns and cells to hide, open a masked copy with its formatting, and unmask the answer in this workbook. Data stays on your computer.',
      s1: 'Choose what to hide', s1hint: 'Select a column, range or cell in Excel, then add it. If you select a whole column the rule applies to the column.',
      addSel: 'Add selected range', showHeads: 'Pick from headers', hideHeads: 'Close header list', prop: 'If a value I hid appears in other cells, hide it there too', sheets: 'Hide sheet names', auto: 'Also find personal data automatically',
      tpl: 'Template', apply: 'Apply', save: 'Save', tplName: 'Template name', tplNone: 'No saved templates', tplPick: 'Choose a template',
      s2: 'Check and open the masked copy', mask: 'Create masked copy', maskAnyway: 'Create anyway',
      s3: 'Unmask the answer', s3hint: 'Open the workbook the AI returned and press this button: labels, scaled numbers and shifted dates are converted back in place. Formulas are left alone.',
      restoreWb: 'Unmask this workbook', reply: 'or paste a text answer', copy: 'Copy', copied: 'Copied',
      key: 'Key', keyhint: 'The key is cleared when the pane closes. Keep it on this computer with a password, or take it as text; it uses the same format as Sırdaş on the web.',
      pass: 'Password (at least 8 characters)', keyStore: 'Keep on this computer', keyLoadLocal: 'Load saved key', keyCopy: 'Copy as text', keyLoadText: 'Load from text', keyReset: 'New session', foot: 'PolyForm Shield 1.0.0 · sirdas.ysfdurak.com',
      act_tag: 'Tag', act_drop: 'Remove (don’t send)', act_scale: 'Scale by factor', act_bucket: 'Convert to range', act_date: 'Shift dates', action: 'Action',
      noRules: 'No rules yet. Select a column in Excel and press “Add selected range”.', colRule: 'Column {c}', cellRule: 'Range {a}', remove: 'Remove', label: 'Label',
      needSel: 'Select a cell or range in Excel first.', added: 'Added: {w}.',
      ck_ready: '{n} rules ready. The masked copy opens as a new workbook; this one is not changed.', ck_none: 'Pick at least one column or cell first.',
      working: 'Working…', reading: 'Reading the file…', done: 'Masked copy opened: {h} values hidden, {s} numbers scaled, {d} dates shifted. {r}',
      leaks: '{n} of the values you hid would stay visible in the copy: {l}', fixProp: 'Hide in other cells too', hiddenSheets: 'Hidden sheets were left out of the copy: {s}.',
      noCreate: 'This version of Excel cannot open a new workbook. The masked sheet was copied to the clipboard; paste it into a new workbook.', fail: 'That did not work: {e}',
      restored: '{n} cells unmasked.', restoredNone: 'No label, number or date in this workbook matched the key.', unknown: ' Labels not in the key: {u}.',
      passShort: 'The password must be at least 8 characters.', keyStored: 'Saved. Load it with the same password.', keyLoaded: '{n} keys loaded.', keyBad: 'Could not open it. Check the password and the text.', keyNone: 'No key is saved on this computer.', keyCopied: 'Copied. Keep the password somewhere else.', keyResetDone: 'New session started.',
      tplApplied: '“{n}” applied: {m} columns matched.', tplSaved: '“{n}” saved.', tplNeedName: 'Give the template a name.', tplNeedCols: 'Templates keep column rules only; add a column first.',
      fmt_formulas: '{n} formulas turned into values', fmt_notes: '{n} notes', fmt_validations: '{n} drop-down lists', fmt_conditional: '{n} conditional formatting rules', fmt_tables: '{n} table definitions', fmt_images: '{n} images', fmt_sheetsRemoved: '{n} sheets', fmt_cleaned: 'Removed: {l}.'
    }
  };
  const t = (k, v) => { let s = STR[LANG][k] ?? STR.tr[k] ?? k; if (v) s = s.replace(/\{(\w+)\}/g, (_, n) => v[n] ?? ''); return s; };
  const nf = n => Number(n).toLocaleString(LANG === 'en' ? 'en-GB' : 'tr-TR');
  const ACTS = ['tag', 'drop', 'scale', 'bucket', 'date'];

  /* ---------- durum ---------- */
  const st = { key: S.newKey(), rules: [], heads: null, armed: false };
  // kural: { kind:'col', sheet, col (Excel'de 0'dan sütun), header, action, label } | { kind:'cells', sheet, r0, c0, r1, c1, address, action:'tag' }

  /* ---------- Excel yardımcıları ---------- */
  const colLetter = c => S.colName(c);
  async function selection() {
    return Excel.run(async ctx => {
      const r = ctx.workbook.getSelectedRange(); r.load('address, rowIndex, columnIndex, rowCount, columnCount');
      const ws = r.worksheet; ws.load('name');
      const used = ws.getUsedRangeOrNullObject(true); used.load('rowIndex, rowCount, columnIndex');
      await ctx.sync();
      const head = used.isNullObject ? null : ws.getRangeByIndexes(used.rowIndex, r.columnIndex, 1, Math.min(r.columnCount, 200));
      if (head) { head.load('text'); await ctx.sync(); }
      return { address: r.address, sheet: ws.name, r0: r.rowIndex, c0: r.columnIndex, rows: r.rowCount, cols: r.columnCount, usedTop: used.isNullObject ? 0 : used.rowIndex, usedRows: used.isNullObject ? 0 : used.rowCount, head: head ? head.text[0] : [] };
    });
  }
  /** Tüm sayfaların başlık satırı (kullanılan alanın ilk satırı). */
  async function allHeaders() {
    return Excel.run(async ctx => {
      const sheets = ctx.workbook.worksheets; sheets.load('items/name'); await ctx.sync();
      const out = [];
      for (const ws of sheets.items) { const u = ws.getUsedRangeOrNullObject(true); u.load('rowIndex, columnIndex, columnCount'); out.push({ ws, u }); }
      await ctx.sync();
      const rows = [];
      for (const { ws, u } of out) { if (u.isNullObject) continue; const h = ws.getRangeByIndexes(u.rowIndex, u.columnIndex, 1, u.columnCount); h.load('text'); rows.push({ name: ws.name, c0: u.columnIndex, h }); }
      await ctx.sync();
      return rows.map(x => ({ sheet: x.name, cols: x.h.text[0].map((v, i) => ({ col: x.c0 + i, header: String(v).trim() })).filter(c => c.header) }));
    });
  }
  /** Açık kitabın dosyası, dilimler halinde. */
  function fileBytes() {
    return new Promise((ok, no) => Office.context.document.getFileAsync(Office.FileType.Compressed, { sliceSize: 4194304 }, res => {
      if (res.status !== Office.AsyncResultStatus.Succeeded) return no(res.error);
      const f = res.value, n = f.sliceCount, parts = [];
      const next = i => f.getSliceAsync(i, s => {
        if (s.status !== Office.AsyncResultStatus.Succeeded) { f.closeAsync(); return no(s.error); }
        parts[i] = s.value.data;
        if (i + 1 < n) return next(i + 1);
        f.closeAsync();
        const len = parts.reduce((a, p) => a + p.length, 0), all = new Uint8Array(len); let o = 0;
        for (const p of parts) { all.set(p, o); o += p.length; }
        ok(all);
      });
      next(0);
    }));
  }
  const b64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.append(s); });
  async function needOfis() {
    if (!window.JSZip) await loadScript('/lib/jszip.min.js');
    if (!window.ExcelJS) await loadScript('/lib/exceljs.min.js');
    O.init({ ExcelJS: window.ExcelJS, JSZip: window.JSZip });
  }

  /* ---------- kurallar ---------- */
  function guessAction(values) {
    let n = 0, num = 0;
    for (const v of values) { if (v === '' || v == null) continue; n++; if (typeof v === 'number' || S.parseNumber(String(v), LANG)) num++; }
    return n && num / n >= 0.7 ? 'scale' : 'tag';
  }
  async function addSelection() {
    const sEl = $('maskStatus');
    let sel; try { sel = await selection(); } catch { sEl.textContent = t('needSel'); return; }
    const wholeCol = sel.rows >= 1048576 || (sel.usedRows && sel.r0 <= sel.usedTop && sel.r0 + sel.rows >= sel.usedTop + sel.usedRows);
    if (wholeCol) {
      for (let i = 0; i < sel.cols; i++) {
        const col = sel.c0 + i;
        if (st.rules.some(r => r.kind === 'col' && r.sheet === sel.sheet && r.col === col)) continue;
        st.rules.push({ kind: 'col', sheet: sel.sheet, col, header: String(sel.head[i] || '').trim(), action: $('newAct').value, label: '' });
      }
    } else {
      st.rules.push({ kind: 'cells', sheet: sel.sheet, r0: sel.r0, c0: sel.c0, r1: sel.r0 + sel.rows - 1, c1: sel.c0 + sel.cols - 1, address: sel.address.replace(/^.*!/, ''), action: 'tag' });
    }
    sEl.textContent = t('added', { w: sel.address });
    st.armed = false; render();
  }
  async function toggleHeads() {
    const box = $('heads');
    if (!box.hidden) { box.hidden = true; $('showHeads').textContent = t('showHeads'); return; }
    st.heads = await allHeaders();
    box.textContent = '';
    for (const sh of st.heads) for (const c of sh.cols) {
      const l = document.createElement('label'); l.className = 'check';
      const i = document.createElement('input'); i.type = 'checkbox';
      i.checked = st.rules.some(r => r.kind === 'col' && r.sheet === sh.sheet && r.col === c.col);
      i.onchange = () => {
        if (i.checked) st.rules.push({ kind: 'col', sheet: sh.sheet, col: c.col, header: c.header, action: /tarih|date/i.test(c.header) ? 'date' : 'tag', label: '' });
        else st.rules = st.rules.filter(r => !(r.kind === 'col' && r.sheet === sh.sheet && r.col === c.col));
        st.armed = false; render();
      };
      const sp = document.createElement('span'); sp.textContent = (st.heads.length > 1 ? sh.sheet + ' · ' : '') + c.header + ' (' + colLetter(c.col) + ')';
      l.append(i, sp); box.append(l);
    }
    box.hidden = false; $('showHeads').textContent = t('hideHeads');
  }

  /* ---------- kitap + ayar ---------- */
  /** Dosyayı okur, kuralları Sırdaş ayarına çevirir. */
  function buildCfg(book) {
    const sheets = book.sheets.map(sh => ({ hdr: true, include: !sh.hidden, cols: {}, cells: [], holes: [] }));
    for (const r of st.rules) {
      const si = book.sheets.findIndex(sh => sh.name === r.sheet); if (si < 0) continue;
      const sh = book.sheets[si], sc = sheets[si], c0 = sh.pos ? sh.pos.c0 : 0;
      if (r.kind === 'col') { const c = r.col - c0; if (c >= 0 && c < sh.w) sc.cols[c] = { action: r.action, label: r.label }; }
      else sh.pos.r.forEach((abs, ri) => { if (abs < r.r0 || abs > r.r1) return; for (let c = r.c0; c <= r.c1; c++) { const ci = c - c0; if (ci >= 0 && ci < sh.w) sc.cells.push(`${ri},${ci}`); } });
    }
    return { sheets, propagate: $('optProp').checked, auto: $('optAuto').checked, hideSheetNames: $('optSheets').checked, lang: LANG, manual: [], keepRows: 0 };
  }
  async function doMask() {
    const sEl = $('maskStatus'), box = $('check');
    if (!st.rules.length) { sEl.textContent = t('ck_none'); return; }
    try {
      sEl.textContent = t('reading');
      const bytes = await fileBytes();
      sEl.textContent = t('working');
      const wb = XLSX.read(bytes, { type: 'array', cellDates: true });
      const book = O.bookFromSheetJS(XLSX, wb, LANG);
      const cfg = buildCfg(book);
      const res = S.maskBook(book, st.key, cfg);
      box.textContent = '';
      if (res.leaks.total && !st.armed) {
        const n = notice('', t('leaks', { n: nf(res.leaks.total), l: res.leaks.list.slice(0, 8).map(l => l.value).join(', ') }));
        const row = document.createElement('div'); row.className = 'row';
        if (!cfg.propagate) row.append(btn(t('fixProp'), () => { $('optProp').checked = true; st.armed = false; doMask(); }));
        row.append(btn(t('maskAnyway'), () => { st.armed = true; doMask(); }));
        n.append(row); box.append(n); sEl.textContent = ''; return;
      }
      const hid = book.sheets.filter(s => s.hidden).map(s => s.name);
      if (hid.length) box.append(notice('info', t('hiddenSheets', { s: hid.join(', ') })));
      await needOfis();
      const out = await O.excelMaskPreserve(bytes, book, res, { hideSheetNames: cfg.hideSheetNames });
      S.commit(st.key, res);
      const items = []; for (const k of ['formulas', 'notes', 'validations', 'conditional', 'tables', 'images', 'sheetsRemoved']) if (out.report[k]) items.push(t('fmt_' + k, { n: nf(out.report[k]) }));
      const s = res.stats, msg = t('done', { h: nf(s.hidden + s.spread + s.auto), s: nf(s.scaled), d: nf(s.dated), r: items.length ? t('fmt_cleaned', { l: items.join(', ') }) : '' });
      if (window.Excel && Excel.createWorkbook) { await Excel.createWorkbook(b64(out.bytes)); sEl.textContent = msg; }
      else {
        const so = res.sheets.find(x => x.include); await navigator.clipboard.writeText(S.toTSV(so, LANG)); sEl.textContent = t('noCreate');
      }
      st.armed = false; renderKey();
    } catch (e) { sEl.textContent = t('fail', { e: (e && (e.message || e.code)) || e }); }
  }

  /* ---------- geri açma ---------- */
  const isDateFmt = f => /(^|[^\\"])(d|y)/i.test(String(f || '')) && !/^(General|Genel|0|#)/i.test(String(f || ''));
  async function restoreWorkbook() {
    const sEl = $('restoreStatus'), key = st.key;
    const opts = { numbers: true, dates: true, lang: LANG };
    try {
      const r = await Excel.run(async ctx => {
        const sheets = ctx.workbook.worksheets; sheets.load('items/name'); await ctx.sync();
        const list = sheets.items.map(ws => { const u = ws.getUsedRangeOrNullObject(true); u.load('formulas, values, numberFormat'); return { ws, u }; });
        await ctx.sync();
        let done = 0; const unknown = new Set();
        for (const { ws, u } of list) {
          if (u.isNullObject) continue;
          const F = u.formulas, V = u.values, N = u.numberFormat, heads = V[0].map(x => String(x));
          let changed = false;
          for (let r = 0; r < V.length; r++) for (let c = 0; c < V[r].length; c++) {
            if (typeof F[r][c] === 'string' && F[r][c].startsWith('=')) continue;
            const v = V[r][c], h = r > 0 ? heads[c] : null, hn = h != null ? S.normHeader(h) : null;
            let nv = null;
            if (typeof v === 'number') {
              if (hn && key.dated.headers.includes(hn) && isDateFmt(N[r][c])) nv = v - key.dayShift;
              else if (hn && key.scaled.headers.includes(hn)) nv = S.roundest(v / key.factor, S.decimalsOf(v), key.factor).n;
            } else if (typeof v === 'string' && v) {
              const x = S.restoreValue(v, key, opts, h); (x.unknown || []).forEach(q => unknown.add(q));
              if (x.changed) nv = x.value instanceof Date ? x.value : x.value;
            }
            if (nv !== null && nv !== v) { F[r][c] = nv; done++; changed = true; }
          }
          if (changed) u.formulas = F;
          const real = key.sheetNames[ws.name]; if (real && !list.some(x => x.ws.name === real)) ws.name = real;
        }
        await ctx.sync();
        return { done, unknown: [...unknown] };
      });
      sEl.textContent = r.done ? t('restored', { n: nf(r.done) }) + (r.unknown.length ? t('unknown', { u: r.unknown.map(x => `[${x}]`).join(', ') }) : '') : t('restoredNone');
    } catch (e) { sEl.textContent = t('fail', { e: (e && e.message) || e }); }
  }
  function restoreText() {
    const r = S.restoreText($('reply').value, st.key, { numbers: true, dates: true, lang: LANG });
    $('restored').textContent = S.restoredToText(r.parts);
  }

  /* ---------- şablon ---------- */
  const TPL = 'sirdas_sablonlar';
  const tpls = () => { try { return JSON.parse(store.get(TPL) || '[]').filter(S.validProfile); } catch { return []; } };
  function renderTpl() {
    const sel = $('tplSel'), list = tpls(); sel.textContent = '';
    const o = document.createElement('option'); o.value = ''; o.textContent = list.length ? t('tplPick') : t('tplNone'); sel.append(o);
    list.forEach((p, i) => { const x = document.createElement('option'); x.value = i; x.textContent = p.name; sel.append(x); });
  }
  async function applyTpl() {
    const p = tpls()[$('tplSel').value]; if (!p) return;
    const heads = await allHeaders(); let m = 0;
    for (const sh of heads) for (const c of sh.cols) {
      const rule = p.columns.find(x => S.normHeader(x.header) === S.normHeader(c.header)); if (!rule) continue;
      st.rules = st.rules.filter(r => !(r.kind === 'col' && r.sheet === sh.sheet && r.col === c.col));
      st.rules.push({ kind: 'col', sheet: sh.sheet, col: c.col, header: c.header, action: ACTS.includes(rule.action) ? rule.action : 'tag', label: rule.label || '' }); m++;
    }
    const o = p.options || {};
    if (o.propagate !== undefined) $('optProp').checked = o.propagate;
    if (o.hideSheetNames !== undefined) $('optSheets').checked = o.hideSheetNames;
    if (o.auto !== undefined) $('optAuto').checked = o.auto;
    $('tplStatus').textContent = t('tplApplied', { n: p.name, m }); render();
  }
  function saveTpl() {
    const name = $('tplName').value.trim(), s = $('tplStatus');
    if (!name) { s.textContent = t('tplNeedName'); return; }
    const cols = st.rules.filter(r => r.kind === 'col' && r.header); if (!cols.length) { s.textContent = t('tplNeedCols'); return; }
    const seen = new Set(), columns = [];
    for (const r of cols) { const n = S.normHeader(r.header); if (seen.has(n)) continue; seen.add(n); columns.push({ header: r.header, action: r.action, label: r.label }); }
    const p = { format: 'sirdas-sablon', v: 1, name, created: new Date().toISOString(), options: { propagate: $('optProp').checked, auto: $('optAuto').checked, hideSheetNames: $('optSheets').checked, cats: S.DEFAULT_CATS }, columns, terms: [] };
    store.set(TPL, JSON.stringify(tpls().filter(x => x.name !== name).concat(p)));
    s.textContent = t('tplSaved', { n: name }); $('tplName').value = ''; renderTpl();
  }

  /* ---------- anahtar ---------- */
  const KEY = 'sirdas_eklenti_anahtar';
  const enc = s => btoa(unescape(encodeURIComponent(s))), dec = s => decodeURIComponent(escape(atob(s)));
  async function keyAction(kind) {
    const s = $('keyStatus'), pass = $('pass').value;
    try {
      if (kind === 'reset') { st.key = S.newKey(); s.textContent = t('keyResetDone'); renderKey(); return; }
      if (kind === 'loadText' || kind === 'loadLocal') {
        let raw = kind === 'loadLocal' ? store.get(KEY) : $('keyText').value.trim();
        if (!raw) { s.textContent = t('keyNone'); return; }
        if (raw.startsWith('SIRDAS1.')) raw = dec(raw.slice(8));
        const k = await S.decryptKey(JSON.parse(raw), pass);
        st.key = Object.keys(st.key.entries).length ? S.mergeKeys(st.key, k) : k;
        s.textContent = t('keyLoaded', { n: nf(Object.keys(k.entries).length) }); $('pass').value = ''; renderKey(); return;
      }
      if (pass.length < 8) { s.textContent = t('passShort'); return; }
      const file = JSON.stringify(await S.encryptKey(st.key, pass));
      if (kind === 'store') { store.set(KEY, file); s.textContent = t('keyStored'); }
      else { const txt = 'SIRDAS1.' + enc(file); $('keyText').value = txt; try { await navigator.clipboard.writeText(txt); } catch { $('keyText').select(); } s.textContent = t('keyCopied'); }
    } catch { s.textContent = t('keyBad'); }
  }

  /* ---------- çizim ---------- */
  const btn = (label, fn, cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'b' + (cls ? ' ' + cls : ''); b.textContent = label; b.onclick = fn; return b; };
  function notice(kind, text) { const n = document.createElement('div'); n.className = 'notice' + (kind ? ' ' + kind : ''); const p = document.createElement('div'); p.textContent = text; n.append(p); return n; }
  function actSelect(val, fn) {
    const s = document.createElement('select'); s.className = 's'; s.setAttribute('aria-label', t('action'));
    for (const a of ACTS) { const o = document.createElement('option'); o.value = a; o.textContent = t('act_' + a); s.append(o); }
    s.value = val; s.onchange = () => fn(s.value); return s;
  }
  function render() {
    const box = $('rules'); box.textContent = '';
    if (!st.rules.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = t('noRules'); box.append(e); }
    st.rules.forEach((r, i) => {
      const row = document.createElement('div'); row.className = 'rule';
      const b = document.createElement('b'); b.textContent = r.kind === 'col' ? (r.header || t('colRule', { c: colLetter(r.col) })) : t('cellRule', { a: r.address });
      const rm = btn(t('remove'), () => { st.rules.splice(i, 1); st.armed = false; render(); });
      const w = document.createElement('span'); w.className = 'where'; w.textContent = r.sheet + ' · ' + (r.kind === 'col' ? t('colRule', { c: colLetter(r.col) }) : r.address);
      row.append(b, rm, w);
      if (r.kind === 'col') {
        const ctl = document.createElement('div'); ctl.className = 'ctl';
        ctl.append(actSelect(r.action, v => { r.action = v; st.armed = false; }));
        const inp = document.createElement('input'); inp.className = 'i mono'; inp.placeholder = t('label'); inp.maxLength = 24; inp.value = r.label || (r.header ? S.slug(r.header) : '');
        inp.setAttribute('aria-label', t('label')); inp.onchange = () => { r.label = S.slug(inp.value); }; inp.style.width = '120px';
        ctl.append(inp); row.append(ctl);
      }
      box.append(row);
    });
    const c = $('check'); c.textContent = '';
    c.append(notice(st.rules.length ? 'info' : '', st.rules.length ? t('ck_ready', { n: st.rules.length }) : t('ck_none')));
  }
  function renderKey() { $('keyCount').textContent = nf(Object.keys(st.key.entries).length); }
  function applyStatic() {
    document.documentElement.lang = LANG;
    $('t_title').innerHTML = t('title');
    const map = { t_lede: 'lede', t_s1: 's1', t_s1hint: 's1hint', addSel: 'addSel', showHeads: 'showHeads', t_prop: 'prop', t_sheets: 'sheets', t_auto: 'auto', t_tpl: 'tpl', tplApply: 'apply', tplSave: 'save', t_s2: 's2', mask: 'mask', t_s3: 's3', t_s3hint: 's3hint', restoreWb: 'restoreWb', t_reply: 'reply', copyRestored: 'copy', t_keyhint: 'keyhint', keyStore: 'keyStore', keyLoadLocal: 'keyLoadLocal', keyCopy: 'keyCopy', keyLoadText: 'keyLoadText', keyReset: 'keyReset', t_foot: 'foot' };
    for (const id in map) $(id).textContent = t(map[id]);
    $('t_key').firstChild.textContent = t('key') + ' (';
    $('tplName').placeholder = t('tplName'); $('pass').placeholder = t('pass');
    const na = $('newAct'); na.textContent = ''; for (const a of ACTS) { const o = document.createElement('option'); o.value = a; o.textContent = t('act_' + a); na.append(o); }
    na.setAttribute('aria-label', t('action'));
  }

  function start() {
    try { LANG = /^tr/i.test(Office.context.displayLanguage || '') ? 'tr' : 'en'; } catch { LANG = /^tr/i.test(navigator.language) ? 'tr' : 'en'; }
    $('ver').textContent = 'v' + S.VERSION;
    applyStatic(); renderTpl(); render(); renderKey();
    $('addSel').onclick = addSelection;
    $('showHeads').onclick = () => toggleHeads().catch(e => { $('maskStatus').textContent = t('fail', { e: e.message }); });
    $('mask').onclick = doMask;
    $('restoreWb').onclick = restoreWorkbook;
    $('reply').oninput = restoreText;
    $('copyRestored').onclick = async e => { try { await navigator.clipboard.writeText($('restored').textContent); e.target.textContent = t('copied'); setTimeout(() => { e.target.textContent = t('copy'); }, 1500); } catch { const r = document.createRange(); r.selectNodeContents($('restored')); getSelection().removeAllRanges(); getSelection().addRange(r); } };
    $('tplApply').onclick = () => applyTpl().catch(e => { $('tplStatus').textContent = t('fail', { e: e.message }); });
    $('tplSave').onclick = saveTpl;
    for (const [id, k] of [['keyStore', 'store'], ['keyLoadLocal', 'loadLocal'], ['keyCopy', 'copy'], ['keyLoadText', 'loadText'], ['keyReset', 'reset']]) $(id).onclick = () => keyAction(k);
    for (const id of ['optProp', 'optSheets', 'optAuto']) $(id).onchange = () => { st.armed = false; };
  }
  window.__sirdasEklenti = { st };
  if (window.Office && Office.onReady) Office.onReady(() => start()); else start();
})();
