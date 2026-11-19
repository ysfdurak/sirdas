/*
 * Sırdaş ofis katmanı: Excel, Word ve PowerPoint dosyalarını biçimini koruyarak maskeler ve geri açar; PDF'ten metin çıkarır.
 * Tarayıcıda ve Node'da (MCP) aynı kod çalışır. Kütüphaneler dışarıdan verilir: SirdasOfis.init({ ExcelJS, JSZip, pdfjsLib }).
 *
 * İlke: biçim (renk, yazı tipi, sütun genişliği, sayı biçimi, paragraf düzeni) kalır; değeri sızdırabilecek her şey
 * temizlenir: formüller değere çevrilir, notlar, veri doğrulama listeleri, koşullu biçim kuralları, tablolar, tanımlı adlar,
 * görseller (Excel), belge özellikleri (yazar, şirket), yorum yazarları, küçük resim ve gömülü nesneler.
 */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./core.js') : root.Sirdas);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SirdasOfis = api;
})(typeof self !== 'undefined' ? self : this, function (S) {
  'use strict';
  const lib = {};
  const init = deps => Object.assign(lib, deps);
  const need = n => { if (!lib[n]) throw new Error('missing_lib_' + n); return lib[n]; };

  /* ================= Excel (biçimi koruyarak) ================= */
  /**
   * bytes: özgün .xlsx; book: Sirdas.makeSheet ile okunmuş kitap (pos bilgisiyle); res: maskBook tam sonucu (keepRows 0).
   * Dönüş: { bytes, report }
   */
  /**
   * Notları (yorumları) ExcelJS'e vermeden önce dosyadan söker: hem değer sızdırırlar hem de bazı programların
   * ürettiği not biçimleri ExcelJS'te okunamaz. Dönüş: { bytes, notes }
   */
  async function stripNotes(bytes) {
    S.checkZip(bytes);
    const zip = await need('JSZip').loadAsync(bytes);
    let notes = 0;
    for (const n of Object.keys(zip.files)) {
      if (/^xl\/(comments[^/]*\.xml|comments\/.*|threadedComments\/.*|persons\/.*|drawings\/vmlDrawing[^/]*\.vml)$/.test(n)) {
        if (/comment[^/]*\.xml$/.test(n) && !/threaded/.test(n)) notes += ((await zip.file(n).async('string')).match(/<comment\b/g) || []).length;
        zip.remove(n);
      }
    }
    for (const n of Object.keys(zip.files)) {
      if (/^xl\/worksheets\/_rels\/.*\.rels$/.test(n)) {
        const x = await zip.file(n).async('string');
        zip.file(n, x.replace(/<Relationship\b[^>]*Type="[^"]*\/(comments|vmlDrawing|threadedComment)"[^>]*\/>/g, ''));
      } else if (/^xl\/worksheets\/sheet\d+\.xml$/.test(n)) {
        const x = await zip.file(n).async('string');
        zip.file(n, x.replace(/<legacyDrawing\b[^>]*\/>/g, ''));
      } else if (n === '[Content_Types].xml') {
        const x = await zip.file(n).async('string');
        zip.file(n, x.replace(/<Override\b[^>]*PartName="\/xl\/(comments[^"]*|threadedComments\/[^"]*|persons\/[^"]*)"[^>]*\/>/g, ''));
      }
    }
    return { bytes: await zip.generateAsync({ type: 'uint8array' }), notes };
  }
  async function excelMaskPreserve(bytes, book, res, cfg = {}) {
    const ExcelJS = need('ExcelJS');
    const wb = new ExcelJS.Workbook();
    const pre = await stripNotes(bytes);
    await wb.xlsx.load(pre.bytes);
    const rep = { formulas: 0, notes: pre.notes, images: 0, tables: 0, validations: 0, conditional: 0, links: 0, definedNames: 0, sheetsRemoved: 0, columnsRemoved: 0, headerFooter: 0 };
    const FORMULA = ExcelJS.ValueType.Formula;
    // Önce tüm sayfaları adıyla eşle (ad değiştirme sırasında çakışma olmasın).
    const pairs = res.sheets.map(so => ({ so, sh: book.sheets[so.index], ws: wb.getWorksheet(book.sheets[so.index].name) }));
    for (const ws of wb.worksheets.slice()) if (!pairs.some(p => p.ws === ws)) { wb.removeWorksheet(ws.id); rep.sheetsRemoved++; }
    for (const { so, sh, ws } of pairs) {
      if (!ws) continue;
      if (!so.include) { wb.removeWorksheet(ws.id); rep.sheetsRemoved++; continue; }
      const r0 = r => (sh.pos ? sh.pos.r[r] : r) + 1, c0 = c => (sh.pos ? sh.pos.c0 : 0) + c + 1;
      so.rows.forEach((row, r) => row.forEach((v, c) => {
        const cell = ws.getCell(r0(r), c0(c));
        if (cell.isMerged && cell.master !== cell) return;
        const val = S.cellValue(v);
        const had = cell.value;
        if ((val === '' || val == null) && (had == null || had === '')) return;
        if (cell.type === FORMULA) rep.formulas++;
        if (cell.hyperlink) rep.links++;
        cell.value = val === '' ? null : val;
      }));
      ws.eachRow({ includeEmpty: false }, row => row.eachCell({ includeEmpty: false }, cell => {
        if (cell.type === FORMULA) { cell.value = null; rep.formulas++; }
        if (cell._comment) { cell._comment = undefined; rep.notes++; }
      }));
      for (const n of Object.keys(ws.tables || {})) { ws.removeTable(n); rep.tables++; }
      const dv = ws.dataValidations && ws.dataValidations.model ? Object.keys(ws.dataValidations.model).length : 0;
      if (dv) { rep.validations += dv; ws.dataValidations.model = {}; }
      if (ws.conditionalFormattings && ws.conditionalFormattings.length) { rep.conditional += ws.conditionalFormattings.length; ws.conditionalFormattings = []; }
      if (ws._media && ws._media.length) { rep.images += ws._media.length; ws._media = []; }
      const hf = ws.headerFooter || {};
      for (const k of ['oddHeader', 'oddFooter', 'evenHeader', 'evenFooter', 'firstHeader', 'firstFooter']) if (hf[k]) { hf[k] = null; rep.headerFooter++; }
      for (const c of so.dropped.slice().sort((a, b) => b - a)) { ws.spliceColumns(c0(c), 1); rep.columnsRemoved++; }
    }
    if (cfg.hideSheetNames) {
      let i = 0; const tmp = [];
      for (const { so, ws } of pairs) if (ws && so.include && wb.getWorksheet(ws.id)) { ws.name = '__s' + (i++); tmp.push([ws, so.outName]); }
      for (const [ws, n] of tmp) ws.name = n.slice(0, 31);
    }
    try { rep.definedNames = (wb.definedNames.model || []).length; wb.definedNames.model = []; } catch { /* eski sürüm */ }
    for (const k of ['company', 'manager', 'title', 'subject', 'keywords', 'category', 'description']) wb[k] = '';
    wb.creator = wb.lastModifiedBy = 'Sırdaş';
    const out = await wb.xlsx.writeBuffer();
    return { bytes: new Uint8Array(out), report: rep };
  }

  /** Yapay zekânın döndürdüğü Excel'i biçimini koruyarak geri açar. Başlık satırı: ilk dolu satır. */
  async function excelRestore(bytes, key, opts = {}) {
    const ExcelJS = need('ExcelJS');
    const wb = new ExcelJS.Workbook();
    S.checkZip(bytes);
    try { await wb.xlsx.load(bytes); } catch { await wb.xlsx.load((await stripNotes(bytes)).bytes); }
    let done = 0; const unknown = new Set();
    const FORMULA = ExcelJS.ValueType.Formula;
    const textOf = v => v && typeof v === 'object' && !(v instanceof Date) ? (v.richText ? v.richText.map(x => x.text).join('') : v.text != null ? String(v.text) : null) : v;
    for (const ws of wb.worksheets) {
      let headRow = 0; const heads = {};
      ws.eachRow({ includeEmpty: false }, (row, n) => { if (headRow) return; headRow = n; row.eachCell((c, ci) => { heads[ci] = textOf(c.value); }); });
      ws.eachRow({ includeEmpty: false }, (row, n) => row.eachCell({ includeEmpty: false }, (cell, ci) => {
        if (cell.type === FORMULA || (cell.isMerged && cell.master !== cell)) return;
        const v = textOf(cell.value); if (v == null) return;
        const r = S.restoreValue(v, key, opts, n > headRow ? heads[ci] : null);
        (r.unknown || []).forEach(u => unknown.add(u));
        if (r.changed) { cell.value = r.value; done += r.changed; }
      }));
    }
    const names = new Set(wb.worksheets.map(w => w.name));
    for (const ws of wb.worksheets) { const real = key.sheetNames[ws.name]; if (real && !names.has(real)) { names.delete(ws.name); ws.name = real.slice(0, 31); names.add(ws.name); } }
    return { bytes: new Uint8Array(await wb.xlsx.writeBuffer()), done, unknown: [...unknown] };
  }

  /* ================= Word ve PowerPoint ================= */
  const SKIP = /(^|\/)(styles|stylesWithEffects|theme\d*|fontTable|settings|webSettings|numbering|presProps|viewProps|tableStyles|fonts|glossary\/styles)\.xml$/;
  const TEXT_TAGS = ['w:t', 'w:delText', 'w:instrText', 'a:t', 'c:v'];
  const PARA_TAGS = ['w:p', 'a:p', 'c:pt', 'c:tx'];
  function kindOf(zip) { return zip.file('word/document.xml') ? 'docx' : zip.file('ppt/presentation.xml') ? 'pptx' : null; }
  const num = n => +(n.match(/(\d+)\.xml$/) || [0, 0])[1];
  /** İşlenecek XML parçaları, okuma sırasıyla: belge gövdesi / slaytlar önce. */
  function textParts(zip, kind) {
    const all = Object.keys(zip.files).filter(n => !zip.files[n].dir && n.endsWith('.xml') && !SKIP.test(n));
    const main = kind === 'docx'
      ? ['word/document.xml']
      : all.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => num(a) - num(b));
    const rest = all.filter(n => !main.includes(n) && (n.startsWith(kind === 'docx' ? 'word/' : 'ppt/') || /^customXml\/item\d+\.xml$/.test(n) || n === 'docProps/app.xml'));
    return { main, rest };
  }
  async function loadParts(bytes) {
    const JSZip = need('JSZip');
    S.checkZip(bytes);
    const zip = await JSZip.loadAsync(bytes);
    const kind = kindOf(zip); if (!kind) throw new Error('not_office');
    const { main, rest } = textParts(zip, kind);
    const parts = [];
    for (const name of main.concat(rest)) {
      const xml = await zip.file(name).async('string');
      const generic = /^customXml\//.test(name);
      const opt = name === 'docProps/app.xml' ? { textTags: ['vt:lpstr'] } : generic ? {} : { textTags: TEXT_TAGS, paraTags: PARA_TAGS };
      parts.push({ name, xml, nodes: S.xmlScan(xml, opt), main: main.includes(name) });
    }
    return { zip, kind, parts };
  }
  /** Paragraf grupları: [{ part, nodes }] */
  function groupsOf(parts) {
    const gs = [];
    for (const p of parts) {
      const m = new Map();
      for (const n of p.nodes) { if (n.kind !== 'text') continue; let g = m.get(n.group); if (!g) { g = { part: p, nodes: [] }; m.set(n.group, g); gs.push(g); } g.nodes.push(n); }
    }
    return gs;
  }
  /**
   * Görseller maskelenmez (resimdeki yazı metin değildir). Kullanıcının kendi dosyasında neye bakacağını bilmesi için
   * görsellerin yerini listeler: PowerPoint'te slayt numarası, Word'de paragraf sırası ve yanındaki metin,
   * üst/alt bilgi ve slayt şablonları ayrıca. Hiçbir şey değiştirmez.
   */
  const BLIP = /<a:blip\b[^>]*\br:(?:embed|link)=/g;
  const plain = xml => S.decodeXml(xml.replace(/<w:tab\/>/g, ' ').replace(/<\/(?:w|a):p>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  async function imagesIn(zip, kind) {
    const places = [];
    const count = xml => (xml.match(BLIP) || []).length + (xml.match(/<v:imagedata\b/g) || []).length;
    const files = Object.keys(zip.files).filter(n => n.endsWith('.xml'));
    if (kind === 'pptx') {
      for (const n of files.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => num(a) - num(b))) {
        const x = await zip.file(n).async('string'), c = count(x);
        if (!c) continue;
        // Slaydın ilk metinli paragrafı: arayüz bu metni bulup slaydı gösterir.
        const first = [...x.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)].map(m => plain(m[0])).find(Boolean) || '';
        places.push({ where: 'slide', n: num(n), count: c, near: first.slice(0, 60) });
      }
      let tpl = 0;
      for (const n of files.filter(n => /^ppt\/(slideLayouts|slideMasters)\/[^/]+\.xml$/.test(n))) tpl += count(await zip.file(n).async('string'));
      if (tpl) places.push({ where: 'template', count: tpl });
    } else {
      const xml = await zip.file('word/document.xml').async('string');
      const re = /<w:drawing\b[\s\S]*?<\/w:drawing>|<v:imagedata\b[^>]*>/g;
      for (const m of xml.matchAll(re)) {
        if (m[0].startsWith('<w:drawing') && !BLIP.test(m[0])) { BLIP.lastIndex = 0; continue; } // grafik veya şekil, resim değil
        BLIP.lastIndex = 0;
        const before = xml.slice(0, m.index);
        const para = (before.match(/<w:p[ >]/g) || []).length;
        const prev = plain(before.slice(-4000)), next = plain(xml.slice(m.index + m[0].length, m.index + m[0].length + 4000));
        const near = prev ? '…' + prev.slice(-60) : next ? next.slice(0, 60) + '…' : '';
        const last = places[places.length - 1];
        if (last && last.n === para) last.count++; else places.push({ where: 'para', n: para, near, count: 1 });
      }
      for (const [re2, where] of [[/^word\/header\d*\.xml$/, 'header'], [/^word\/footer\d*\.xml$/, 'footer']]) {
        let c = 0;
        for (const n of files.filter(n => re2.test(n))) c += count(await zip.file(n).async('string'));
        if (c) places.push({ where, count: c });
      }
    }
    return { total: places.reduce((a, p) => a + p.count, 0), places: places.slice(0, 60), more: Math.max(0, places.length - 60) };
  }
  /** Ekranda gösterilecek düz metin (gövde ya da slaytlar). */
  async function docInfo(bytes) {
    const { zip, kind, parts } = await loadParts(bytes);
    const paras = groupsOf(parts.filter(p => p.main)).map(g => g.nodes.map(n => n.value).join(''));
    const slides = kind === 'pptx' ? parts.filter(p => p.main).length : 0;
    return { kind, text: paras.join('\n'), paragraphs: paras.length, slides, images: await imagesIn(zip, kind) };
  }
  function editsFor(groups, outs) {
    const per = new Map();
    groups.forEach((g, gi) => g.nodes.forEach((n, i) => {
      const t = outs[gi][i]; if (t === n.value) return;
      let e = per.get(g.part); if (!e) { e = []; per.set(g.part, e); }
      e.push({ start: n.start, end: n.end, text: S.encodeXml(t) });
      if (n.tag === 'w:t' && /^\s|\s$/.test(t) && n.openStart != null) {
        const open = g.part.xml.slice(n.openStart, n.openEnd);
        if (!/xml:space=/.test(open)) e.push({ start: n.openStart, end: n.openEnd, text: open.replace(/^<w:t\b/, '<w:t xml:space="preserve"') });
      }
    }));
    return per;
  }
  async function blankXlsx() { const ExcelJS = need('ExcelJS'); const wb = new ExcelJS.Workbook(); wb.addWorksheet('Sayfa1'); wb.creator = 'Sırdaş'; return new Uint8Array(await wb.xlsx.writeBuffer()); }
  /** Belge özellikleri, yorum yazarları, küçük resim, gömülü nesneler. */
  async function scrub(zip, kind, rep, lang) {
    const author = lang === 'en' ? 'Author' : 'Yazar';
    const core = zip.file('docProps/core.xml');
    if (core) {
      let x = await core.async('string');
      x = x.replace(/<((?:dc|cp):(?:creator|lastModifiedBy|title|subject|keywords|description|category|contentStatus))(\s[^>]*)?>[\s\S]*?<\/\1>/g, (m, t, a) => { rep.properties++; return `<${t}${a || ''}></${t}>`; });
      zip.file('docProps/core.xml', x);
    }
    const app = zip.file('docProps/app.xml');
    if (app) { let x = await app.async('string'); x = x.replace(/<(Company|Manager|HyperlinkBase)>[\s\S]*?<\/\1>/g, (m, t) => { rep.properties++; return `<${t}></${t}>`; }); zip.file('docProps/app.xml', x); }
    const custom = zip.file('docProps/custom.xml');
    if (custom) { let x = await custom.async('string'); x = x.replace(/(<vt:(?:lpwstr|lpstr|bstr|i4|r8|filetime|bool)>)[^<]*(<\/vt:)/g, (m, a, b) => { rep.properties++; return a + b; }); zip.file('docProps/custom.xml', x); }
    for (const name of Object.keys(zip.files)) {
      if (zip.files[name].dir) continue;
      if (/\.xml$/.test(name) && (name.startsWith('word/') || name.startsWith('ppt/'))) {
        let x = await zip.file(name).async('string'), n0 = x;
        x = x.replace(/\b(w:author|w15:author|w:initials|w15:userId|w15:providerId)="[^"]*"/g, (m, a) => `${a}="${/initials/.test(a) ? author[0] : /userId|providerId/.test(a) ? '' : author}"`);
        if (/commentAuthors\.xml$|authors\.xml$/.test(name)) x = x.replace(/\b(name|initials|userId|providerId)="[^"]*"/g, (m, a) => `${a}="${a === 'name' ? author : a === 'initials' ? author[0] : ''}"`);
        if (x !== n0) { rep.authors++; zip.file(name, x); }
      }
      if (/^docProps\/thumbnail\./.test(name)) { zip.remove(name); rep.thumbnail++; }
      if (/^(word|ppt)\/embeddings\//.test(name)) { zip.file(name, /\.xlsx$/.test(name) ? await blankXlsx() : new Uint8Array(0)); rep.embedded++; }
      if (/^(word|ppt)\/media\//.test(name)) rep.media++;
    }
    const rels = zip.file('_rels/.rels');
    if (rels && rep.thumbnail) { let x = await rels.async('string'); x = x.replace(/<Relationship\b[^>]*Target="[^"]*thumbnail[^"]*"[^>]*\/>/g, ''); zip.file('_rels/.rels', x); }
  }
  /** Bağlantı hedefleri (mailto:…, https://…) de değer taşıyabilir: harici hedefler metin gibi maskelenir. */
  async function relTargets(zip) {
    const out = [];
    for (const name of Object.keys(zip.files)) {
      if (!/_rels\/[^/]+\.rels$/.test(name) || !/^(word|ppt)\//.test(name)) continue;
      const xml = await zip.file(name).async('string');
      const re = /<Relationship\b[^>]*?\bTarget="([^"]*)"[^>]*?TargetMode="External"[^>]*\/>|<Relationship\b[^>]*?TargetMode="External"[^>]*?\bTarget="([^"]*)"[^>]*\/>/g; let m;
      while ((m = re.exec(xml))) { const val = m[1] != null ? m[1] : m[2], i = m.index + m[0].indexOf('Target="') + 8; out.push({ name, xml, start: i, end: i + val.length, value: S.decodeXml(val) }); }
    }
    return out;
  }
  /**
   * Word ya da PowerPoint'i biçimiyle maskeler. opts: { auto, cats, manual, lang }
   * Dönüş: { bytes, kind, result:{added,counts,hidden}, report, preview }
   */
  async function docMask(bytes, key, opts = {}) {
    const { zip, kind, parts } = await loadParts(bytes);
    const groups = groupsOf(parts);
    const links = await relTargets(zip);
    const texts = groups.map(g => g.nodes.map(n => n.value).join('')).concat(links.map(l => l.value));
    const res = S.maskTexts(texts, key, opts);
    const outs = groups.map((g, gi) => S.redistribute(g.nodes.map(n => n.value), res.parts[gi], p => `[${p.t}]`));
    for (const [part, edits] of editsFor(groups, outs)) zip.file(part.name, S.xmlApply(part.xml, edits));
    const relEdits = new Map();
    links.forEach((l, i) => { const t = S.partsToText(res.parts[groups.length + i]); if (t === l.value) return; const e = relEdits.get(l.name) || { xml: l.xml, edits: [] }; e.edits.push({ start: l.start, end: l.end, text: S.encodeXml(t, true) }); relEdits.set(l.name, e); });
    for (const [name, e] of relEdits) zip.file(name, S.xmlApply(e.xml, e.edits));
    const rep = { properties: 0, authors: 0, thumbnail: 0, embedded: 0, media: 0, links: relEdits.size };
    await scrub(zip, kind, rep, opts.lang);
    const preview = groups.map((g, gi) => g.part.main ? S.partsToText(res.parts[gi]) : null).filter(x => x !== null).join('\n');
    const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    return { bytes: out, kind, result: { added: res.added, counts: res.counts, hidden: res.hidden, parts: groups.map((g, gi) => g.part.main ? res.parts[gi] : null).filter(Boolean) }, report: rep, preview };
  }
  /** Etiketli Word ya da PowerPoint dosyasını gerçek değerlerle yazar. opts: restoreText seçenekleri */
  async function docRestore(bytes, key, opts = {}) {
    const { zip, kind, parts } = await loadParts(bytes);
    const groups = groupsOf(parts);
    let done = 0; const unknown = new Set();
    const outs = groups.map(g => {
      const txt = g.nodes.map(n => n.value).join('');
      if (!/[A-Z]_\d|\d/.test(txt)) return g.nodes.map(n => n.value);
      const r = S.restoreText(txt, key, opts); done += r.done + r.dates + r.nums; r.unknown.forEach(u => unknown.add(u));
      return S.redistribute(g.nodes.map(n => n.value), r.parts, p => p.t ? p.v : p.date ? p.to : p.num ? (p.on ? p.to : p.from) : '');
    });
    for (const [part, edits] of editsFor(groups, outs)) zip.file(part.name, S.xmlApply(part.xml, edits));
    return { bytes: await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), kind, done, unknown: [...unknown] };
  }

  /* ================= PDF (yalnızca metin) ================= */
  /** PDF'in metnini sayfa sayfa çıkarır. Taranmış (görüntü) PDF'te metin boş gelir. */
  async function pdfText(bytes, opts = {}) {
    const pdfjs = need('pdfjsLib');
    const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
    // Sayfaları dolaşmadan önce sayfa sınırı: çok sayfalı PDF sekmeyi kilitlemesin.
    const max = opts.maxPages ?? S.LIMITS.pdfPages;
    if (doc.numPages > max) { await doc.destroy?.(); throw S.limitError('too_many_pages', { pages: doc.numPages, max }); }
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const tc = await (await doc.getPage(i)).getTextContent();
      let s = ''; for (const it of tc.items) { s += it.str; if (it.hasEOL) s += '\n'; else if (it.str && !/\s$/.test(it.str)) s += ' '; }
      pages.push(s.replace(/[ \t]+\n/g, '\n').replace(/ {2,}/g, ' ').trim());
    }
    return { text: pages.join('\n\n'), pages: doc.numPages, empty: !pages.join('').trim() };
  }

  /**
   * SheetJS çalışma kitabını Sırdaş kitabına çevirir. Her satırın Excel'deki gerçek satır numarası tutulur
   * (boş satırlar atlanır ama biçimli çıktı hücreyi asıl yerine yazabilir). Gizli sayfalar işaretlenir.
   */
  function bookFromSheetJS(XLSX, wb, lang) {
    const dnf = lang === 'en' ? 'yyyy-mm-dd' : 'dd\\.mm\\.yyyy';
    const sheets = [];
    wb.SheetNames.forEach((n, i) => {
      const ws = wb.Sheets[n]; if (!ws || !ws['!ref']) return;
      const rg = XLSX.utils.decode_range(ws['!ref']);
      const shownAll = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: true, dateNF: dnf });
      const rawAll = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true });
      const keep = [];
      shownAll.forEach((r, k) => { if (r.some(v => String(v).trim() !== '')) keep.push(k); });
      if (!keep.length) return;
      const hidden = !!((wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[i]) || {}).Hidden;
      sheets.push(S.makeSheet(n, keep.map(k => shownAll[k]), keep.map(k => rawAll[k] || []), { r: keep.map(k => rg.s.r + k), c0: rg.s.c }, hidden));
    });
    return { sheets };
  }

  return { init, bookFromSheetJS, stripNotes, excelMaskPreserve, excelRestore, docInfo, docMask, docRestore, pdfText };
});
