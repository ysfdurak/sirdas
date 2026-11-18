/*
 * Sırdaş MCP işlemleri. MCP'den bağımsızdır, testler doğrudan bunu çağırır.
 * Kural: yapay zekâya giden hiçbir yanıtta gerçek değer bulunmaz. Geri açılan içerik yalnızca diske yazılır.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync, readdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(import.meta.url);
export const S = require('../src/core.js');
const XLSX = require('../lib/xlsx.full.min.js');
export const O = require('../src/ofis.js');
O.init({ ExcelJS: require('exceljs'), JSZip: require('jszip'), pdfjsLib: require('pdfjs-dist/legacy/build/pdf.js') });

const EXCEL = /\.(xlsx|xlsm|xls|ods)$/i, PRESERVE = /\.(xlsx|xlsm)$/i, TABLE = /\.(csv|tsv)$/i, TEXT = /\.(txt|md|log|html?)$/i;
const OFFICE = /\.(docx|pptx)$/i, STRUCT = /\.(json|xml|geojson)$/i, PDF = /\.pdf$/i;
const structKind = f => /\.xml$/i.test(f) ? 'xml' : 'json';

/* ---------- Ayarlar ---------- */
export function ayarlar(env = process.env, argv = []) {
  const ev = env.SIRDAS_KLASOR || env.SIRDAS_KLASORLER || '';
  const roots = [...argv, ...ev.split(path.delimiter)].filter(Boolean).map(p => path.resolve(p));
  const dir = env.SIRDAS_DIZIN ? path.resolve(env.SIRDAS_DIZIN) : path.join(os.homedir(), '.sirdas');
  return {
    roots: roots.length ? roots : [process.cwd()],
    keyPath: env.SIRDAS_ANAHTAR ? path.resolve(env.SIRDAS_ANAHTAR) : path.join(dir, 'anahtar.json'),
    tplDir: path.join(dir, 'sablonlar'),
    pass: env.SIRDAS_PAROLA || '',
    lang: env.SIRDAS_DIL === 'en' ? 'en' : 'tr'
  };
}

/** Yalnızca izin verilen klasörlerin içindeki dosyalara dokunulur. */
export function izinliYol(cfg, p) {
  const abs = path.resolve(p);
  let real = abs;
  try { real = realpathSync(abs); } catch { real = path.join(realpathSync(path.dirname(abs)), path.basename(abs)); }
  const ok = cfg.roots.some(r => { let rr = r; try { rr = realpathSync(r); } catch { /* yok */ } const rel = path.relative(rr, real); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); });
  if (!ok) throw new Error(`Bu dosyaya izin yok: ${abs}. İzinli klasörler: ${cfg.roots.join(', ')}`);
  return real;
}

/* ---------- Anahtar ---------- */
export async function anahtarYukle(cfg) {
  if (!existsSync(cfg.keyPath)) return S.newKey();
  const j = JSON.parse(readFileSync(cfg.keyPath, 'utf8'));
  if (j.format === 'sirdas-anahtar') {
    if (!cfg.pass) throw new Error('Anahtar dosyası şifreli. SIRDAS_PAROLA ortam değişkenini ayarla.');
    return S.decryptKey(j, cfg.pass);
  }
  return S.upgradeKey(j);
}
export async function anahtarKaydet(cfg, key) {
  mkdirSync(path.dirname(cfg.keyPath), { recursive: true });
  const body = cfg.pass ? JSON.stringify(await S.encryptKey(key, cfg.pass)) : JSON.stringify(key);
  writeFileSync(cfg.keyPath, body, { mode: 0o600 });
  try { chmodSync(cfg.keyPath, 0o600); } catch { /* Windows */ }
}

