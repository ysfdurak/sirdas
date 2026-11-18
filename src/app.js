/*
 * Sırdaş arayüzü. Maskeleme mantığının tamamı src/core.js'te (Sirdas); burada yalnızca ekran, seçim ve dosya işleri var.
 * Ortam ayarları (SIRDAS_ENV): artifact (claude.ai sayfası mı), xlsxUrl (SheetJS adresi), workerUrl / workerSrc.
 */
(() => {
  'use strict';
  const S = window.Sirdas, O = window.SirdasOfis;
  const ENV = window.SIRDAS_ENV || {};
  const $ = id => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* tarayıcı saklamayı kapatmış olabilir */ } }
  };
  let LANG = /^en/.test(document.documentElement.lang) ? 'en' : 'tr';
  if (ENV.artifact) { const s = store.get('sirdas_dil'); if (s === 'en' || s === 'tr') LANG = s; }

  /* ---------------- Metinler ---------------- */
  const { STR, CATN } = window.SIRDAS_I18N;
  const t = (k, v) => { let s = STR[LANG][k] ?? STR.tr[k] ?? k; if (v) s = s.replace(/\{(\w+)\}/g, (_, n) => v[n] ?? ''); return s; };
  const nf = n => n.toLocaleString(LANG === 'en' ? 'en-GB' : 'tr-TR');
  const catLabel = c => CATN[LANG][c] || c.replace(/_/g, ' ').toLocaleLowerCase(LANG === 'en' ? 'en' : 'tr');
  const ACTIONS = ['tag', 'drop', 'scale', 'bucket', 'date', 'group'];

  function applyStatic() {
    document.documentElement.lang = LANG;
    document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
    document.querySelectorAll('[data-tph]').forEach(el => { el.placeholder = t(el.dataset.tph); });
    document.querySelectorAll('[data-ttl]').forEach(el => { el.title = t(el.dataset.ttl); });
    document.querySelectorAll('[data-tal]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.tal)); });
    $('preview').dataset.empty = t('emptyMasked'); $('restored').dataset.empty = t('emptyRestored');
    const demo = $('demoBar'); demo.textContent = demo.getAttribute('aria-pressed') === 'true' ? t('demoValue') : t('demoToken');
    document.title = t('docTitle');
    renderLang();
  }
  function renderLang() {
    const box = $('langSwitch'); box.textContent = '';
    for (const l of ['tr', 'en']) {
      let el;
      if (ENV.artifact) { el = document.createElement('button'); el.type = 'button'; el.onclick = () => setLang(l); }
      else { el = document.createElement('a'); el.href = (l === 'en' ? '/en/' : '/') + '?lang=' + l; }
      el.textContent = l.toUpperCase(); el.setAttribute('aria-current', l === LANG); el.lang = l;
      box.append(el);
    }
  }
  function setLang(l) {
    if (l === LANG) return;
    LANG = l; store.set('sirdas_dil', l);
    applyStatic();
    if (state.sample) loadSample(); else refresh();
  }

  /* ---------------- Durum ---------------- */
  const newSheetCfg = () => ({ hdr: true, include: true, cols: {}, cells: new Set(), holes: new Set() });
  const state = {
    view: 'table', book: null, idx: 0, sheetCfg: [],
    propagate: true, auto: false, cats: S.DEFAULT_CATS.slice(), hideSheetNames: true, manual: [], ignored: [],
    textAuto: true,
    key: S.newKey(), tres: null, xres: null, sample: true,
    backOff: new Set(), backNum: true, backDate: true, numState: {}, lastReply: '',
    orig: null, doc: null, struct: null, srules: {}, sres: null
  };
  const sheet = () => state.book && state.book.sheets[state.idx];
  const scfg = () => state.sheetCfg[state.idx];
  const cur = () => state.view === 'table' ? state.tres : state.view === 'struct' ? state.sres : state.xres;
  const coreCfg = extra => Object.assign({
    sheets: state.sheetCfg.map(sc => ({ hdr: sc.hdr, include: sc.include, cols: sc.cols, cells: [...sc.cells], holes: [...sc.holes] })),
    propagate: state.propagate, auto: state.auto, cats: state.cats, manual: state.manual, hideSheetNames: state.hideSheetNames, lang: LANG
  }, extra || {});
  /** Henüz kopyalanmamış yeni etiketler de dahil, ekranda geçerli anahtar. */
  function eff() {
    const k = state.key, r = cur() || {};
    const e = { ...k, entries: { ...k.entries, ...(r.added || {}) }, scaled: { headers: k.scaled.headers.slice() }, dated: { headers: k.dated.headers.slice() }, sheetNames: { ...k.sheetNames } };
    const u = r.keyUpdates;
    if (u) { u.scaled.forEach(h => e.scaled.headers.includes(h) || e.scaled.headers.push(h)); u.dated.forEach(h => e.dated.headers.includes(h) || e.dated.headers.push(h)); Object.assign(e.sheetNames, u.sheetNames); }
    return e;
  }
  function commitCurrent(res) { S.commit(state.key, res || cur() || {}); }

  /* ---------------- Hesaplayıcı (Worker) ---------------- */
  const engine = (() => {
    let w = null, seq = 0, loaded = null; const pend = new Map();
    try {
      w = ENV.workerSrc ? new Worker(URL.createObjectURL(new Blob([ENV.workerSrc], { type: 'text/javascript' }))) : new Worker(ENV.workerUrl || 'src/worker.js');
      w.onmessage = e => { const p = pend.get(e.data.id); if (!p) return; pend.delete(e.data.id); e.data.ok ? p.ok(e.data.result) : p.no(new Error(e.data.error)); };
      w.onerror = ev => { if (ev && ev.preventDefault) ev.preventDefault(); w = null; for (const p of pend.values()) p.no(new Error('worker')); pend.clear(); };
    } catch { w = null; }
    const call = msg => new Promise((ok, no) => { const id = ++seq; pend.set(id, { ok, no }); w.postMessage(Object.assign(msg, { id })); });
    return {
      async mask(book, key, cfg) {
        if (w) {
          try { if (loaded !== book) { await call({ type: 'load', book }); loaded = book; } return await call({ type: 'mask', key, cfg }); }
          catch { w = null; }
        }
        return S.maskBook(book, key, cfg);
      }
    };
  })();

  /* ---------------- Dosya kaydetme ve kütüphane ---------------- */
  let dl = null;
  const canSave = () => !ENV.artifact || !!dl;
  async function saveFile(name, data) {
    if (ENV.artifact) return dl.save({ filename: name, data });
    const blob = data instanceof Blob ? data : new Blob([data]);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    return { status: 'saved' };
  }
  async function saveWithStatus(name, data, st) {
    try { await saveFile(name, data); st.textContent = t('saved'); return true; }
    catch (e) { const c = e && e.code; st.textContent = c === 'declined' ? t('dlDeclined') : c === 'rate_limited' ? t('dlBusy') : t('dlNo'); return false; }
  }
  const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('load')); document.head.append(s); });
  const needXlsx = async () => { if (!window.XLSX) await loadScript(ENV.xlsxUrl || '/lib/xlsx.full.min.js'); };
  /** Biçimli Excel, Word ve PowerPoint için ExcelJS ve JSZip; PDF için pdf.js. İlk kullanımda yüklenir. */
  async function needOfis() {
    if (!window.JSZip) await loadScript(ENV.jszipUrl || '/lib/jszip.min.js');
    if (!window.ExcelJS) await loadScript(ENV.exceljsUrl || '/lib/exceljs.min.js');
    O.init({ ExcelJS: window.ExcelJS, JSZip: window.JSZip, pdfjsLib: window.pdfjsLib });
  }
  async function needPdf() {
    if (!window.pdfjsWorker) await loadScript(ENV.pdfWorkerUrl || '/lib/pdf.worker.min.js');
    if (!window.pdfjsLib) await loadScript(ENV.pdfUrl || '/lib/pdf.min.js');
    O.init({ pdfjsLib: window.pdfjsLib });
  }
  const extOf = n => (String(n).toLowerCase().match(/\.([a-z0-9]+)$/) || [, ''])[1];
  async function copyText(text, btn, selectEl) {
    const old = btn.textContent;
    try { await navigator.clipboard.writeText(text); btn.textContent = t('copied'); }
    catch { const r = document.createRange(); r.selectNodeContents(selectEl); const s = getSelection(); s.removeAllRanges(); s.addRange(r); btn.textContent = t('selected'); }
    setTimeout(() => { btn.textContent = old; }, 1600);
  }

  /* ---------------- Hesap ve çizim ---------------- */
  let seq = 0, busyTimer = null;
  async function refresh() {
    const my = ++seq;
    if (state.view === 'table') {
      if (!state.book) { state.tres = null; renderAll(); return; }
      clearTimeout(busyTimer); busyTimer = setTimeout(() => showBusy(true), 150);
      let res;
      try { res = await engine.mask(state.book, state.key, coreCfg({ keepRows: 200 })); }
      finally { clearTimeout(busyTimer); showBusy(false); }
      if (my !== seq) return;
      state.tres = res;
    } else if (state.view === 'struct') {
      state.sres = null;
      if (state.struct) { try { state.sres = S.maskStruct(state.struct.text, state.struct.kind, state.key, { rules: state.srules, propagate: state.propagate, auto: state.auto, cats: state.cats, manual: state.manual, lang: LANG }); } catch { state.sres = null; } }
    } else {
      state.xres = S.maskText($('source').value, state.key, { auto: state.textAuto, cats: state.cats, manual: state.manual, ignored: state.ignored });
    }
    renderAll();
  }
  let laterT; const later = (ms = 120) => { clearTimeout(laterT); laterT = setTimeout(refresh, ms); };
  function showBusy(on) {
    let b = document.querySelector('#gridWrap .busy');
    if (on && !b) { b = document.createElement('div'); b.className = 'busy'; b.textContent = t('busy'); $('gridWrap').append(b); }
    if (!on && b) b.remove();
  }
  function renderAll() {
    if (state.view === 'table') { renderSheets(); renderGrid(); renderColPanel(); }
    else if (state.view === 'struct') renderStruct();
    else renderText();
    renderDocBanner();
    renderStats(); renderSuggest(); renderCheck(); renderLedger(); renderBack();
    $('sampleTag').hidden = !state.sample;
    $('catChips').hidden = !(state.view === 'text' ? state.textAuto : state.auto);
  }
  const isWhole = v => !!(v && v.p && v.p.length === 1 && typeof v.p[0] !== 'string');
  const disp = v => v instanceof Date ? S.fmtLocal(v, LANG) : v == null ? '' : String(v);
  function renderParts(el, parts) {
    for (const p of parts) {
      if (typeof p === 'string') { el.append(p); continue; }
      const s = document.createElement('span');
      if (p.t) { s.className = 'tok'; s.textContent = `[${p.t}]`; }
      else { s.className = 'xval'; s.textContent = disp(p.x); }
      s.title = p.v; el.append(s);
    }
  }

  function renderSheets() {
    const box = $('sheetTabs'), b = state.book;
    box.hidden = !b || b.sheets.length < 2; $('includeWrap').hidden = box.hidden;
    box.textContent = '';
    if (!b) return;
    b.sheets.forEach((sh, i) => {
      const sc = state.sheetCfg[i], btn = document.createElement('button');
      btn.type = 'button'; btn.setAttribute('role', 'tab'); btn.setAttribute('aria-selected', i === state.idx);
      btn.className = sc.include ? '' : 'out'; btn.append(sh.name);
      if (sh.hidden) { const h = document.createElement('span'); h.className = 'hid'; h.textContent = t('hiddenSheet'); btn.append(h); }
      const n = Object.keys(sc.cols).length + sc.cells.size;
      if (n) { const c = document.createElement('span'); c.className = 'n'; c.textContent = n; btn.append(c); }
      btn.onclick = () => { state.idx = i; $('hdrChk').checked = state.sheetCfg[i].hdr; $('includeChk').checked = state.sheetCfg[i].include; renderAll(); };
      box.append(btn);
    });
    $('includeChk').checked = scfg().include; $('hdrChk').checked = scfg().hdr;
  }

  const MAX_ROWS = 200;
  function renderGrid() {
    const wrap = $('gridWrap'), sh = sheet(), act = document.activeElement;
    const focusKey = act && act.dataset && act.dataset.r != null ? [act.dataset.r, act.dataset.c] : null;
    wrap.textContent = '';
    $('clearSel').disabled = !sh;
    if (!sh) {
      const e = document.createElement('div'); e.className = 'empty-grid';
      const h = document.createElement('strong'); h.textContent = t('gridEmptyH');
      const p = document.createElement('span'); p.textContent = t('gridEmptyP');
      e.append(h, p); wrap.append(e); $('gridNote').hidden = true; return;
    }
    const sc = scfg(), so = state.tres && state.tres.sheets.find(s => s.index === state.idx);
    const rows = so ? so.rows : sh.rows.slice(0, MAX_ROWS);
    const drop = new Set(so ? so.dropped : []);
    const tb = document.createElement('table'); tb.className = 'grid';
    const thead = document.createElement('thead'), hr = document.createElement('tr');
    hr.append(document.createElement('th'));
    for (let c = 0; c < sh.w; c++) {
      const th = document.createElement('th'), b = document.createElement('button'), rule = sc.cols[c];
      b.type = 'button'; b.textContent = S.colName(c); b.dataset.col = c;
      b.className = rule ? (rule.action === 'drop' ? 'drop' : 'on') : '';
      b.setAttribute('aria-pressed', !!rule); b.setAttribute('aria-label', t('colAria', { c: S.colName(c) }));
      th.append(b); hr.append(th);
    }
    thead.append(hr); tb.append(thead);
    const body = document.createElement('tbody');
    rows.slice(0, MAX_ROWS).forEach((row, r) => {
      const tr = document.createElement('tr'); if (sc.hdr && r === 0) tr.className = 'headrow';
      const rn = document.createElement('td'); rn.className = 'rn';
      const rb = document.createElement('button'); rb.type = 'button'; rb.textContent = r + 1; rb.dataset.row = r; rb.setAttribute('aria-label', t('rowAria', { r: r + 1 }));
      const src = sh.rows[r];
      if (src.some(Boolean) && row.every((v, c) => !String(src[c]).trim() || drop.has(c) || isWhole(v))) rb.className = 'on';
      rn.append(rb); tr.append(rn);
      row.forEach((v, c) => {
        const td = document.createElement('td'); td.dataset.r = r; td.dataset.c = c; td.tabIndex = 0;
        if (drop.has(c) && !(sc.hdr && r === 0)) { td.className = 'dropcol'; td.textContent = src[c]; }
        else if (v && v.p) renderParts(td, v.p);
        else td.textContent = disp(v);
        td.setAttribute('aria-label', t('cellAria', { a: S.colName(c) + (r + 1), v: src[c] || t('emptyCell') }) + (isWhole(v) ? t('hiddenSuffix') : ''));
        tr.append(td);
      });
      body.append(tr);
    });
    tb.append(body); wrap.append(tb);
    if (focusKey) { const x = wrap.querySelector(`td[data-r="${focusKey[0]}"][data-c="${focusKey[1]}"]`); if (x) x.focus({ preventScroll: true }); }
    const note = $('gridNote'); note.hidden = false;
    note.textContent = (sh.rows.length > MAX_ROWS ? t('gridMore', { n: nf(MAX_ROWS), total: nf(sh.rows.length) }) : '') + t('gridNote');
  }

  /** Sütunun ne kadarı sayı, ne kadarı tarih? Varsayılan işlemi ve uyarıları buna göre seçeriz. */
  function colProfile(sh, sc, c) {
    let n = 0, num = 0, date = 0; const uniq = new Map();
    for (let r = sc.hdr ? 1 : 0; r < sh.rows.length; r++) {
      const v = sh.rows[r][c].trim(); if (!v) continue; n++;
      const raw = sh.raw && sh.raw[r] ? sh.raw[r][c] : undefined;
      if (raw instanceof Date || S.parseDate(v)) date++;
      else if (typeof raw === 'number' || S.parseNumber(v)) num++;
      const k = S.clean(v); if (!uniq.has(k)) uniq.set(k, v);
    }
    return { n, num: n ? num / n : 0, date: n ? date / n : 0, uniq };
  }
  function toggleCol(c) {
    const sc = scfg(), sh = sheet();
    if (sc.cols[c]) delete sc.cols[c];
    else { const p = colProfile(sh, sc, c); sc.cols[c] = { action: p.date >= 0.7 ? 'date' : p.num >= 0.7 ? 'scale' : 'tag', label: '' }; }
    for (const set of [sc.cells, sc.holes]) for (const k of [...set]) { const [r, cc] = k.split(',').map(Number); if (cc === c && !(sc.hdr && r === 0)) set.delete(k); }
    refresh();
  }
  function headerOf(sh, sc, c) { return (sc.hdr && String(sh.rows[0][c] || '').trim()) || t('colOf', { c: S.colName(c) }); }
  function renderColPanel() {
    const box = $('colPanel'), sh = sheet(); box.textContent = '';
    const sc = sh && scfg();
    box.hidden = !sh || !Object.keys(sc.cols).length; if (box.hidden) return;
    Object.keys(sc.cols).map(Number).sort((a, b) => a - b).forEach(c => {
      const rule = sc.cols[c], prof = colProfile(sh, sc, c), name = headerOf(sh, sc, c);
      const row = document.createElement('div'); row.className = 'colrow';
      const b = document.createElement('b'); b.textContent = name;
      const sel = document.createElement('select'); sel.className = 's'; sel.id = `act-${state.idx}-${c}`; sel.setAttribute('aria-label', t('colActAria', { h: name }));
      for (const a of ACTIONS) { const o = document.createElement('option'); o.value = a; o.textContent = t('act_' + a); sel.append(o); }
      sel.value = rule.action; sel.onchange = () => { rule.action = sel.value; if (sel.value === 'group' && !rule.groups) rule.groups = {}; refresh(); };
      const inp = document.createElement('input'); inp.className = 'i mono'; inp.id = `lab-${state.idx}-${c}`; inp.maxLength = 24;
      inp.value = rule.label || (sc.hdr && !sc.cells.has(`0,${c}`) && S.slug(sh.rows[0][c] || '')) || (LANG === 'en' ? 'COL_' : 'SUTUN_') + S.colName(c);
      inp.setAttribute('aria-label', t('colLabelAria', { h: name }));
      inp.onchange = () => { rule.label = S.slug(inp.value); refresh(); };
      inp.disabled = ['scale', 'bucket', 'date'].includes(rule.action) && prof.num + prof.date >= 0.999;
      const meta = document.createElement('span'); meta.className = 'meta'; meta.textContent = t('uniq', { n: nf(prof.uniq.size) });
      const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'b'; rm.textContent = t('remove'); rm.onclick = () => toggleCol(c);
      row.append(b, sel, inp, meta, rm);
      const note = (k, w) => { const n = document.createElement('span'); n.className = 'note' + (w ? ' w' : ''); n.textContent = t(k); row.append(n); };
      if (rule.action === 'tag') { if (prof.num >= 0.7) note('note_tag_num', true); }
      else note('note_' + rule.action);
      if ((rule.action === 'scale' || rule.action === 'bucket') && prof.num < 0.999 && prof.n) note('note_notnum', true);
      if (rule.action === 'date' && prof.date < 0.999 && prof.n) note('note_notnum', true);
      if (rule.action === 'group') row.append(groupEditor(rule, prof, c));
      box.append(row);
    });
  }
  function groupEditor(rule, prof, c) {
    const d = document.createElement('details'); d.className = 'groups'; d.open = !Object.keys(rule.groups || {}).length;
    const sm = document.createElement('summary'); sm.textContent = t('groupsSum', { n: nf(prof.uniq.size) }); d.append(sm);
    const g = document.createElement('div'); g.className = 'grp';
    const list = [...prof.uniq.entries()].slice(0, 300);
    for (const [k, v] of list) {
      const l = document.createElement('label'), sp = document.createElement('span'), i = document.createElement('input');
      sp.textContent = v; i.className = 'i'; i.placeholder = t('groupPh'); i.value = rule.groups[k] || ''; i.id = `grp-${state.idx}-${c}-${S.slug(k) || list.indexOf(k)}`;
      i.onchange = () => { const x = i.value.trim(); if (x) rule.groups[k] = x; else delete rule.groups[k]; refresh(); };
      l.append(sp, i); g.append(l);
    }
    d.append(g);
    if (prof.uniq.size > list.length) { const m = document.createElement('p'); m.className = 'gridnote'; m.textContent = t('groupsMore', { n: list.length }); d.append(m); }
    return d;
  }
  function setCell(sc, r, c, on) {
    const k = `${r},${c}`, sh = sheet();
    if (!String(sh.rows[r][c]).trim()) return;
    if (on) {
      sc.holes.delete(k);
      if (!(sc.cols[c] && !(sc.hdr && r === 0))) sc.cells.add(k);
      const ek = 'V|' + S.clean(sh.rows[r][c]); state.key.excluded = state.key.excluded.filter(x => x !== ek);
    } else { sc.cells.delete(k); sc.holes.add(k); }
  }
  const cellOut = (r, c) => { const so = state.tres && state.tres.sheets.find(s => s.index === state.idx); return so && so.rows[r] ? so.rows[r][c] : null; };
  function applyRange(a, b, on) {
    const sc = scfg();
    for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r++) for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++) setCell(sc, r, c, on);
    refresh();
  }
  function wireGrid() {
    const wrap = $('gridWrap'); let drag = null;
    const pos = el => { const td = el.closest && el.closest('td[data-r]'); return td ? { r: +td.dataset.r, c: +td.dataset.c } : null; };
    const paint = () => {
      wrap.querySelectorAll('td.range').forEach(x => x.classList.remove('range')); if (!drag) return;
      for (let r = Math.min(drag.a.r, drag.b.r); r <= Math.max(drag.a.r, drag.b.r); r++) for (let c = Math.min(drag.a.c, drag.b.c); c <= Math.max(drag.a.c, drag.b.c); c++) { const x = wrap.querySelector(`td[data-r="${r}"][data-c="${c}"]`); if (x) x.classList.add('range'); }
    };
    wrap.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.button) return; const p = pos(e.target); if (p) drag = { a: p, b: p }; });
    wrap.addEventListener('pointerover', e => { if (!drag) return; const p = pos(e.target); if (p && (p.r !== drag.b.r || p.c !== drag.b.c)) { drag.b = p; paint(); } });
    document.addEventListener('pointerup', () => { if (!drag) return; const d = drag; drag = null; paint(); applyRange(d.a, d.b, !isWhole(cellOut(d.a.r, d.a.c))); });
    wrap.addEventListener('click', e => {
      const col = e.target.closest('button[data-col]'), row = e.target.closest('button[data-row]');
      if (col) return toggleCol(+col.dataset.col);
      if (row) { const r = +row.dataset.row, sc = scfg(); const on = !row.classList.contains('on'); sheet().rows[r].forEach((_, c) => setCell(sc, r, c, on)); return refresh(); }
      if (e.pointerType && e.pointerType !== 'mouse') { const p = pos(e.target); if (p) applyRange(p, p, !isWhole(cellOut(p.r, p.c))); }
    });
    wrap.addEventListener('keydown', e => {
      const p = pos(e.target); if (!p) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); applyRange(p, p, !isWhole(cellOut(p.r, p.c))); return; }
      const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key]; if (!d) return;
      const x = wrap.querySelector(`td[data-r="${p.r + d[0]}"][data-c="${p.c + d[1]}"]`); if (x) { e.preventDefault(); x.focus(); }
    });
  }

  function renderText() {
    const box = $('preview'); box.textContent = '';
    if (state.xres) renderParts(box, state.xres.parts);
  }
  function hiddenCount() {
    const r = cur(); if (!r) return 0;
    if (state.view !== 'text') return r.stats.hidden + r.stats.spread + r.stats.auto + r.stats.scaled + r.stats.bucketed + r.stats.dated + r.stats.grouped;
    return r.parts.filter(p => typeof p !== 'string').length;
  }
  function renderStats() {
    const st = $('stats');
    if (state.view === 'table') st.textContent = state.book && state.tres ? t('statsTable', { n: nf(hiddenCount()) }) : '';
    else if (state.view === 'struct') st.textContent = state.sres ? t('statsTable', { n: nf(hiddenCount()) }) : '';
    else st.textContent = $('source').value ? t('statsText', { n: nf(hiddenCount()) }) + (state.xres.suggestions.length ? t('statsSug', { n: state.xres.suggestions.length }) : '') : '';
  }
  function renderSuggest() {
    const box = $('suggestBox'); box.textContent = '';
    const list = state.view === 'text' && state.xres ? state.xres.suggestions : [];
    box.hidden = !list.length; if (box.hidden) return;
    const h = document.createElement('strong'); h.textContent = t('sugHead'); box.append(h);
    for (const s of list) {
      const row = document.createElement('div'); row.className = 'row';
      const c = document.createElement('code'); c.textContent = s.value;
      const w = document.createElement('span'); w.textContent = t('sug_' + s.why);
      const a = document.createElement('button'); a.type = 'button'; a.className = 'b'; a.textContent = t('mask');
      a.onclick = () => { state.manual.push({ term: s.value, label: s.label }); refresh(); };
      const b = document.createElement('button'); b.type = 'button'; b.className = 'b'; b.textContent = t('fine');
      b.onclick = () => { state.ignored.push(S.clean(s.value)); refresh(); };
      row.append(c, w, a, b); box.append(row);
    }
  }

  /* ---------------- Göndermeden kontrol ---------------- */
  function fact(k, v, d) {
    const f = document.createElement('div'); f.className = 'fact';
    const a = document.createElement('span'); a.className = 'k'; a.textContent = k;
    const b = document.createElement('span'); b.className = 'v'; b.textContent = v;
    const c = document.createElement('span'); c.className = 'd'; c.textContent = d;
    f.append(a, b, c); return f;
  }
  function notice(kind, title, list, actions) {
    const n = document.createElement('div'); n.className = 'notice' + (kind ? ' ' + kind : '');
    const s = document.createElement('strong'); s.textContent = title; n.append(s);
    if (list && list.length) { const d = document.createElement('div'); d.textContent = list.join(' · '); n.append(d); }
    if (actions && actions.length) { const row = document.createElement('div'); row.className = 'row'; for (const [label, fn] of actions) { const b = document.createElement('button'); b.type = 'button'; b.className = 'b'; b.textContent = label; b.onclick = fn; row.append(b); } n.append(row); }
    return n;
  }
  function renderCheck() {
    const facts = $('facts'), body = $('checkBody'); facts.textContent = ''; body.textContent = '';
    const r = cur(), copyBtn = $('copyOut'), xl = $('saveXlsx'), sd = $('saveDoc');
    xl.hidden = state.view !== 'table' || !canSave();
    $('keepFmtWrap').hidden = xl.hidden || !(state.orig && /^xlsx|xlsm$/.test(state.orig.ext));
    const docKind = state.view === 'text' && state.doc ? state.doc.kind : state.view === 'struct' && state.struct ? state.struct.kind : null;
    sd.hidden = !docKind || !canSave();
    if (docKind) sd.textContent = t({ docx: 'saveDocx', pptx: 'savePptx', json: 'saveJson', xml: 'saveXml' }[docKind]);
    copyBtn.textContent = state.view === 'table' ? t('copyTable') : t('copyText');
    const none = !r || (state.view === 'table' ? !state.book : state.view === 'struct' ? !state.struct : !$('source').value);
    copyBtn.disabled = none; xl.disabled = none; sd.disabled = none;
    if (none) { body.append(notice('info', t('ck_nothing'))); return; }
    const hidden = hiddenCount();
    if (state.view === 'table') {
      const s = r.stats, sheets = r.sheets.filter(x => x.include).length;
      facts.append(fact(t('f_send'), t('f_sendV', { s: nf(sheets), r: nf(s.rows) }), t('f_sendD', { c: nf(s.cells) })));
      facts.append(fact(t('f_hidden'), nf(hidden), t('f_hiddenD', { a: nf(s.hidden), b: nf(s.spread), c: s.auto ? t('f_auto', { n: nf(s.auto) }) : '' })));
      const nums = s.scaled + s.bucketed;
      facts.append(fact(t('f_numdate'), t('f_numdateV', { n: nf(nums), d: nf(s.dated) }), nums + s.dated + s.grouped ? t('f_numdateD', { s: nf(s.scaled), b: nf(s.bucketed), g: nf(s.grouped) }) : t('f_numdateD0')));
      facts.append(fact(t('f_drop'), nf(s.dropped.length), s.dropped.length ? s.dropped.join(', ') : t('f_dropD0')));
      if (!hidden && !s.dropped.length) { body.append(notice('', t('ck_nothing'))); return; }
      const L = r.leaks;
      if (L.total) {
        const items = L.list.map(l => `${l.value} (${l.where.label ? t('ck_leakLabel', { t: l.where.label }) : l.where.cell ? t('ck_leakAt', { s: l.where.sheet, c: l.where.cell }) : t('ck_leakSheet', { s: l.where.sheet })})`);
        const acts = [];
        if (L.list.some(l => l.where.cell) && !state.propagate) acts.push([t('ck_fixProp'), () => { state.propagate = true; $('propChk').checked = true; refresh(); }]);
        if (L.list.some(l => !l.where.cell && !l.where.label)) acts.push([t('ck_fixSheets'), () => { state.hideSheetNames = true; $('sheetNameChk').checked = true; refresh(); }]);
        body.append(notice('', t('ck_leaks', { n: nf(L.total) }), items, acts));
        if (L.list.some(l => l.where.label)) body.append(notice('', t('ck_labelFix')));
      }
      if (s.sheetsNoMask.length && state.book.sheets.length > 1) body.append(notice('', t('ck_noMask', { s: s.sheetsNoMask.join(', ') })));
      const numTag = [];
      state.book.sheets.forEach((sh, i) => { const sc = state.sheetCfg[i]; for (const c in sc.cols) if (sc.cols[c].action === 'tag' && colProfile(sh, sc, +c).num >= 0.7) numTag.push(headerOf(sh, sc, +c)); });
      if (numTag.length) body.append(notice('info', t('ck_numtag', { h: numTag.join(', ') })));
      if (s.headersOpen.length) body.append(notice('info', t('ck_heads', { h: [...new Set(s.headersOpen)].slice(0, 12).join(', ') })));
      const hid = state.book.sheets.filter((sh, i) => sh.hidden && !state.sheetCfg[i].include).map(sh => sh.name);
      if (hid.length) body.append(notice('info', t('ck_hiddenSheets', { s: hid.join(', ') })));
      if (!L.total) body.prepend(notice('ok', t('ck_ok')));
    } else if (state.view === 'struct') {
      const s = r.stats, nums = s.scaled + s.bucketed;
      facts.append(fact(t('f_hidden'), nf(hidden), t('f_hiddenD', { a: nf(s.hidden), b: nf(s.spread), c: s.auto ? t('f_auto', { n: nf(s.auto) }) : '' })));
      facts.append(fact(t('f_numdate'), t('f_numdateV', { n: nf(nums), d: nf(s.dated) }), nums + s.dated ? t('f_numdateD', { s: nf(s.scaled), b: nf(s.bucketed), g: nf(s.grouped) }) : t('f_numdateD0')));
      facts.append(fact(t('f_fieldsDrop'), nf(s.dropped.length), s.dropped.length ? s.dropped.join(', ') : t('f_dropD0')));
      body.append(hidden || s.dropped.length ? notice('ok', t('ck_ok')) : notice('', t('ck_nothing')));
    } else {
      const uniq = new Set(r.parts.filter(p => typeof p !== 'string').map(p => p.t)).size;
      facts.append(fact(t('f_textHidden'), nf(hidden), t('f_textHiddenD', { n: nf(uniq) })));
      facts.append(fact(t('f_textSug'), nf(r.suggestions.length), t('f_textSugD')));
      if (!hidden) body.append(notice('', t('ck_nothing')));
      else if (r.suggestions.length) body.append(notice('', t('ck_textSug')));
      else body.append(notice('ok', t('ck_ok')));
    }
  }

  /* ---------------- Anahtar defteri ---------------- */
  function renderLedger() {
    const box = $('rows'); box.textContent = '';
    const k = eff(), r = cur() || {}, counts = r.counts || {};
    const all = Object.values(k.entries).sort((a, b) => a.cat.localeCompare(b.cat, 'tr') || a.num - b.num || a.token.length - b.token.length);
    const kf = $('keyFacts'); kf.textContent = '';
    const add = s => { const x = document.createElement('span'); x.textContent = s; kf.append(x); };
    add(t('keyFactsN', { n: nf(all.length) }));
    if (k.scaled.headers.length) add(t('keyFactsScale', { n: k.scaled.headers.length }));
    if (k.dated.headers.length) add(t('keyFactsDate', { n: k.dated.headers.length }));
    if (!k.scaled.headers.length && !k.dated.headers.length) add(t('keyFactsNone'));
    if (!all.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = t('keyEmpty'); box.append(e); return; }
    const ex = new Set(state.key.excluded);
    for (const e of all.slice(0, 300)) {
      const off = ex.has(e.key) || (e.parent && ex.has(e.parent));
      const row = document.createElement('div'); row.className = 'lrow' + (off ? ' off' : '');
      const tc = document.createElement('div'); tc.className = 'tokc'; const s = document.createElement('span'); s.className = 'tok'; s.style.cursor = 'default'; s.textContent = `[${e.token}]`; tc.append(s);
      const v = document.createElement('div'); v.className = 'val'; v.textContent = e.value;
      const c = document.createElement('div'); c.className = 'cat'; c.textContent = catLabel(e.cat);
      const n = document.createElement('div'); n.className = 'n'; n.textContent = counts[e.key] ? t('times', { n: nf(counts[e.key]) }) : '–';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'b'; b.textContent = off ? t('remask') : t('unmask');
      b.setAttribute('aria-label', `${e.value}: ${b.textContent}`); b.disabled = !!(e.parent && ex.has(e.parent));
      b.onclick = () => { state.key.excluded = off ? state.key.excluded.filter(x => x !== e.key) : state.key.excluded.concat(e.key); refresh(); };
      row.append(tc, v, c, n, b); box.append(row);
    }
    if (all.length > 300) { const m = document.createElement('div'); m.className = 'empty'; m.textContent = t('keyMore', { n: 300, t: nf(all.length) }); box.append(m); }
  }

  /* ---------------- Geri açma ---------------- */
  function renderBack() {
    const k = eff();
    const opts = $('backOpts'); opts.textContent = '';
    const chk = (id, label, val, fn) => { const l = document.createElement('label'); l.className = 'check'; const i = document.createElement('input'); i.type = 'checkbox'; i.id = id; i.checked = val; i.onchange = () => fn(i.checked); l.append(i, label); opts.append(l); };
    if (k.scaled.headers.length) chk('backNum', t('backNums'), state.backNum, v => { state.backNum = v; renderRestore(); });
    if (k.dated.headers.length) chk('backDate', t('backDates'), state.backDate, v => { state.backDate = v; renderRestore(); });
    const box = $('backChips'); box.textContent = '';
    const cats = [...new Set(Object.values(k.entries).map(e => e.cat))].sort((a, b) => a.localeCompare(b, 'tr'));
    for (const c of cats) box.append(chip('back-' + c, catLabel(c), !state.backOff.has(c), on => { on ? state.backOff.delete(c) : state.backOff.add(c); renderRestore(); }));
    renderRestore();
  }
  function restoreOpts() { return { off: [...state.backOff], numbers: state.backNum, dates: state.backDate, numState: state.numState, lang: LANG }; }
  function renderRestore() {
    const text = $('reply').value, box = $('restored'), rep = $('report');
    if (text !== state.lastReply) { state.numState = {}; state.lastReply = text; }
    const r = S.restoreText(text, eff(), restoreOpts());
    box.textContent = '';
    for (const p of r.parts) {
      if (typeof p === 'string') { box.append(p); continue; }
      if (p.num) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'numc' + (p.on ? ' on' : ''); b.textContent = p.on ? p.to : p.from;
        b.title = t('numTitle', { a: p.from, b: p.to }); b.setAttribute('aria-pressed', p.on);
        b.onclick = () => { state.numState[p.i] = !p.on; renderRestore(); };
        box.append(b); continue;
      }
      const s = document.createElement('span'); s.className = 'backval';
      if (p.date) { s.textContent = p.to; s.title = t('dateTitle', { a: p.from }); } else { s.textContent = p.v; s.title = p.t; }
      box.append(s);
    }
    rep.textContent = '';
    if (!text) return;
    const c = document.createElement('div'); c.className = 'count';
    c.textContent = t('rep', { n: nf(r.done) }) + (r.dates ? t('repDates', { n: nf(r.dates) }) : '') + (r.nums ? t('repNums', { n: nf(r.nums) }) : '') + (r.held.length ? t('repHeld', { n: r.held.length }) : '');
    rep.append(c);
    if (r.unknown.length) rep.append(notice('', t('repUnknown'), r.unknown.map(x => `[${x}]`)));
    if (r.harmony.length) rep.append(notice('', t('repHarmony'), r.harmony));
  }
  const restoredText = () => S.restoredToText(S.restoreText($('reply').value, eff(), restoreOpts()).parts);
  function chip(id, label, checked, fn) {
    const l = document.createElement('label'); l.className = 'chip';
    const i = document.createElement('input'); i.type = 'checkbox'; i.id = id; i.checked = checked; i.onchange = () => fn(i.checked);
    l.append(i, label); return l;
  }

  /* ---------------- Dosyalar ---------------- */
  function setBook(sheets, statusText, orig) {
    state.sample = false; $('replyTag').hidden = true; state.orig = orig || null;
    state.book = { sheets }; state.idx = 0;
    state.sheetCfg = sheets.map(sh => Object.assign(newSheetCfg(), { include: !sh.hidden }));
    if (state.auto) sheets.forEach((sh, i) => autoCols(sh, state.sheetCfg[i]));
    $('fileStatus').textContent = statusText || '';
    if (state.view !== 'table') setView('table', true);
    suggestTemplate();
    refresh();
  }
  function autoCols(sh, sc) {
    if (!sc.hdr) return;
    const s = S.suggestColumns(sh.rows[0], state.cats);
    for (const c in s) if (!sc.cols[c]) sc.cols[c] = { action: 'tag', label: s[c] };
  }
  async function readFile(file) {
    const name = file.name, ext = extOf(name), st = $('fileStatus');
    st.textContent = t('reading', { f: name });
    try {
      if (['xlsx', 'xlsm', 'xls', 'ods'].includes(ext)) {
        await needXlsx();
        const bytes = new Uint8Array(await file.arrayBuffer());
        const wb = XLSX.read(bytes, { type: 'array', cellDates: true });
        const list = O.bookFromSheetJS(XLSX, wb, LANG).sheets;
        if (!list.length) throw new Error('empty');
        closeDoc(true);
        setBook(list, t('readOk', { f: name, s: list.length, r: nf(list.reduce((a, s) => a + s.rows.length, 0)) }), { bytes, ext });
      } else if (['csv', 'tsv'].includes(ext)) {
        const rows = S.parseTable(await file.text()); if (!rows) throw new Error('empty');
        closeDoc(true);
        setBook([S.makeSheet(name, rows)], t('readOk', { f: name, s: 1, r: nf(rows.length) }));
      } else if (['docx', 'pptx'].includes(ext)) {
        st.textContent = t('loadingLib'); await needOfis();
        const bytes = new Uint8Array(await file.arrayBuffer());
        const info = await O.docInfo(bytes);
        state.sample = false; state.doc = { bytes, kind: info.kind, name };
        $('source').value = info.text; $('source').readOnly = true; st.textContent = '';
        setView('text', true); refresh();
      } else if (ext === 'pdf') {
        st.textContent = t('loadingLib'); await needPdf();
        const r = await O.pdfText(new Uint8Array(await file.arrayBuffer()));
        closeDoc(true); state.sample = false;
        $('source').value = r.text; st.textContent = r.empty ? t('pdfEmpty', { f: name }) : t('pdfLoaded', { f: name, n: r.pages });
        setView('text', true); refresh();
      } else if (['json', 'xml', 'geojson'].includes(ext)) {
        setStruct(await file.text(), name);
      } else {
        const text = await file.text();
        closeDoc(true); state.sample = false; $('source').value = text; st.textContent = '';
        setView('text', true); refresh();
      }
    } catch (e) { st.textContent = /missing_lib|load/.test(e && e.message) ? t('libFail') : t('readFail', { f: name }); }
  }
  function closeDoc(silent) {
    if (!state.doc) return;
    state.doc = null; $('source').readOnly = false;
    if (!silent) { $('source').value = ''; refresh(); }
  }
  function renderDocBanner() {
    const b = $('docBanner'), d = state.doc;
    b.hidden = !(d && state.view === 'text');
    if (!b.hidden) $('docBannerText').textContent = t('docLoaded', { k: t('kind_' + d.kind), f: d.name });
  }

  /* ---------------- JSON ve XML alanları ---------------- */
  function setStruct(text, name) {
    const st = $('fileStatus'); const tt = text.trim();
    const kind = /^[[{]/.test(tt) ? 'json' : /^</.test(tt) ? 'xml' : null;
    let fields = null;
    try { if (kind) fields = S.structFields(tt, kind); } catch { fields = null; }
    if (!fields || !fields.length) { st.textContent = t('structBad'); return false; }
    state.sample = false; state.struct = { text: tt, kind, name: name || (kind === 'json' ? 'veri.json' : 'veri.xml'), fields }; state.srules = {};
    st.textContent = t('structLoaded', { f: state.struct.name, n: fields.length });
    setView('struct', true); refresh(); return true;
  }
  const TOK_RE = /\[[A-Z][A-Z0-9_]*_\d+(?:_(?:ILK|SON))?\]/g;
  function renderTokText(el, text) {
    el.textContent = ''; let last = 0;
    for (const m of text.matchAll(TOK_RE)) { if (m.index > last) el.append(text.slice(last, m.index)); const sp = document.createElement('span'); sp.className = 'tok'; sp.textContent = m[0]; el.append(sp); last = m.index + m[0].length; }
    if (last < text.length) el.append(text.slice(last));
  }
  function renderStruct() {
    const list = $('fieldList'), out = $('structOut'); list.textContent = '';
    out.dataset.empty = t('structOutEmpty'); $('structKind').hidden = !state.struct;
    if (!state.struct) {
      const e = document.createElement('div'); e.className = 'empty-grid';
      const h = document.createElement('strong'); h.textContent = t('structEmptyH'); const p = document.createElement('span'); p.textContent = t('structEmptyP');
      e.append(h, p); list.append(e); out.textContent = ''; return;
    }
    $('structKind').textContent = state.struct.kind.toUpperCase();
    for (const f of state.struct.fields) {
      const rule = state.srules[f.path];
      const row = document.createElement('div'); row.className = 'frow' + (rule ? ' on' : '');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!rule; cb.id = 'fld-' + S.slug(f.path) + '-' + state.struct.fields.indexOf(f); cb.setAttribute('aria-label', t('fieldAria', { p: f.path }));
      cb.onchange = () => { if (cb.checked) state.srules[f.path] = { action: f.type === 'date' ? 'date' : f.type === 'number' ? 'scale' : 'tag', label: '' }; else delete state.srules[f.path]; refresh(); };
      const fp = document.createElement('label'); fp.className = 'fp'; fp.htmlFor = cb.id; fp.textContent = f.path;
      const fm = document.createElement('span'); fm.className = 'fm'; fm.textContent = `${t('fieldTimes', { n: nf(f.count) })} · ${t('type_' + f.type)}`;
      const fs = document.createElement('span'); fs.className = 'fs'; fs.textContent = f.samples.join(' · ');
      row.append(cb, fp, fm, fs);
      if (rule) {
        const fa = document.createElement('div'); fa.className = 'fa';
        const sel = document.createElement('select'); sel.className = 's'; sel.id = cb.id + '-act'; sel.setAttribute('aria-label', t('colActAria', { h: f.path }));
        for (const a of ['tag', 'drop', 'scale', 'bucket', 'date']) { const o = document.createElement('option'); o.value = a; o.textContent = t('act_' + a); sel.append(o); }
        sel.value = rule.action; sel.onchange = () => { rule.action = sel.value; refresh(); };
        const inp = document.createElement('input'); inp.className = 'i mono'; inp.id = cb.id + '-lab'; inp.maxLength = 24; inp.value = rule.label || S.slug(f.name) || 'ALAN';
        inp.setAttribute('aria-label', t('colLabelAria', { h: f.path })); inp.onchange = () => { rule.label = S.slug(inp.value); refresh(); };
        fa.append(sel, inp); row.append(fa);
      }
      list.append(row);
    }
    renderTokText(out, state.sres ? state.sres.masked : state.struct.text);
  }

  async function fullResult() { return engine.mask(state.book, state.key, coreCfg({ keepRows: 0 })); }
  async function doCopy(btn) {
    const st = $('sendStatus'); st.textContent = '';
    if (state.view === 'table') {
      const res = await fullResult(); commitCurrent(res);
      const so = res.sheets.find(s => s.index === state.idx);
      await copyText(S.toTSV(so, LANG), btn, $('gridWrap'));
    } else if (state.view === 'struct') { commitCurrent(); await copyText(state.sres.masked, btn, $('structOut')); }
    else { commitCurrent(); await copyText(state.xres.masked, btn, $('preview')); }
    refresh();
  }
  function reportText(rep) {
    const items = [];
    for (const k of ['formulas', 'notes', 'validations', 'conditional', 'tables', 'images', 'definedNames', 'sheetsRemoved', 'headerFooter', 'embedded']) if (rep[k]) items.push(t('rep_' + k, { n: nf(rep[k]) }));
    for (const k of ['properties', 'authors', 'thumbnail', 'links']) if (rep[k]) items.push(t('rep_' + k));
    return (items.length ? t('fmtReport', { l: items.join(', ') }) : t('fmtNone')) + (rep.media ? t('docMediaNote', { n: nf(rep.media) }) : '');
  }
  async function doSaveXlsx() {
    const st = $('sendStatus');
    if (state.orig && ['xlsx', 'xlsm'].includes(state.orig.ext) && $('keepFmt').checked) {
      try {
        st.textContent = t('loadingLib'); await needOfis();
        const res = await fullResult();
        const out = await O.excelMaskPreserve(state.orig.bytes, state.book, res, { hideSheetNames: state.hideSheetNames });
        if (await saveWithStatus('sirdas-maskeli.xlsx', out.bytes, st)) { commitCurrent(res); st.textContent = t('saved') + ' ' + reportText(out.report); refresh(); }
      } catch { st.textContent = t('libFail'); }
      return;
    }
    try {
      await needXlsx();
      const res = await fullResult();
      const wb = XLSX.utils.book_new();
      const dnf = LANG === 'en' ? 'yyyy-mm-dd' : 'dd\\.mm\\.yyyy';
      for (const so of res.sheets) if (so.include) {
        const ws = XLSX.utils.aoa_to_sheet(S.toAOA(so), { cellDates: true, dateNF: dnf });
        for (const k of Object.keys(ws)) if (k[0] !== '!' && ws[k].t === 'd') ws[k].z = dnf;
        XLSX.utils.book_append_sheet(wb, ws, so.outName.slice(0, 31));
      }
      if (!wb.SheetNames.length) return;
      const ok = await saveWithStatus('sirdas-maskeli.xlsx', new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })), st);
      if (ok) { commitCurrent(res); if (state.orig && !['xlsx', 'xlsm'].includes(state.orig.ext)) st.textContent += ' ' + t('fmtFallback'); refresh(); }
    } catch { st.textContent = t('xlsxFail'); }
  }
  async function doSaveDoc() {
    const st = $('sendStatus'); st.textContent = '';
    try {
      if (state.view === 'struct') {
        const r = state.sres; if (!r) return;
        if (await saveWithStatus('sirdas-maskeli.' + state.struct.kind, r.masked, st)) { commitCurrent(r); refresh(); }
        return;
      }
      const d = state.doc; if (!d) return;
      st.textContent = t('busy'); await needOfis();
      const out = await O.docMask(d.bytes, state.key, { auto: state.textAuto, cats: state.cats, manual: state.manual, lang: LANG });
      if (await saveWithStatus('sirdas-maskeli.' + d.kind, out.bytes, st)) { S.commit(state.key, out.result); st.textContent = t('saved') + ' ' + reportText(out.report); refresh(); }
    } catch { st.textContent = t('libFail'); }
  }
  async function restoreFile(f) {
    const ext = extOf(f.name), st = $('replyStatus');
    const opts = { off: [...state.backOff], numbers: state.backNum, dates: state.backDate, lang: LANG };
    try {
      if (['xlsx', 'xlsm'].includes(ext)) {
        st.textContent = t('loadingLib'); await needOfis();
        const r = await O.excelRestore(new Uint8Array(await f.arrayBuffer()), eff(), opts);
        if (!r.done) { st.textContent = t('replyNone'); return; }
        const pre = t('replyDone', { n: nf(r.done) });
        await saveWithStatus('sirdas-acilmis.' + ext, r.bytes, st);
        st.textContent = pre + st.textContent + (r.unknown.length ? ' ' + t('repUnknown') + ' ' + r.unknown.map(x => `[${x}]`).join(', ') : '');
      } else if (['docx', 'pptx'].includes(ext)) {
        st.textContent = t('loadingLib'); await needOfis();
        const r = await O.docRestore(new Uint8Array(await f.arrayBuffer()), eff(), Object.assign({}, opts, { numbers: false }));
        if (!r.done) { st.textContent = t('replyNone'); return; }
        const pre = t('replyDocDone', { n: nf(r.done) });
        await saveWithStatus('sirdas-acilmis.' + ext, r.bytes, st);
        st.textContent = pre + st.textContent + (r.unknown.length ? ' ' + t('repUnknown') + ' ' + r.unknown.map(x => `[${x}]`).join(', ') : '');
      } else if (['json', 'xml'].includes(ext)) {
        const r = S.restoreStruct(await f.text(), ext, eff(), opts);
        if (!r.done) { st.textContent = t('replyNone'); return; }
        const pre = t('replyDocDone', { n: nf(r.done) });
        await saveWithStatus('sirdas-acilmis.' + ext, r.text, st); st.textContent = pre + st.textContent;
      } else if (['xls', 'ods'].includes(ext)) return restoreXlsx(f);
      else { $('reply').value = await f.text(); $('replyTag').hidden = true; renderRestore(); }
    } catch { st.textContent = t('replyFail'); }
  }
  async function restoreXlsx(f) {
    const st = $('replyStatus');
    try {
      await needXlsx();
      const k = eff(), opts = { off: [...state.backOff], numbers: state.backNum, dates: state.backDate, lang: LANG };
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true, cellNF: true });
      let done = 0; const unknown = new Set();
      for (const n of wb.SheetNames) {
        const ws = wb.Sheets[n]; if (!ws['!ref']) continue;
        const range = XLSX.utils.decode_range(ws['!ref']);
        const head = c => { const h = ws[XLSX.utils.encode_cell({ r: range.s.r, c })]; return h ? String(h.v) : null; };
        for (const addr of Object.keys(ws)) {
          if (addr[0] === '!') continue;
          const cell = ws[addr], pos = XLSX.utils.decode_cell(addr);
          const val = cell.t === 'd' ? cell.v : cell.t === 'n' ? cell.v : cell.t === 's' ? String(cell.v) : null;
          if (val == null) continue;
          const r = S.restoreValue(val, k, opts, pos.r > range.s.r ? head(pos.c) : null);
          (r.unknown || []).forEach(u => unknown.add(u));
          if (r.changed) {
            cell.v = r.value; cell.t = r.value instanceof Date ? 'd' : typeof r.value === 'number' ? 'n' : 's';
            delete cell.w; delete cell.h; delete cell.r; done++;
          }
        }
      }
      wb.SheetNames = wb.SheetNames.map(n => { const real = k.sheetNames[n]; if (real && !wb.Sheets[real]) { wb.Sheets[real] = wb.Sheets[n]; delete wb.Sheets[n]; return real; } return n; });
      if (!done) { st.textContent = t('replyNone'); return; }
      const pre = t('replyDone', { n: nf(done) });
      await saveWithStatus('sirdas-acilmis.xlsx', new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true })), st);
      st.textContent = pre + st.textContent + (unknown.size ? ' ' + t('repUnknown') + ' ' + [...unknown].map(x => `[${x}]`).join(', ') : '');
    } catch { st.textContent = t('replyFail'); }
  }

  /* ---------------- Şablonlar ---------------- */
  const TPL_KEY = 'sirdas_sablonlar';
  let tplMem = null;
  function tpls() { if (tplMem) return tplMem; try { tplMem = JSON.parse(store.get(TPL_KEY) || '[]').filter(S.validProfile); } catch { tplMem = []; } return tplMem; }
  function saveTpls(list) { tplMem = list; store.set(TPL_KEY, JSON.stringify(list)); }
  function renderTplSel(selectName) {
    const sel = $('tplSel'), list = tpls(); sel.textContent = '';
    const o0 = document.createElement('option'); o0.value = ''; o0.textContent = list.length ? t('tplPick') : t('tplNone'); sel.append(o0);
    list.forEach((p, i) => { const o = document.createElement('option'); o.value = i; o.textContent = `${p.name} (${t('tplCols', { n: p.columns.length })})`; sel.append(o); });
    if (selectName) { const i = list.findIndex(p => p.name === selectName); if (i >= 0) sel.value = i; }
    $('tplApply').disabled = $('tplDelete').disabled = !list.length;
  }
  function applyTemplate(p) {
    const st = $('fileStatus');
    if (!state.book) return;
    const a = S.applyProfile(state.book, p, coreCfg());
    state.sheetCfg = a.cfg.sheets.map(s => ({ hdr: s.hdr, include: s.include, cols: s.cols, cells: new Set(s.cells), holes: new Set(s.holes) }));
    state.propagate = a.cfg.propagate; state.auto = a.cfg.auto; state.cats = a.cfg.cats; state.hideSheetNames = a.cfg.hideSheetNames; state.manual = a.cfg.manual;
    syncOpts(); renderCats();
    st.textContent = t('tplApplied', { n: p.name, m: a.matched.length }) + (a.missing.length ? t('tplMissing', { h: a.missing.join(', ') }) : '');
    $('tplSuggest').hidden = true;
    state.sample = false;
    refresh();
  }
  function suggestTemplate() {
    const box = $('tplSuggest'); box.hidden = true; box.textContent = '';
    if (!state.book) return;
    let best = null, score = 0;
    for (const p of tpls()) { const s = S.profileScore(state.book, p); if (s > score) { score = s; best = p; } }
    if (!best || score < 0.6) return;
    const m = Math.round(score * best.columns.length);
    box.replaceWith(Object.assign(notice('info', t('tplSuggest', { n: best.name, m, t: best.columns.length }), null, [[t('apply'), () => applyTemplate(best)], [t('close'), () => { $('tplSuggest').hidden = true; }]]), { id: 'tplSuggest' }));
  }

  /* ---------------- Görünüm ve seçenekler ---------------- */
  function setView(v, silent) {
    if (v === state.view) return;
    commitCurrent(); state.view = v;
    for (const [tab, view, name] of [['tabTable', 'viewTable', 'table'], ['tabText', 'viewText', 'text'], ['tabStruct', 'viewStruct', 'struct']]) {
      $(tab).setAttribute('aria-selected', v === name); $(view).hidden = v !== name;
    }
    $('propWrap').hidden = v === 'text'; $('sheetNameWrap').hidden = v !== 'table';
    syncOpts();
    if (!silent) refresh();
  }
  function syncOpts() {
    $('propChk').checked = state.propagate; $('sheetNameChk').checked = state.hideSheetNames;
    $('autoChk').checked = state.view === 'text' ? state.textAuto : state.auto;
  }
  function renderCats() {
    const box = $('catChips'); box.textContent = '';
    for (const [c] of S.CATS) box.append(chip('cat-' + c, catLabel(c), state.cats.includes(c), on => { state.cats = on ? state.cats.concat(c) : state.cats.filter(x => x !== c); refresh(); }));
  }

  /* ---------------- Örnek ---------------- */
  const SAMPLE = {
    tr: [
      ['Operasyon', 'Bölge', 'Sorumlu', 'Başlangıç', 'Maliyet (TL)', 'Durum', 'Not'],
      ['Proje Atlas', 'Marmara', 'Selin Aksoy', '02.03.2026', '412.000', 'Tamamlandı', 'Kuzey Hattı ile aynı ekip çalıştı'],
      ['Kuzey Hattı', 'Ege', 'Kerem Tan', '16.03.2026', '268.500', 'Devam ediyor', 'Malzeme gecikti'],
      ['Mavi Köprü', 'Marmara', 'Selin Aksoy', '30.03.2026', '533.200', 'Riskli', 'Proje Atlas deposu kullanılıyor'],
      ['Kuzey Hattı', 'İç Anadolu', 'Deniz Uçar', '13.04.2026', '187.400', 'Devam ediyor', 'Ek vardiya açıldı'],
      ['Demir Yol', 'Ege', 'Kerem Tan', '27.04.2026', '341.000', 'Planlandı', 'Mavi Köprü bitince başlayacak']
    ],
    en: [
      ['Operation', 'Region', 'Owner', 'Start', 'Cost (USD)', 'Status', 'Note'],
      ['Project Atlas', 'North', 'Sarah Cole', '2026-03-02', '412,000', 'Done', 'Same crew as North Line'],
      ['North Line', 'West', 'Tom Hart', '2026-03-16', '268,500', 'In progress', 'Material delayed'],
      ['Blue Bridge', 'North', 'Sarah Cole', '2026-03-30', '533,200', 'At risk', 'Uses the Project Atlas depot'],
      ['North Line', 'Central', 'Dana Price', '2026-04-13', '187,400', 'In progress', 'Extra shift added'],
      ['Iron Road', 'West', 'Tom Hart', '2026-04-27', '341,000', 'Planned', 'Starts after Blue Bridge']
    ]
  };
  async function loadSample() {
    state.sample = true; state.key = S.newKey(); state.manual = []; state.orig = null; state.doc = null; state.struct = null; state.srules = {};
    if (state.view !== 'table') setView('table', true);
    state.book = { sheets: [S.makeSheet(LANG === 'en' ? 'Projects' : 'Operasyonlar', SAMPLE[LANG])] }; state.idx = 0;
    const sc = newSheetCfg();
    sc.cols = { 0: { action: 'tag', label: '' }, 2: { action: 'tag', label: '' }, 3: { action: 'date', label: '' }, 4: { action: 'scale', label: '' } };
    sc.cells.add('2,6');
    state.sheetCfg = [sc];
    await refresh();
    $('reply').value = sampleReply(); $('replyTag').hidden = false; state.lastReply = '';
    renderRestore();
  }
  function sampleReply() {
    const so = state.tres.sheets[0], rows = so.rows;
    const tok = (r, c) => { const v = rows[r][c]; return v && v.p ? `[${v.p[0].t}]` : ''; };
    const x = (r, c) => { const v = rows[r][c]; return v && v.p ? v.p[0].x : ''; };
    const num = s => S.parseNumber(String(s), LANG);
    const sum = S.formatNumber(num(x(2, 4)).n + num(x(4, 4)).n, 0, num(x(2, 4)).style);
    return LANG === 'en'
      ? `The most expensive item is ${tok(3, 0)} at ${x(3, 4)} USD and it is at risk. Its owner is ${tok(3, 2)}.\n\n${tok(2, 0)} runs in two regions with a total cost of ${sum} USD. ${tok(2, 2)} has work starting on ${x(2, 3)} and ${x(5, 3)}; plan resources for ${tok(5, 0)}.`
      : `En yüksek maliyet ${x(3, 4)} TL ile ${tok(3, 0)} operasyonunda ve durumu riskli. Sorumlusu ${tok(3, 2)}.\n\n${tok(2, 0)} iki bölgede sürüyor, toplam maliyeti ${sum} TL. ${tok(2, 2)}'in işleri ${x(2, 3)} ve ${x(5, 3)} tarihlerinde başlıyor, ${tok(5, 0)} için kaynak planı yapılmalı.`;
  }

  /* ---------------- Bağlantılar ---------------- */
  function wire() {
    wireGrid();
    $('tabTable').onclick = () => setView('table');
    $('tabText').onclick = () => setView('text');
    $('tabStruct').onclick = () => setView('struct');
    $('docClose').onclick = () => closeDoc();
    $('saveDoc').onclick = doSaveDoc;
    $('structFile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) setStruct(await f.text(), f.name); };
    $('structPasteToggle').onclick = () => { const b = $('structPasteBox'); b.hidden = !b.hidden; if (!b.hidden) $('structPasteArea').focus(); };
    $('structPasteCancel').onclick = () => { $('structPasteBox').hidden = true; $('structPasteArea').value = ''; };
    $('structPasteApply').onclick = () => { if (setStruct($('structPasteArea').value)) { $('structPasteBox').hidden = true; $('structPasteArea').value = ''; } };
    $('structClear').onclick = () => { state.srules = {}; refresh(); };
    const sdz = $('viewStruct');
    sdz.addEventListener('dragover', e => { e.preventDefault(); sdz.classList.add('drag'); });
    sdz.addEventListener('dragleave', () => sdz.classList.remove('drag'));
    sdz.addEventListener('drop', e => { e.preventDefault(); sdz.classList.remove('drag'); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); });
    $('file').onchange = e => { if (e.target.files[0]) readFile(e.target.files[0]); e.target.value = ''; };
    for (const dz of [$('viewTable'), $('dropText')]) {
      dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
      dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); });
    }
    $('pasteToggle').onclick = () => { const b = $('pasteBox'); b.hidden = !b.hidden; if (!b.hidden) $('pasteArea').focus(); };
    $('pasteCancel').onclick = () => { $('pasteBox').hidden = true; $('pasteArea').value = ''; };
    $('pasteApply').onclick = () => {
      const rows = S.parseTable($('pasteArea').value);
      if (!rows) { $('fileStatus').textContent = t('pasteFirst'); return; }
      setBook([S.makeSheet(t('pastedName'), rows)]); $('pasteBox').hidden = true; $('pasteArea').value = '';
    };
    document.addEventListener('paste', e => {
      if (state.view !== 'table' || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const x = e.clipboardData && e.clipboardData.getData('text/plain'); if (!x || !x.trim()) return;
      e.preventDefault(); setBook([S.makeSheet(t('pastedName'), S.parseTable(x))]);
    });
    $('hdrChk').onchange = e => { const sc = scfg(); if (sc) { sc.hdr = e.target.checked; refresh(); } };
    $('includeChk').onchange = e => { const sc = scfg(); if (sc) { sc.include = e.target.checked; refresh(); } };
    $('clearSel').onclick = () => { const sc = scfg(); if (sc) { sc.cols = {}; sc.cells.clear(); sc.holes.clear(); refresh(); } };
    $('propChk').onchange = e => { state.propagate = e.target.checked; refresh(); };
    $('sheetNameChk').onchange = e => { state.hideSheetNames = e.target.checked; refresh(); };
    $('autoChk').onchange = e => {
      if (state.view !== 'text') { state.auto = e.target.checked; if (state.auto && state.book && state.view === 'table') state.book.sheets.forEach((sh, i) => autoCols(sh, state.sheetCfg[i])); }
      else state.textAuto = e.target.checked;
      refresh();
    };
    $('source').addEventListener('input', () => { state.sample = false; later(); });
    $('clearSrc').onclick = () => { $('source').value = ''; refresh(); $('source').focus(); };
    $('maskSel').onclick = () => {
      const s = $('source'), v = s.value.slice(s.selectionStart, s.selectionEnd).trim();
      if (!v) { $('stats').textContent = t('selFirst'); return; }
      state.manual.push({ term: v, label: S.slug($('selLabel').value) || t('custom') }); refresh();
    };
    $('nextMsg').onclick = () => { commitCurrent(); $('source').value = ''; refresh(); $('source').focus(); };
    $('copyOut').onclick = e => doCopy(e.currentTarget);
    $('saveXlsx').onclick = doSaveXlsx;

    // şablonlar
    $('tplApply').onclick = () => { const p = tpls()[$('tplSel').value]; if (p) applyTemplate(p); };
    $('tplDelete').onclick = () => { const i = $('tplSel').value; if (i === '') return; const list = tpls().slice(), [p] = list.splice(i, 1); saveTpls(list); renderTplSel(); $('fileStatus').textContent = t('tplDeleted', { n: p.name }); };
    $('tplSave').onclick = () => {
      const st = $('fileStatus'), name = $('tplName').value.trim();
      if (!name) { st.textContent = t('tplNeedName'); $('tplName').focus(); return; }
      if (!state.book || !state.sheetCfg.some(sc => Object.keys(sc.cols).length)) { st.textContent = t('tplNeedSel'); return; }
      if (!state.sheetCfg.some(sc => sc.hdr && Object.keys(sc.cols).length)) { st.textContent = t('tplNeedHdr'); return; }
      const p = S.makeProfile(name, state.book, coreCfg());
      saveTpls(tpls().filter(x => x.name !== name).concat(p)); renderTplSel(name);
      st.textContent = t('tplSaved', { n: name }) + (store.get(TPL_KEY) ? '' : ' ' + t('tplNoStore'));
      $('tplName').value = '';
    };
    $('tplExport').onclick = async () => {
      const st = $('fileStatus'); let p = tpls()[$('tplSel').value];
      if (!p) {
        if (!state.book || !state.sheetCfg.some(sc => Object.keys(sc.cols).length)) { st.textContent = t('tplNeedSel'); return; }
        p = S.makeProfile($('tplName').value.trim() || (LANG === 'en' ? 'Template' : 'Şablon'), state.book, coreCfg());
      }
      await saveWithStatus(`sirdas-sablon-${(S.slug(p.name) || 'SABLON').toLowerCase()}.json`, JSON.stringify(p, null, 2), st);
    };
    $('tplImport').onchange = async e => {
      const f = e.target.files[0], st = $('fileStatus'); e.target.value = ''; if (!f) return;
      try { const p = JSON.parse(await f.text()); if (!S.validProfile(p)) throw 0; saveTpls(tpls().filter(x => x.name !== p.name).concat(p)); renderTplSel(p.name); st.textContent = t('tplImported', { n: p.name }); suggestTemplate(); }
      catch { st.textContent = t('tplBad'); }
    };

    // anahtar
    const b64u = s => btoa(unescape(encodeURIComponent(s))), unb64u = s => decodeURIComponent(escape(atob(s)));
    const today = () => new Date().toISOString().slice(0, 10);
    $('keySave').onclick = async () => {
      const st = $('exportStatus'), pass = $('passOut').value;
      if (pass.length < 8) { st.textContent = t('passShort'); return; }
      commitCurrent();
      const file = await S.encryptKey(state.key, pass);
      if (await saveWithStatus(`sirdas-anahtar-${today()}.json`, JSON.stringify(file), st)) st.textContent = t('keySaved');
      refresh();
    };
    $('keyCopy').onclick = async () => {
      const st = $('exportStatus'), pass = $('passOut').value;
      if (pass.length < 8) { st.textContent = t('passShort'); return; }
      commitCurrent();
      const out = 'SIRDAS1.' + b64u(JSON.stringify(await S.encryptKey(state.key, pass)));
      const ta = $('keyOut'); ta.hidden = false; ta.value = out;
      try { await navigator.clipboard.writeText(out); st.textContent = t('keyCopied'); } catch { ta.select(); st.textContent = t('keySel'); }
      refresh();
    };
    let pendingKey = null;
    $('keyFile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; pendingKey = await f.text(); $('importStatus').textContent = t('keyPicked', { f: f.name }); $('passIn').focus(); };
    $('keyLoad').onclick = async () => {
      const st = $('importStatus');
      try {
        let raw = ($('keyIn').value.trim() || pendingKey || '').trim();
        if (raw.startsWith('SIRDAS1.')) raw = unb64u(raw.slice(8));
        const loaded = await S.decryptKey(JSON.parse(raw), $('passIn').value);
        const n = Object.keys(loaded.entries).length;
        if (!Object.keys(state.key.entries).length) { state.key = loaded; st.textContent = t('keyLoaded', { n: nf(n) }); }
        else { S.mergeKeys(state.key, loaded); st.textContent = t('keyMerged', { n: nf(n) }); }
        $('passIn').value = ''; $('keyIn').value = ''; pendingKey = null; refresh();
      } catch { st.textContent = t('keyBad'); }
    };
    let armed = null; const resetBtn = $('resetAll');
    resetBtn.onclick = () => {
      if (!armed) { resetBtn.textContent = t('resetConfirm'); armed = setTimeout(() => { armed = null; resetBtn.textContent = t('reset'); }, 4000); return; }
      clearTimeout(armed); armed = null; resetBtn.textContent = t('reset');
      Object.assign(state, { key: S.newKey(), manual: [], ignored: [], backOff: new Set(), book: null, sheetCfg: [], sample: false, numState: {}, orig: null, doc: null, struct: null, srules: {}, sres: null });
      $('source').readOnly = false;
      $('source').value = ''; $('reply').value = ''; $('sheetTabs').hidden = true; $('fileStatus').textContent = '';
      refresh();
    };

    // geri açma
    $('reply').addEventListener('input', () => { $('replyTag').hidden = true; clearTimeout(laterT); laterT = setTimeout(renderRestore, 120); });
    $('clearReply').onclick = () => { $('replyTag').hidden = true; $('reply').value = ''; renderRestore(); };
    $('copyRestored').onclick = e => copyText(restoredText(), e.currentTarget, $('restored'));
    $('replyXlsx').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) restoreFile(f); };

    const demo = $('demoBar');
    demo.onclick = () => { const on = demo.getAttribute('aria-pressed') !== 'true'; demo.setAttribute('aria-pressed', on); demo.textContent = on ? t('demoValue') : t('demoToken'); };
  }

  /* ---------------- Başlangıç ---------------- */
  $('ver').textContent = 'v' + S.VERSION;
  applyStatic(); renderCats(); renderTplSel(); syncOpts(); wire();
  $('propWrap').hidden = false;
  loadSample();
  if (ENV.artifact && window.claude && window.claude.use) {
    window.claude.use('downloads').then(d => { dl = d; renderCheck(); $('replyXlsxBtn').hidden = !d; }).catch(() => {});
    $('replyXlsxBtn').hidden = true;
  }
  window.__sirdas = { state, refresh };
})();