/* ---------- Şablonlar ---------- */
export function sablonlar(cfg) {
  if (!existsSync(cfg.tplDir)) return [];
  return readdirSync(cfg.tplDir).filter(f => f.endsWith('.json')).map(f => {
    try { const p = JSON.parse(readFileSync(path.join(cfg.tplDir, f), 'utf8')); return S.validProfile(p) ? { file: f, profile: p } : null; } catch { return null; }
  }).filter(Boolean);
}
function sablonBul(cfg, ad) {
  if (!ad) return null;
  if (/\.json$/i.test(ad) && existsSync(ad)) { const p = JSON.parse(readFileSync(izinliYol(cfg, ad), 'utf8')); if (!S.validProfile(p)) throw new Error('Bu dosya bir Sırdaş şablonu değil.'); return p; }
  const hit = sablonlar(cfg).find(x => S.clean(x.profile.name) === S.clean(ad) || x.file === ad || x.file === ad + '.json');
  if (!hit) throw new Error(`“${ad}” şablonu bulunamadı. Şablonlar: ${sablonlar(cfg).map(x => x.profile.name).join(', ') || 'yok'} (${cfg.tplDir})`);
  return hit.profile;
}

/* ---------- Dosya okuma / yazma ---------- */
export function kitapOku(file) {
  if (EXCEL.test(file)) {
    return O.bookFromSheetJS(XLSX, XLSX.read(readFileSync(file), { cellDates: true }), 'tr');
  }
  if (TABLE.test(file)) return { sheets: [S.makeSheet(path.basename(file), S.parseTable(readFileSync(file, 'utf8')) || [])] };
  throw new Error('Tablo olarak okunamıyor. Desteklenen: .xlsx .xlsm .xls .ods .csv .tsv');
}
const ciktiYolu = (file, ek) => { const { dir, name, ext } = path.parse(file); return path.join(dir, `${name}.${ek}${ext}`); };

/** Yapay zekânın istediği sütun kuralları: [{ baslik, islem, etiket }] */
function sutunKurallari(book, list, base) {
  const prof = { format: 'sirdas-sablon', v: 1, name: 'istek', columns: list.map(x => ({ header: x.baslik, action: x.islem || 'tag', label: x.etiket ? S.slug(x.etiket) : '' })), options: {}, terms: [] };
  return S.applyProfile(book, prof, base);
}

/* ---------- Araçlar ---------- */
export function basliklar(cfg, dosya) {
  const file = izinliYol(cfg, dosya);
  if (STRUCT.test(file)) return { alanlar: S.structFields(readFileSync(file, 'utf8'), structKind(file)).map(f => ({ yol: f.path, adet: f.count, tur: { text: 'metin', number: 'sayı', date: 'tarih' }[f.type] })) };
  const book = kitapOku(file);
  return { sayfalar: book.sheets.map((sh, i) => ({
    sayfa: i + 1, gizli: sh.hidden || undefined, satir: sh.rows.length - 1,
    sutunlar: (sh.rows[0] || []).map((h, c) => {
      let n = 0, num = 0, date = 0;
      for (let r = 1; r < Math.min(sh.rows.length, 2000); r++) { const v = sh.rows[r][c].trim(); if (!v) continue; n++; const raw = sh.raw && sh.raw[r][c]; if (raw instanceof Date || S.parseDate(v)) date++; else if (typeof raw === 'number' || S.parseNumber(v, cfg.lang)) num++; }
      return { harf: S.colName(c), baslik: String(h), tur: !n ? 'boş' : date / n >= 0.7 ? 'tarih' : num / n >= 0.7 ? 'sayı' : 'metin' };
    })
  })) };
}

export async function maskeleDosya(cfg, a) {
  const file = izinliYol(cfg, a.dosya);
  const key = await anahtarYukle(cfg);
  const base = { propagate: a.deger_yay !== false, auto: !!a.kisisel_veri, hideSheetNames: a.sayfa_adlarini_gizle !== false, lang: cfg.lang, manual: [] };
  if (OFFICE.test(file) || PDF.test(file) || STRUCT.test(file)) {
    const prof = sablonBul(cfg, a.sablon);
    const terms = (prof ? prof.terms : []).concat((a.terimler || []).map(t => ({ term: t, label: 'OZEL' })));
    const ext = path.extname(file).slice(1).toLowerCase();
    if (STRUCT.test(file)) {
      const rules = {};
      for (const x of a.alanlar || []) rules[x.yol] = { action: x.islem || 'tag', label: x.etiket ? S.slug(x.etiket) : '' };
      if (!Object.keys(rules).length && !terms.length) throw new Error('Hiçbir alan seçilmedi. “alanlar” ver; alan yollarını görmek için basliklari_goster aracını kullan.');
      const r = S.maskStruct(readFileSync(file, 'utf8'), structKind(file), key, { rules, propagate: a.deger_yay !== false, auto: !!a.kisisel_veri, manual: terms, lang: cfg.lang });
      S.commit(key, r); await anahtarKaydet(cfg, key);
      const out = a.cikti ? izinliYol(cfg, a.cikti) : ciktiYolu(file, 'maskeli');
      writeFileSync(out, r.masked);
      return { cikti: out, ozet: { gizlenen: r.stats.hidden + r.stats.spread + r.stats.auto, olceklenen: r.stats.scaled, kaydirilan_tarih: r.stats.dated, cikarilan_alanlar: r.stats.dropped }, onizleme: r.masked.slice(0, 60000) };
    }
    if (PDF.test(file)) {
      const pt = await O.pdfText(new Uint8Array(readFileSync(file)));
      if (pt.empty) throw new Error('Bu PDF’te metin yok; taranmış bir belge olabilir. Metin tanıma (OCR) Sırdaş’ta yok.');
      const r = S.maskText(pt.text, key, { auto: a.kisisel_veri !== false, manual: terms });
      S.commit(key, r); await anahtarKaydet(cfg, key);
      const out = a.cikti ? izinliYol(cfg, a.cikti) : ciktiYolu(file, 'maskeli').replace(/\.pdf$/i, '.txt');
      writeFileSync(out, r.masked);
      return { cikti: out, not: 'PDF’in görünümü korunmaz; maskeli metin .txt olarak yazıldı.', ozet: { sayfa: pt.pages, gizlenen: r.parts.filter(p => typeof p !== 'string').length }, onizleme: r.masked.slice(0, 60000) };
    }
    const r = await O.docMask(new Uint8Array(readFileSync(file)), key, { auto: a.kisisel_veri !== false, manual: terms, lang: cfg.lang });
    S.commit(key, r.result); await anahtarKaydet(cfg, key);
    const out = a.cikti ? izinliYol(cfg, a.cikti) : ciktiYolu(file, 'maskeli');
    writeFileSync(out, r.bytes);
    return { cikti: out, ozet: { tur: ext, gizlenen: r.result.hidden, temizlenen: r.report }, onizleme: r.preview.slice(0, 60000) };
  }
  if (TEXT.test(file)) {
    const prof = sablonBul(cfg, a.sablon);
    const terms = (prof ? prof.terms : []).concat((a.terimler || []).map(t => ({ term: t, label: 'OZEL' })));
    const r = S.maskText(readFileSync(file, 'utf8'), key, { auto: a.kisisel_veri !== false, manual: terms });
    S.commit(key, r); await anahtarKaydet(cfg, key);
    const out = a.cikti ? izinliYol(cfg, a.cikti) : ciktiYolu(file, 'maskeli');
    writeFileSync(out, r.masked);
    return { cikti: out, ozet: { gizlenen: r.parts.filter(p => typeof p !== 'string').length, supheli: r.suggestions.length }, onizleme: r.masked.slice(0, 60000) };
  }
  const book = kitapOku(file);
  let applied = { cfg: Object.assign({ sheets: book.sheets.map(sh => ({ hdr: true, include: !sh.hidden, cols: {}, cells: [], holes: [] })) }, base), matched: [], missing: [] };
  const prof = sablonBul(cfg, a.sablon);
  if (prof) applied = S.applyProfile(book, prof, applied.cfg);
  if (a.sutunlar && a.sutunlar.length) {
    const extra = sutunKurallari(book, a.sutunlar, applied.cfg);
    applied = { cfg: extra.cfg, matched: applied.matched.concat(extra.matched), missing: applied.missing.concat(extra.missing) };
  }
  for (const k of ['deger_yay', 'sayfa_adlarini_gizle', 'kisisel_veri']) if (a[k] !== undefined) applied.cfg[{ deger_yay: 'propagate', sayfa_adlarini_gizle: 'hideSheetNames', kisisel_veri: 'auto' }[k]] = a[k];
  applied.cfg.lang = cfg.lang;
  if (!Object.values(applied.cfg.sheets).some(s => Object.keys(s.cols).length)) throw new Error('Hiçbir sütun seçilmedi. “sablon” ya da “sutunlar” ver; başlıkları görmek için basliklari_goster aracını kullan.');
  const res = S.maskBook(book, key, applied.cfg);
  S.commit(key, res); await anahtarKaydet(cfg, key);

  const out = a.cikti ? izinliYol(cfg, a.cikti) : ciktiYolu(file, 'maskeli').replace(/\.(xls|ods|xlsm)$/i, '.xlsx');
  if (TABLE.test(out)) writeFileSync(out, S.toTSV(res.sheets.find(s => s.include), cfg.lang).replace(/\t/g, out.endsWith('.tsv') ? '\t' : ';'));
  else if (PRESERVE.test(file) && a.bicimi_koru !== false) {
    const full = { ...res };
    const x = await O.excelMaskPreserve(new Uint8Array(readFileSync(file)), book, full, { hideSheetNames: applied.cfg.hideSheetNames });
    writeFileSync(out, x.bytes); res.temizlenen = x.report;
  } else {
    const wb = XLSX.utils.book_new(); const dnf = cfg.lang === 'en' ? 'yyyy-mm-dd' : 'dd\\.mm\\.yyyy';
    for (const so of res.sheets) if (so.include) { const ws = XLSX.utils.aoa_to_sheet(S.toAOA(so), { cellDates: true, dateNF: dnf }); for (const k of Object.keys(ws)) if (k[0] !== '!' && ws[k].t === 'd') ws[k].z = dnf; XLSX.utils.book_append_sheet(wb, ws, so.outName.slice(0, 31)); }
    writeFileSync(out, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true }));
  }
  const n = Math.min(Math.max(a.onizleme_satir || 50, 1), 500);
  let onizleme = '';
  for (const so of res.sheets) if (so.include) onizleme += `## ${so.outName} (${so.total} satır)\n` + S.toTSV({ ...so, rows: so.rows.slice(0, n) }, cfg.lang) + '\n\n';
  const st = res.stats;
  return {
    cikti: out,
    ozet: {
      sayfa: res.sheets.filter(s => s.include).length, satir: st.rows, gizlenen_hucre: st.hidden, metin_icinde: st.spread, otomatik: st.auto,
      olceklenen: st.scaled, araliga: st.bucketed, kaydirilan_tarih: st.dated, gruplanan: st.grouped, cikarilan_sutunlar: st.dropped,
      sablon_eslesen: applied.matched, sablon_bulunamayan: applied.missing,
      // Sızıntı uyarısı değerleri İÇERMEZ: yalnızca kaç tane ve nerede.
      acik_kalan: res.leaks.total ? { adet: res.leaks.total, yerler: res.leaks.list.map(l => l.where.label ? `etiket ${l.where.label}` : l.where.cell ? `hücre ${l.where.cell}` : 'sayfa adı').slice(0, 20) } : null,
      secimsiz_sayfa_sayisi: st.sheetsNoMask.length,
      disarida_birakilan_gizli_sayfa: book.sheets.filter((s, i) => s.hidden && applied.cfg.sheets[i].include === false).length,
      temizlenen: res.temizlenen
    },
    onizleme: onizleme.slice(0, 60000)
  };
}

export async function geriAcDosya(cfg, a) {
  const file = izinliYol(cfg, a.dosya);
  const key = await anahtarYukle(cfg);
  const opts = { numbers: a.sayilar !== false, dates: a.tarihler !== false, lang: cfg.lang };
  const out = a.cikti ? izinliYol(cfg, a.cikti) : ciktiYolu(file, 'acilmis');
  let done = 0; const unknown = new Set();
  if (PRESERVE.test(file)) {
    const r = await O.excelRestore(new Uint8Array(readFileSync(file)), key, opts);
    writeFileSync(out, r.bytes); return { cikti: out, geri_acilan: r.done, bilinmeyen_etiketler: r.unknown };
  }
  if (OFFICE.test(file)) {
    const r = await O.docRestore(new Uint8Array(readFileSync(file)), key, { ...opts, numbers: a.sayilar === true });
    writeFileSync(out, r.bytes); return { cikti: out, geri_acilan: r.done, bilinmeyen_etiketler: r.unknown };
  }
  if (STRUCT.test(file)) {
    const r = S.restoreStruct(readFileSync(file, 'utf8'), structKind(file), key, opts);
    writeFileSync(out, r.text); return { cikti: out, geri_acilan: r.done, bilinmeyen_etiketler: r.unknown };
  }
  if (EXCEL.test(file)) {
    const wb = XLSX.read(readFileSync(file), { cellDates: true, cellNF: true });
    for (const n of wb.SheetNames) {
      const ws = wb.Sheets[n]; if (!ws['!ref']) continue;
      const range = XLSX.utils.decode_range(ws['!ref']);
      const head = c => { const h = ws[XLSX.utils.encode_cell({ r: range.s.r, c })]; return h ? String(h.v) : null; };
      for (const addr of Object.keys(ws)) {
        if (addr[0] === '!') continue;
        const cell = ws[addr], pos = XLSX.utils.decode_cell(addr);
        const val = ['d', 'n'].includes(cell.t) ? cell.v : cell.t === 's' ? String(cell.v) : null;
        if (val == null) continue;
        const r = S.restoreValue(val, key, opts, pos.r > range.s.r ? head(pos.c) : null);
        (r.unknown || []).forEach(u => unknown.add(u));
        if (r.changed) { cell.v = r.value; cell.t = r.value instanceof Date ? 'd' : typeof r.value === 'number' ? 'n' : 's'; delete cell.w; delete cell.h; delete cell.r; done++; }
      }
    }
    wb.SheetNames = wb.SheetNames.map(n => { const real = key.sheetNames[n]; if (real && !wb.Sheets[real]) { wb.Sheets[real] = wb.Sheets[n]; delete wb.Sheets[n]; return real; } return n; });
    writeFileSync(out, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true }));
  } else {
    const text = readFileSync(file, 'utf8');
    if (TABLE.test(file)) {
      const rows = S.parseTable(text) || []; const d = text.includes('\t') ? '\t' : text.split('\n')[0].includes(';') ? ';' : ',';
      const outRows = rows.map((row, r) => row.map((v, c) => { const x = S.restoreValue(v, key, opts, r > 0 ? rows[0][c] : null); (x.unknown || []).forEach(u => unknown.add(u)); done += x.changed; return String(x.value); }));
      writeFileSync(out, outRows.map(r => r.map(v => (v.includes(d) || v.includes('"')) ? `"${v.replace(/"/g, '""')}"` : v).join(d)).join('\n'));
    } else {
      const r = S.restoreText(text, key, opts); r.unknown.forEach(u => unknown.add(u)); done = r.done + r.dates + r.nums;
      writeFileSync(out, S.restoredToText(r.parts));
    }
  }
  return { cikti: out, geri_acilan: done, bilinmeyen_etiketler: [...unknown] };
}

export async function yanitiKaydet(cfg, a) {
  const out = izinliYol(cfg, a.cikti);
  if (existsSync(out) && !a.uzerine_yaz) throw new Error(`${out} zaten var. Başka bir ad ver ya da uzerine_yaz: true kullan.`);
  const key = await anahtarYukle(cfg);
  const r = S.restoreText(a.metin, key, { numbers: a.sayilar !== false, dates: a.tarihler !== false, lang: cfg.lang });
  writeFileSync(out, S.restoredToText(r.parts));
  return { cikti: out, geri_acilan_etiket: r.done, geri_kaydirilan_tarih: r.dates, geri_cevrilen_sayi: r.nums, bilinmeyen_etiketler: r.unknown, ek_uyarisi: r.harmony.length };
}

export async function anahtarOzeti(cfg) {
  const key = await anahtarYukle(cfg);
  const byCat = {};
  for (const e of Object.values(key.entries)) byCat[e.cat] = (byCat[e.cat] || 0) + 1;
  return { anahtar_dosyasi: cfg.keyPath, sifreli: !!cfg.pass, etiket_turleri: byCat, olceklenen_sutun: key.scaled.headers.length, kaydirilan_tarih_sutunu: key.dated.headers.length };
}
