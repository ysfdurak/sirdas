/*
 * Sırdaş çekirdeği
 * Web arayüzü, arka plan hesaplayıcısı (Worker), MCP sunucusu ve testler bu dosyayı ortak kullanır.
 * DOM'a ve ağa dokunmaz: girdi alır, sonuç döndürür. Tarayıcıda `Sirdas`, Node'da `require('./core.js')`.
 *
 * Bölümler:
 *  1. Metin yardımcıları      6. Tablo maskeleme (maskBook)
 *  2. Doğrulayıcılar          7. Geri açma (restoreText, restoreValue)
 *  3. Otomatik tespit         8. Şablonlar (profiller)
 *  4. Anahtar ve defter       9. Şifreleme
 *  5. Sayı ve tarih          10. Tablo okuma yardımcıları
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Sirdas = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VERSION = '1.2.4';

  /* ---------------- 1. Metin yardımcıları ---------------- */
  const tl = s => String(s).toLocaleLowerCase('tr');
  const clean = s => tl(s).replace(/\s+/g, ' ').trim();
  const digits = s => String(s).replace(/\D/g, '');
  const normValue = s => String(s).replace(/\s+/g, ' ').trim();
  const normHeader = h => clean(h).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const L = '(?<![\\p{L}\\p{N}])', R = '(?![\\p{L}\\p{N}])';
  const CAP = '(?:\\p{Lu}\\p{Ll}+|\\p{Lu}{2,})';
  const TRMAP = { 'Ç': 'C', 'Ğ': 'G', 'İ': 'I', 'I': 'I', 'Ö': 'O', 'Ş': 'S', 'Ü': 'U', 'Â': 'A', 'Î': 'I', 'Û': 'U' };

  /** Etiket adı: "Maliyet (TL)" → "MALIYET_TL". Etiket yalnızca A-Z, 0-9 ve _ içerir. */
  function slug(s) {
    let t = String(s).toLocaleUpperCase('tr').replace(/[ÇĞİÖŞÜÂÎÛ]/g, c => TRMAP[c])
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24).replace(/_+$/, '');
    if (/^\d/.test(t)) t = 'S_' + t;
    return t;
  }
  /** 0 → A, 25 → Z, 26 → AA */
  function colName(c) { let n = c + 1, s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }

  /** Bir terimi Türkçe büyük/küçük harf ve boşluk farkına duyarsız arayan regex parçası. */
  function termSource(term) {
    const esc = c => c.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
    return [...String(term).trim()].map(ch => {
      if (/\s/.test(ch)) return '\\s+';
      const lo = ch.toLocaleLowerCase('tr'), up = ch.toLocaleUpperCase('tr');
      return lo !== up && [...lo].length === 1 && [...up].length === 1 ? `[${esc(lo)}${esc(up)}]` : esc(ch);
    }).join('').replace(/(\\s\+)+/g, '\\s+');
  }
  /** Başka hücrelerde aranabilecek değer mi? Kısa sayılar ("12") yanlış eşleşme yapar, aranmaz. */
  const canSpread = v => (/\p{L}/u.test(v) && [...v].length >= 3) || /^\d{6,}$/.test(v);
  const SPREAD_MAX = 5000;
  const escLit = s => s.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
  /**
   * Çok sayıda değeri tek geçişte arayan eşleyici. Hücre Türkçe kurala göre küçük harfe çevrilip
   * düz metin regex'iyle aranır (harf sınıflı regex'ten çok daha hızlı). Küçük harfe çevirince
   * uzunluğu değişen nadir metinlerde yavaş ama kesin yola düşer.
   * Dönüş: str => [{ index, text }]
   */
  function makeMatcher(values) {
    const list = [...new Set(values.map(normValue))].filter(canSpread).sort((a, b) => b.length - a.length).slice(0, SPREAD_MAX);
    if (!list.length) return null;
    const fast = new RegExp(L + '(?:' + list.map(v => escLit(tl(v)).replace(/\s+/g, '\\s+')).join('|') + ')' + R, 'gu');
    let slow = null;
    return str => {
      const low = tl(str), out = [];
      if (low.length === str.length) { for (const m of low.matchAll(fast)) out.push({ index: m.index, text: str.substr(m.index, m[0].length) }); return out; }
      slow = slow || new RegExp(L + '(?:' + list.map(termSource).join('|') + ')' + R, 'gu');
      for (const m of str.matchAll(slow)) out.push({ index: m.index, text: m[0] });
      return out;
    };
  }
  /* ---------------- 2. Doğrulayıcılar ---------------- */
  function validTCKN(s) {
    if (!/^[1-9]\d{10}$/.test(s)) return false;
    const d = [...s].map(Number);
    const odd = d[0] + d[2] + d[4] + d[6] + d[8], even = d[1] + d[3] + d[5] + d[7];
    return ((odd * 7 - even) % 10 + 10) % 10 === d[9] && d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
  }
  function validVKN(s) {
    if (!/^\d{10}$/.test(s)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) { const t = (+s[i] + 9 - i) % 10; sum += t === 0 ? 0 : ((t * 2 ** (9 - i)) % 9 || 9); }
    return (10 - sum % 10) % 10 === +s[9];
  }
  function luhn(s) { let sum = 0, alt = false; for (let i = s.length - 1; i >= 0; i--) { let n = +s[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; } return sum % 10 === 0; }
  function validIBAN(raw) {
    const s = raw.replace(/\s/g, '').toUpperCase(), r = s.slice(4) + s.slice(0, 4); let m = 0;
    for (const c of r) { const v = c >= 'A' ? String(c.charCodeAt(0) - 55) : c; for (const x of v) m = (m * 10 + +x) % 97; }
    return m === 1;
  }

  /* ---------------- 3. Otomatik tespit (kişisel veri) ---------------- */
  const CATS = [
    ['AD', 1], ['TCKN', 1], ['VKN', 1], ['IBAN', 1], ['KART', 1], ['EPOSTA', 1], ['TEL', 1], ['ADRES', 1],
    ['FIRMA', 1], ['PLAKA', 1], ['IP', 1], ['TARIH', 0], ['TUTAR', 0]
  ];
  const DEFAULT_CATS = CATS.filter(c => c[1]).map(c => c[0]);
  const NAMES = new Set(`ahmet mehmet mustafa ali hüseyin hasan ibrahim ismail osman yusuf murat ömer ramazan emre burak kemal halil süleyman abdullah mahmut recep salih fatih kadir enes serkan oğuz tolga cem caner volkan sinan erdem gökhan hakan tuncay kerem berk berkay mert ege arda alp baran batuhan furkan yasin eren uğur taner tarık levent selim kaan koray orhan adem bekir yunus nihat serdar sedat ercan erkan engin bülent cengiz ferhat vedat zeki fikret tahir rıza nuri
ayşe fatma emine hatice zeynep elif meryem şerife zehra hanife merve özlem esra yasemin leyla büşra kübra derya sibel gamze tuğba aslı ebru pınar selin ceren dilara ece melis irem seda sevda songül gülşen filiz nurcan nazan melek rabia sema hülya canan aylin aysel berna burcu ceyda demet duygu feride funda gizem gonca hande ilknur ipek lale neslihan nilgün nihan öznur rana seher tülay yeliz zerrin`.split(/\s+/));
  const AMBIG = new Set('can deniz umut barış yıldız güneş bahar gül su ay yaz kaya demir aslan arslan toprak ırmak onur sevgi nur sultan şahin yavuz metin'.split(' '));
  const STOP = new Set('mah mahallesi cad caddesi sok sokak sokağı bulvarı apt apartmanı bey hanım efendi bankası bank üniversitesi hastanesi holding şirketi lojistik teknoloji yazılım sigorta ticaret sanayi yetkili ilgili müşterimiz müdürüm müdür hocam ad soyad adı soyadı telefon şehir adres tarih türkiye istanbul ankara izmir'.split(' '));
  const COLS = {
    AD: 'ad|adı|isim|soyad|soyadı|ad soyad|adı soyadı|adsoyad|müşteri|müşteri adı|çalışan|çalışan adı|personel|personel adı|hasta|hasta adı|yetkili|kişi|alıcı|gönderen|sorumlu|name|full name',
    TCKN: 'tc|t c|tckn|tc no|tc kimlik|tc kimlik no|kimlik no|tc kimlik numarası',
    VKN: 'vkn|vergi no|vergi numarası', IBAN: 'iban|iban no',
    TEL: 'telefon|tel|gsm|cep|cep telefonu|telefon no|phone',
    EPOSTA: 'e posta|eposta|email|e mail|mail', ADRES: 'adres|açık adres|teslimat adresi|fatura adresi|address',
    FIRMA: 'firma|firma adı|şirket|şirket adı|tedarikçi|company', PLAKA: 'plaka|araç plakası',
    TUTAR: 'maaş|ücret|gelir|salary'
  };
  const COL_MAP = new Map();
  for (const c in COLS) COLS[c].split('|').forEach(h => COL_MAP.set(h, c));

  /** Başlığa bakarak kişisel veri sütunu önerir: { sütunNo: 'AD' } */
  function suggestColumns(headerRow, cats) {
    const on = new Set(cats || DEFAULT_CATS), out = {};
    (headerRow || []).forEach((h, c) => { const cat = COL_MAP.get(normHeader(h)); if (cat && on.has(cat)) out[c] = cat; });
    return out;
  }

  function splitCells(line, d) {
    const out = []; let start = 0, q = false;
    for (let i = 0; i <= line.length; i++) {
      if (i === line.length || (line[i] === d && !q)) { out.push({ a: start, b: i, t: line.slice(start, i) }); start = i + 1; }
      else if (line[i] === '"') q = !q;
    }
    return out;
  }

  function tableCandidates(text, add, on) {
    let pos = 0, block = [];
    const flush = () => {
      if (block.length >= 2) {
        const head = block[0].s;
        const delim = ['\t', ';', '|', ','].map(d => [d, splitCells(head, d).length]).sort((a, b) => b[1] - a[1])[0];
        if (delim[1] >= 2) {
          const cols = splitCells(head, delim[0]).map(c => COL_MAP.get(normHeader(c.t.replace(/["']/g, ''))) || null);
          if (cols.some(Boolean)) for (const row of block.slice(1)) {
            for (const [i, c] of splitCells(row.s, delim[0]).entries()) {
              if (!cols[i] || !on(cols[i])) continue;
              let a = c.a, b = c.b;
              while (a < b && /[\s"]/.test(row.s[a])) a++;
              while (b > a && /[\s"]/.test(row.s[b - 1])) b--;
              if (b > a) add(10, cols[i], row.o + a, row.o + b);
            }
          }
        }
      }
      block = [];
    };
    for (const line of text.split('\n')) {
      if (line.trim() === '') flush(); else block.push({ s: line.replace(/\r$/, ''), o: pos });
      pos += line.length + 1;
    }
    flush();
  }

  /**
   * Metindeki gizlenecek parçaların adaylarını bulur.
   * ctx: { auto, cats:Set, manual:[{term,label}], known:[entry], fullNames:[ad soyad] }
   */
  function findCandidates(text, ctx) {
    const cands = [];
    const add = (prio, cat, a, b, extra) => cands.push({ prio, cat, a, b, value: text.slice(a, b), ...extra });
    const scan = (re, fn) => { for (const m of text.matchAll(re)) fn(m); };
    const on = c => ctx.cats.has(c);

    for (const { term, label } of ctx.manual || []) {
      if (String(term).trim()) scan(new RegExp(L + termSource(term) + R, 'gu'), m => add(0, label || 'OZEL', m.index, m.index + m[0].length, { manualKey: 'V|' + clean(term) }));
    }
    const known = (ctx.known || []).filter(e => e.key.startsWith('V|'));
    const knownM = makeMatcher(known.map(e => e.value));
    if (knownM) {
      const byKey = new Map(known.map(e => [e.key, e]));
      for (const m of knownM(text)) { const k = 'V|' + clean(m.text), e = byKey.get(k); if (e) add(1, e.cat, m.index, m.index + m.text.length, { manualKey: k }); }
    }
    if (!ctx.auto) return cands;

    tableCandidates(text, add, on);
    if (on('IBAN')) scan(/(?<![A-Za-z0-9])TR\s?\d{2}(?:\s?\d{4}){5}\s?\d{2}(?!\d)|(?<![A-Za-z0-9])[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,6}(?:\s?[A-Z0-9]{1,3})?(?![A-Za-z0-9])/g, m => { if (m[0].startsWith('TR') || validIBAN(m[0])) add(20, 'IBAN', m.index, m.index + m[0].length); });
    if (on('EPOSTA')) scan(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu, m => add(21, 'EPOSTA', m.index, m.index + m[0].length));
    if (on('KART')) scan(/(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)/g, m => { const d = digits(m[0]); if (d.length >= 13 && d.length <= 19 && luhn(d)) add(22, 'KART', m.index, m.index + m[0].length); });
    if (on('TCKN')) scan(/(?<!\d)\d{11}(?!\d)/g, m => { if (validTCKN(m[0])) add(23, 'TCKN', m.index, m.index + 11); });
    if (on('VKN')) scan(/(?:vergi(?:\s+(?:no|numarası|kimlik))*|vkn)\s*[:.]?\s*(\d{10})(?!\d)/giu, m => { if (validVKN(m[1])) { const a = m.index + m[0].length - 10; add(24, 'VKN', a, a + 10); } });
    if (on('TEL')) scan(/(?<!\d)(?:(?:\+?90[\s.-]?|0)?\(?5\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}|(?:\+?90[\s.-]?|0)\(?[234]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2})(?!\d)/g, m => add(25, 'TEL', m.index, m.index + m[0].length));
    if (on('IP')) scan(/(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\d.])/g, m => add(26, 'IP', m.index, m.index + m[0].length));
    if (on('ADRES')) {
      const unit = '(?:Mah(?:allesi)?\\.?|Cad(?:desi)?\\.?|Sok(?:ak|ağı)?\\.?|Sk\\.|Bulvarı|Blv\\.)';
      const piece = `(?:${unit}|Apt\\.?|No\\s*[:.]?\\s*\\d+[A-Za-z]?(?:\\/\\d+)?|D(?:aire)?\\s*[:.]?\\s*\\d+|Kat\\s*[:.]?\\s*\\d+|\\p{Lu}\\p{L}*|\\d+(?:\\/\\d+)?)`;
      scan(new RegExp(`${L}(?:\\p{Lu}[\\p{L}\\d]*\\s+){1,3}${unit}${R}(?:[\\s,/-]+${piece})*`, 'gu'), m => add(30, 'ADRES', m.index, m.index + m[0].trimEnd().length));
    }
    if (on('FIRMA')) scan(new RegExp(`${L}(?:\\p{Lu}[\\p{L}&'’.-]*\\s+(?:ve\\s+)?){1,5}(?:A\\.?Ş\\.?|Ltd\\.?\\s*Şti\\.?|Limited\\s+Şirketi|Anonim\\s+Şirketi|Holding)${R}`, 'gu'), m => add(31, 'FIRMA', m.index, m.index + m[0].length));
    if (on('PLAKA')) scan(/(?<![\p{L}\p{N}])(0[1-9]|[1-7]\d|8[01])\s?([A-PR-VYZ]{1,3})\s?(\d{2,4})(?![\p{L}\p{N}])/gu, m => { if (!/^(TL|KG|GB|MB|KM|CM|MM|LT|ADET)$/.test(m[2])) add(32, 'PLAKA', m.index, m.index + m[0].length); });
    if (on('TARIH')) scan(/(?<!\d)(?:\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+\d{4})(?!\d)/gu, m => add(50, 'TARIH', m.index, m.index + m[0].length));
    if (on('TUTAR')) scan(/(?:[₺$€£]\s?\d[\d.,]*|(?<![\d.,])\d[\d.,]*\s?(?:TL|TRY|USD|EUR|GBP|₺|lira)(?![\p{L}]))/gu, m => add(51, 'TUTAR', m.index, m.index + m[0].length));

    if (on('AD')) {
      const fulls = [];
      const name = (a, value, isFull) => { add(isFull ? 40 : 42, 'AD', a, a + value.length); if (isFull) fulls.push(value); };
      const words = s => s.split(/\s+/);
      const trimStop = s => { const keep = []; for (const x of words(s)) { if (STOP.has(tl(x))) break; keep.push(x); } return keep.join(' '); };
      const labelRe = new RegExp(`(?:${L}(?:Sayın|Sn\\.|Dr\\.|Av\\.|Prof\\.|Doç\\.|Uzm\\.|Op\\.)\\s+|${L}(?:Ad(?:ı)?\\s*(?:ve\\s*)?Soyad(?:ı)?|İsim|Müşteri|Hasta|Danışan|Çalışan|Personel|Yetkili|Gönderen|Alıcı|Kişi|Sorumlu)\\s*:\\s*)(${CAP}(?:[ \\t]+${CAP}){0,2})`, 'gu');
      scan(labelRe, m => { const v = trimStop(m[1]); if (v) name(m.index + m[0].length - m[1].length, v, v.includes(' ')); });
      scan(new RegExp(`${L}${CAP}(?:[ \\t]+${CAP}){0,5}`, 'gu'), m => {
        const w = words(m[0]); let off = m.index, i = 0;
        const skipSpace = () => { off += text.slice(off).match(/^[ \t]*/)[0].length; };
        while (i < w.length) {
          const lw = tl(w[i]);
          if (NAMES.has(lw) || AMBIG.has(lw)) {
            const take = [w[i]]; let j = i + 1;
            while (j < w.length && take.length < 3 && !STOP.has(tl(w[j]))) take.push(w[j++]);
            const real = text.slice(off).match(new RegExp('^' + take.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[ \\t]+'), 'u'));
            if (real && (take.length > 1 || !AMBIG.has(lw))) name(off, real[0], take.length > 1);
            i = j; off += real ? real[0].length : take.join(' ').length; skipSpace(); continue;
          }
          off += w[i].length; skipSpace(); i++;
        }
      });
      scan(new RegExp(`${L}(${CAP})(?=[ \\t]+(?:Bey|Hanım)${R})`, 'gu'), m => add(43, 'AD', m.index, m.index + m[1].length));
      // "Ahmet Yılmaz" bilindikten sonra tek başına "Yılmaz" açıkta kalmasın.
      const fullNames = new Set(fulls.concat(ctx.fullNames || []));
      for (const full of fullNames) {
        const w = words(full), parent = keyOf('AD', full);
        for (const [part, word] of [['ILK', w[0]], ['SON', w[w.length - 1]]]) {
          if (word.length < 3) continue;
          const forms = [...new Set([word, word.toLocaleUpperCase('tr'), word[0].toLocaleUpperCase('tr') + word.slice(1).toLocaleLowerCase('tr')])].map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
          scan(new RegExp(`${L}(?:${forms.join('|')})${R}`, 'gu'), m => add(41, 'AD', m.index, m.index + m[0].length, { part, parent, parentValue: full }));
        }
      }
    }
    return cands;
  }
  function keyOf(cat, value) {
    const dig = ['TCKN', 'VKN', 'KART', 'TEL'].includes(cat);
    return cat + '|' + (dig ? digits(value) : clean(value).replace(/\s/g, cat === 'IBAN' ? '' : ' '));
  }

  /* ---------------- 4. Anahtar ve defter ---------------- */
  const rnd = () => { const u = new Uint32Array(1); (globalThis.crypto || {}).getRandomValues ? globalThis.crypto.getRandomValues(u) : (u[0] = Math.random() * 2 ** 32); return u[0] / 2 ** 32; };

  /**
   * Yeni anahtar. Katsayı ve tarih kaydırma oturum başında bir kez seçilir:
   * - katsayı 0,35–0,85 ya da 1,15–2,60 arası (1'e yakın değerler gerçeği ele vermesin diye yok)
   * - kaydırma tam hafta (haftanın günü korunur), 6–52 hafta ileri ya da geri
   */
  function newKey() {
    const f = rnd() < 0.5 ? 0.35 + rnd() * 0.5 : 1.15 + rnd() * 1.45;
    const weeks = 6 + Math.floor(rnd() * 47);
    return {
      format: 'sirdas-anahtar-icerik', v: 1, created: new Date().toISOString(),
      factor: Math.round(f * 10000) / 10000, dayShift: (rnd() < 0.5 ? -1 : 1) * weeks * 7,
      entries: {}, excluded: [], scaled: { headers: [] }, dated: { headers: [] }, sheetNames: {}
    };
  }
  const TOKEN_IN_TEXT = /\[\s*([A-Z][A-Z0-9_]*_\d+(?:_(?:ILK|SON))?)\s*\]/g;

  /** Bu hesaplama için defter: mevcut anahtarı okur, yenileri `fresh`e yazar. */
  function makeLedger(key, reservedTokens) {
    const base = key.entries, fresh = {}, counts = {};
    const top = {};
    for (const e of Object.values(base)) if (!e.part) top[e.cat] = Math.max(top[e.cat] || 0, e.num);
    const alloc = cat => { let n = top[cat] || 0; do n++; while (reservedTokens && reservedTokens.has(cat + '_' + n)); top[cat] = n; return n; };
    const find = k => base[k] || fresh[k];
    const count = k => { counts[k] = (counts[k] || 0) + 1; };
    function get(cat, value, k) {
      let e = find(k);
      if (!e) { const num = alloc(cat); e = { key: k, cat, value: normValue(value), num, token: cat + '_' + num }; fresh[k] = e; }
      count(k); return e;
    }
    function part(parentKey, parentValue, partName, value) {
      const parent = get('AD', parentValue, parentKey); counts[parentKey]--;
      const k = parentKey + '#' + partName;
      let e = find(k);
      if (!e) { e = { key: k, cat: 'AD', value: normValue(value), num: parent.num, part: partName, parent: parentKey, token: parent.token + '_' + partName }; fresh[k] = e; }
      count(k); return e;
    }
    return { get, part, find, fresh, counts };
  }
  /** Hesaplamada üretilen yeni girdileri anahtara işler. Kopyalama ve indirmede çağrılır. */
  function commit(key, result) {
    Object.assign(key.entries, result.added || {});
    const u = result.keyUpdates || {};
    for (const h of u.scaled || []) if (!key.scaled.headers.includes(h)) key.scaled.headers.push(h);
    for (const h of u.dated || []) if (!key.dated.headers.includes(h)) key.dated.headers.push(h);
    Object.assign(key.sheetNames, u.sheetNames || {});
    return key;
  }
  function allEntries(key, extra) { return Object.values(Object.assign({}, key.entries, extra || {})); }

  /* ---------------- Metin maskeleme ---------------- */
  /**
   * opts: { auto, cats:[], manual:[{term,label}] }
   * Dönüş: { parts:[string|{t,v}], masked, added, counts, suggestions }
   */
  function maskText(text, key, opts = {}) {
    const reserved = new Set([...String(text).matchAll(TOKEN_IN_TEXT)].map(m => m[1]));
    const led = makeLedger(key, reserved);
    const res = analyzeString(text, key, led, opts, true);
    return { ...res, masked: partsToText(res.parts), added: led.fresh, counts: led.counts };
  }
  function textCtx(key, led, opts) {
    const excluded = new Set(key.excluded);
    const entries = allEntries(key, led.fresh);
    return {
      excluded,
      auto: !!opts.auto, cats: new Set(opts.cats || DEFAULT_CATS), manual: opts.manual || [],
      known: entries.filter(e => !excluded.has(e.key)),
      fullNames: entries.filter(e => e.cat === 'AD' && !e.part && e.value.includes(' ') && e.key.startsWith('AD|')).map(e => e.value)
    };
  }
  function analyzeString(text, key, led, opts, withSuggestions, preCtx) {
    const excluded = preCtx ? preCtx.excluded : new Set(key.excluded);
    const entries = preCtx ? null : allEntries(key, led.fresh);
    const ctx = preCtx || {
      auto: !!opts.auto, cats: new Set(opts.cats || DEFAULT_CATS), manual: opts.manual || [],
      known: entries.filter(e => !excluded.has(e.key)),
      fullNames: entries.filter(e => e.cat === 'AD' && !e.part && e.value.includes(' ') && e.key.startsWith('AD|')).map(e => e.value)
    };
    if (preCtx && !preCtx.matcherReady) { preCtx.matcherReady = true; }
    const taken = [], accepted = [];
    const cands = findCandidates(text, ctx).sort((x, y) => x.prio - y.prio || x.a - y.a || (y.b - y.a) - (x.b - x.a));
    for (const c of cands) {
      if (c.b <= c.a || taken.some(t => c.a < t.b && c.b > t.a)) continue;
      taken.push({ a: c.a, b: c.b }); accepted.push(c);
    }
    accepted.sort((x, y) => x.a - y.a);
    const parts = []; let last = 0;
    for (const s of accepted) {
      const e = s.part ? led.part(s.parent, s.parentValue, s.part, s.value) : led.get(s.cat, s.value, s.manualKey || keyOf(s.cat, s.value));
      if (s.a > last) parts.push(text.slice(last, s.a));
      if (excluded.has(e.key) || (e.parent && excluded.has(e.parent))) parts.push(text.slice(s.a, s.b));
      else parts.push({ t: e.token, v: s.value });
      last = s.b;
    }
    if (last < text.length) parts.push(text.slice(last));
    const suggestions = [];
    if (withSuggestions && ctx.auto) {
      const free = (a, b) => !taken.some(t => a < t.b && b > t.a), seen = new Set(opts.ignored || []);
      const addSug = (v, label, why) => { const k = clean(v); if (seen.has(k)) return; seen.add(k); suggestions.push({ value: v, label, why }); };
      for (const m of text.matchAll(/(?<![\d.,])\d{7,}(?![\d.,]*\d)/g)) if (free(m.index, m.index + m[0].length)) addSug(m[0], 'KAYIT_NO', m[0].length === 11 ? 'tc11' : 'longnum');
      const pairRe = new RegExp(`${L}\\p{Lu}\\p{Ll}{2,}[ \\t]+\\p{Lu}\\p{Ll}{2,}(?:[ \\t]+\\p{Lu}\\p{Ll}{2,})?${R}`, 'gu');
      for (const m of text.matchAll(pairRe)) { const w = m[0].split(/\s+/); if (free(m.index, m.index + m[0].length) && !w.some(x => STOP.has(tl(x)))) addSug(m[0], 'AD', 'name'); }
    }
    return { parts, suggestions: suggestions.slice(0, 8) };
  }
  /** Excel'den gelen tarih hücreleri yerel saatle gelir; yerel gün, ay, yıl kullanılır. */
  const fmtLocal = (d, lang) => { const p2 = x => String(x).padStart(2, '0'); return lang === 'en' ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` : `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}`; };
  const partToText = p => typeof p === 'string' ? p : p.t ? `[${p.t}]` : p.x instanceof Date ? fmtLocal(p.x) : String(p.x);
  const partsToText = parts => parts.map(partToText).join('');

  /* ---------------- 5. Sayı ve tarih ---------------- */
  function decimalsOf(n) { const s = String(n); if (/e/i.test(s)) return 0; const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; }
  /**
   * "412.000" "412000" "1.234,50" "1,234.50" "₺ 4.250,00" "12,5 kg" → { n, style }.
   * Tek nokta ve ardından tam 3 hane ("412.000") Türkçe binlik ayırıcı sayılır.
   */
  function parseNumber(v, hint) {
    if (typeof v === 'number') return isFinite(v) ? { n: v, style: null, decimals: decimalsOf(v) } : null;
    if (typeof v !== 'string') return null;
    const m = v.trim().match(/^([₺$€£]?\s?)([-−+]?)(\d[\d.,]*)(\s?(?:TL|TRY|USD|EUR|GBP|₺|\$|€|£|%|[\p{L}.]{1,6})?)$/u);
    if (!m) return null;
    const [, pre, sign, body, suf] = m;
    let grp = '', dec = '', intPart, frac = '';
    // "412.000" ve "215,767" belirsizdir: tek ayırıcı + 3 hane. Türkçede binlik, İngilizcede (hint 'en') binlik virgüldür.
    const en = hint === 'en';
    if (/^\d+$/.test(body)) intPart = body;
    else if (/^\d{1,3}(\.\d{3})+$/.test(body) && !(en && /^\d{1,3}\.\d{3}$/.test(body))) { grp = '.'; dec = ','; intPart = body.replace(/\./g, ''); }
    else if (/^\d{1,3}(,\d{3})+$/.test(body) && (en || /,\d{3},/.test(body))) { grp = ','; dec = '.'; intPart = body.replace(/,/g, ''); }
    else if (/^\d{1,3}(\.\d{3})*,\d+$/.test(body)) { grp = body.includes('.') ? '.' : ''; dec = ','; [intPart, frac] = body.replace(/\./g, '').split(','); }
    else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(body)) { grp = ','; dec = '.'; [intPart, frac = ''] = body.replace(/,/g, '').split('.'); }
    else if (/^\d+\.\d+$/.test(body)) { dec = '.'; [intPart, frac] = body.split('.'); }
    else return null;
    const n = (sign === '-' || sign === '−' ? -1 : 1) * Number(intPart + (frac ? '.' + frac : ''));
    if (!isFinite(n)) return null;
    return { n, decimals: frac.length, style: { pre, sign: sign === '−' ? '−' : '-', grp, dec: dec || (grp === '.' ? ',' : '.'), suf } };
  }
  function formatNumber(n, decimals, style) {
    if (!style) return Math.round(n * 10 ** decimals) / 10 ** decimals;
    const neg = n < 0, s = Math.abs(n).toFixed(decimals);
    let [i, f] = s.split('.');
    if (style.grp) i = i.replace(/\B(?=(\d{3})+(?!\d))/g, style.grp);
    return style.pre + (neg ? style.sign : '') + i + (f ? style.dec + f : '') + style.suf;
  }
  function niceStep(x) {
    if (!(x > 0)) return 1;
    const p = 10 ** Math.floor(Math.log10(x)), m = x / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  function shortNum(x, lang) {
    const a = Math.abs(x), tr = lang !== 'en';
    const u = a >= 1e9 ? [1e9, tr ? ' milyar' : 'bn'] : a >= 1e6 ? [1e6, tr ? ' milyon' : 'M'] : a >= 1e3 ? [1e3, tr ? ' bin' : 'k'] : [1, ''];
    let v = String(Math.round(x / u[0] * 10) / 10);
    if (tr) v = v.replace('.', ',');
    return v + u[1];
  }
  const bucketLabel = (n, step, lang) => { const lo = Math.floor(n / step) * step; return `${shortNum(lo, lang)}–${shortNum(lo + step, lang)}`; };

  const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MON_RE = [...MONTHS_TR, ...MONTHS_EN].join('|');
  const DATE_RE_SRC = `(?<![\\d.\\/-])(?:(\\d{1,2})([./-])(\\d{1,2})\\2(\\d{4})|(\\d{4})-(\\d{2})-(\\d{2})|(\\d{1,2})\\s+(${MON_RE})\\s+(\\d{4}))(?![\\d])`;
  const validYMD = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
  function dateFromMatch(m) {
    if (m[1]) { const d = +m[1], mo = +m[3], y = +m[4]; if (!validYMD(y, mo, d)) return null; return { d: new Date(Date.UTC(y, mo - 1, d)), fmt: { type: 'dmy', sep: m[2], pad: m[1].length === 2 && m[3].length === 2 } }; }
    if (m[5]) { const y = +m[5], mo = +m[6], d = +m[7]; if (!validYMD(y, mo, d)) return null; return { d: new Date(Date.UTC(y, mo - 1, d)), fmt: { type: 'iso' } }; }
    const en = MONTHS_EN.indexOf(m[9]) >= 0, mo = (en ? MONTHS_EN : MONTHS_TR).indexOf(m[9]) + 1, d = +m[8], y = +m[10];
    if (!validYMD(y, mo, d)) return null;
    return { d: new Date(Date.UTC(y, mo - 1, d)), fmt: { type: 'name', en } };
  }
  /** Hücrenin tamamı tarihse { d (UTC), fmt } */
  function parseDate(v) {
    if (v instanceof Date) return isNaN(v) ? null : { d: v, fmt: null, local: true };
    if (typeof v !== 'string') return null;
    const t = v.trim();
    const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)$/);
    if (iso) { if (!validYMD(+iso[1], +iso[2], +iso[3])) return null; return { d: new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3])), fmt: { type: 'iso' }, rest: iso[4] }; }
    const m = t.match(new RegExp('^' + DATE_RE_SRC + '$', 'u'));
    return m ? dateFromMatch(m) : null;
  }
  function formatDate(d, fmt) {
    const p2 = x => String(x).padStart(2, '0');
    const y = d.getUTCFullYear(), mo = d.getUTCMonth() + 1, da = d.getUTCDate();
    if (!fmt || fmt.type === 'iso') return `${y}-${p2(mo)}-${p2(da)}`;
    if (fmt.type === 'dmy') return fmt.pad ? `${p2(da)}${fmt.sep}${p2(mo)}${fmt.sep}${y}` : `${da}${fmt.sep}${mo}${fmt.sep}${y}`;
    return `${da} ${(fmt.en ? MONTHS_EN : MONTHS_TR)[mo - 1]} ${y}`;
  }
  function addDays(d, n, local) { const x = new Date(d.getTime()); if (local) x.setDate(x.getDate() + n); else x.setUTCDate(x.getUTCDate() + n); return x; }

  /* ---------------- 6. Tablo maskeleme ---------------- */
  /**
   * book: { sheets:[{ name, rows: string[][], raw?: any[][] }] }  (raw: Excel'deki ham sayı/tarih)
   * cfg: {
   *   sheets:[{ hdr, include, cols:{ [sütun]: { action, label, groups } }, cells:['r,c'], holes:['r,c'] }],
   *   propagate, auto, cats, manual:[{term,label}], hideSheetNames, lang, keepRows (önizleme satır sınırı), only (tek sayfa)
   * }
   * action: tag (etiketle) · drop (çıkar) · scale (katsayıyla ölçekle) · bucket (aralığa çevir) · date (tarihi kaydır) · group (grupla)
   *
   * Hücre çıktısı: değişmediyse özgün değer; değiştiyse { p:[parça] }.
   * Parça: metin | { t: etiket, v: özgün } | { x: yeni değer, v: özgün, k: 's'|'b'|'d'|'g' }
   */
  function maskBook(book, key, cfg) {
    const lang = cfg.lang || 'tr';
    const excluded = new Set(key.excluded);
    const reserved = new Set();
    for (const sh of book.sheets) for (const row of sh.rows) for (const v of row) if (v && v.indexOf('[') >= 0) for (const m of v.matchAll(TOKEN_IN_TEXT)) reserved.add(m[1]);
    const led = makeLedger(key, reserved);
    const stats = { hidden: 0, spread: 0, auto: 0, scaled: 0, bucketed: 0, dated: 0, grouped: 0, dropped: [], sheetsNoMask: [], headersOpen: [], cells: 0, rows: 0 };
    const keyUpdates = { scaled: [], dated: [], sheetNames: {} };
    const pool = new Map(); // gizlenen değer → etiket (başka hücrelerde aramak için)
    const addPool = (v, label) => { const t = normValue(v); if (canSpread(t) && !pool.has(clean(t))) pool.set(clean(t), { v: t, label }); };
    const outSheets = [];
    const sheetIdx = cfg.only != null ? [cfg.only] : book.sheets.map((_, i) => i);
    const LB = lang === 'en' ? { head: 'HEADER', col: 'COL_', sheet: 'Sheet' } : { head: 'BASLIK', col: 'SUTUN_', sheet: 'Sayfa' };
    const tagCell = (label, t) => { const e = led.get(label, t, 'V|' + clean(t)); if (excluded.has(e.key)) return null; stats.hidden++; addPool(t, label); return { p: [{ t: e.token, v: t }] }; };

    // 1. tur: seçili sütun ve hücreler
    for (const si of sheetIdx) {
      const sh = book.sheets[si], sc = Object.assign({ hdr: true, include: true, cols: {}, cells: [], holes: [] }, (cfg.sheets || [])[si]);
      const cells = new Set(sc.cells), holes = new Set(sc.holes);
      const head = sc.hdr ? (sh.rows[0] || []) : [];
      const headHidden = c => cells.has(`0,${c}`) && sc.hdr;
      const labelFor = c => { const rule = sc.cols[c]; if (rule && rule.label) return rule.label; const h = head[c] && String(head[c]).trim(); return (h && !headHidden(c) && slug(h)) || LB.col + colName(c); };
      const steps = {};
      for (const c in sc.cols) if (sc.cols[c].action === 'bucket') {
        let mx = 0; sh.rows.forEach((row, r) => { if (sc.hdr && r === 0) return; const p = parseNumber(sh.raw && sh.raw[r] && typeof sh.raw[r][c] === 'number' ? sh.raw[r][c] : row[c], lang); if (p) mx = Math.max(mx, Math.abs(p.n)); });
        steps[c] = niceStep(mx / 8);
      }
      const dropped = Object.keys(sc.cols).filter(c => sc.cols[c].action === 'drop').map(Number);
      const out = [];
      let changed = 0;
      sh.rows.forEach((row, r) => {
        const orow = new Array(row.length);
        row.forEach((v, c) => {
          const raw = sh.raw && sh.raw[r] ? sh.raw[r][c] : undefined;
          const t = v == null ? '' : String(v).trim();
          const k = `${r},${c}`, isHead = sc.hdr && r === 0;
          orow[c] = raw !== undefined && raw !== '' && typeof raw !== 'string' ? raw : v;
          if (!t || holes.has(k)) return;
          if (isHead) { if (cells.has(k)) { const o = tagCell(LB.head, t); if (o) { orow[c] = o; changed++; } } return; }
          const rule = sc.cols[c];
          let o = null;
          if (rule) {
            const label = labelFor(c);
            if (rule.action === 'drop') { addPool(t, label); return; }
            if (rule.action === 'scale') {
              const p = parseNumber(typeof raw === 'number' ? raw : t, lang);
              if (p) { const x = p.n * key.factor; o = { p: [{ x: formatNumber(x, p.style ? p.decimals : p.decimals + 2, p.style), v: t, k: 's' }] }; stats.scaled++; }
            } else if (rule.action === 'bucket') {
              const p = parseNumber(typeof raw === 'number' ? raw : t, lang);
              if (p) { o = { p: [{ x: bucketLabel(p.n, steps[c], lang), v: t, k: 'b' }] }; stats.bucketed++; }
            } else if (rule.action === 'date') {
              const p = parseDate(raw instanceof Date ? raw : t);
              if (p) { const d2 = addDays(p.d, key.dayShift, p.local); o = { p: [{ x: p.fmt === null ? d2 : formatDate(d2, p.fmt), v: t, k: 'd' }] }; stats.dated++; }
            } else if (rule.action === 'group') {
              const g = rule.groups && rule.groups[clean(t)];
              if (g) { o = { p: [{ x: g, v: t, k: 'g' }] }; stats.grouped++; addPool(t, label); }
            }
            if (!o) o = tagCell(label, t); // tag, ya da dönüştürülemeyen değer
          } else if (cells.has(k)) o = tagCell(labelFor(c), t);
          if (o) { orow[c] = o; changed++; }
        });
        out.push(orow);
      });
      for (const c in sc.cols) {
        const a = sc.cols[c].action, h = head[c] && String(head[c]).trim();
        if (a === 'scale' && h) keyUpdates.scaled.push(normHeader(h));
        if (a === 'date' && h) keyUpdates.dated.push(normHeader(h));
        if (h && !headHidden(c)) stats.headersOpen.push(h);
      }
      stats.dropped.push(...dropped.map(c => `${sh.name}: ${(head[c] && String(head[c]).trim()) || colName(c)}`));
      outSheets.push({ si, name: sh.name, sc, out, dropped, changed });
    }

    // 2. tur: seçilen değerler başka hücrelerde geçiyorsa onları da gizle; istenirse kişisel veri tespiti
    for (const m of cfg.manual || []) if (String(m.term).trim()) pool.set(clean(m.term), { v: normValue(m.term), label: m.label || 'OZEL' });
    if (cfg.propagate !== false) for (const e of Object.values(key.entries)) if (e.key.startsWith('V|') && !excluded.has(e.key) && !pool.has(clean(e.value))) pool.set(clean(e.value), { v: e.value, label: e.cat });
    const poolM = makeMatcher([...pool.values()].filter(p => cfg.propagate !== false || (cfg.manual || []).some(m => clean(m.term) === clean(p.v))).map(p => p.v));
    const autoOpts = { auto: true, cats: cfg.cats || DEFAULT_CATS, manual: [] };
    for (const os of outSheets) {
      const hdr = os.sc.hdr, drop = new Set(os.dropped), holes = new Set(os.sc.holes);
      os.out.forEach((row, r) => row.forEach((v, c) => {
        if (typeof v !== 'string' || !v || drop.has(c) || holes.has(`${r},${c}`)) return;
        const head = hdr && r === 0;
        let parts = [v], hit = false;
        if (poolM) {
          const o = []; let last = 0;
          for (const m of poolM(v)) {
            const pk = clean(m.text), p = pool.get(pk); if (!p) continue;
            const e = led.get(p.label, m.text, 'V|' + pk);
            if (excluded.has(e.key)) continue;
            if (m.index > last) o.push(v.slice(last, m.index));
            o.push({ t: e.token, v: m.text }); last = m.index + m.text.length; stats.spread++; hit = true;
          }
          if (hit) { if (last < v.length) o.push(v.slice(last)); parts = o; }
        }
        if (cfg.auto && !head) {
          let found = false;
          parts = parts.flatMap(p => {
            if (typeof p !== 'string' || !/\p{L}{3}|\d{7}/u.test(p)) return [p];
            const a = analyzeString(p, key, led, autoOpts, false);
            if (a.parts.some(x => typeof x !== 'string')) { found = true; stats.auto += a.parts.filter(x => typeof x !== 'string').length; }
            return a.parts;
          });
          hit = hit || found;
        }
        if (hit) { row[c] = { p: parts }; os.changed++; }
      }));
    }

    // 3. tur: sayfa adları, istatistik, sızıntı kontrolü
    const sheetsOut = [];
    let n = 0;
    for (const os of outSheets) {
      const include = os.sc.include !== false;
      if (include) n++;
      const outName = cfg.hideSheetNames ? `${LB.sheet} ${n}` : os.name;
      if (cfg.hideSheetNames && include) keyUpdates.sheetNames[outName] = os.name;
      if (include && !os.changed && !os.dropped.length) stats.sheetsNoMask.push(os.name);
      if (include) { stats.rows += os.out.length; stats.cells += os.out.reduce((a, r) => a + r.length, 0) - os.dropped.length * os.out.length; }
      sheetsOut.push({ index: os.si, name: os.name, outName, include, dropped: os.dropped, rows: cfg.keepRows ? os.out.slice(0, cfg.keepRows) : os.out, total: os.out.length });
    }
    const leaks = findLeaks(outSheets, pool, excluded, cfg);
    // Etiket adı da sızdırabilir: "Proje Atlas" başlıklı sütunun etiketi PROJE_ATLAS olur.
    const slugs = [...pool.values()].map(p => slug(p.v)).filter(x => x.length >= 3);
    for (const e of Object.values(led.fresh)) {
      const hit = slugs.find(x => ('_' + e.cat + '_').includes('_' + x + '_'));
      if (hit) { leaks.total++; if (leaks.list.length < 50) leaks.list.push({ value: e.cat, where: { label: e.token } }); }
    }
    return { sheets: sheetsOut, added: led.fresh, counts: led.counts, stats, leaks, keyUpdates };
  }

  /**
   * Çıktıda açık kalmış gizli değer var mı? Değer yayma açıkken hücrelerde kalamaz (hepsi değiştirilir),
   * bu yüzden hücreler yalnızca yayma kapalıyken taranır. Kullanıcının bilerek açtığı hücreler (delik) sayılmaz.
   */
  function findLeaks(outSheets, pool, excluded, cfg) {
    const vals = [...pool.values()].filter(p => !excluded.has('V|' + clean(p.v))).map(p => p.v);
    const match = makeMatcher(vals);
    const list = []; let total = 0;
    if (match) for (const os of outSheets) {
      if (os.sc.include === false) continue;
      const drop = new Set(os.dropped), holes = new Set(os.sc.holes);
      const check = (s, where) => { for (const m of match(String(s))) { total++; if (list.length < 50) list.push({ value: m.text, where }); } };
      if (!cfg.hideSheetNames) check(os.name, { sheet: os.name, cell: null });
      if (cfg.propagate !== false) continue;
      os.out.forEach((row, r) => row.forEach((v, c) => {
        if (drop.has(c) || holes.has(`${r},${c}`)) return;
        const where = { sheet: os.name, cell: colName(c) + (r + 1) };
        if (typeof v === 'string') check(v, where);
        else if (v && v.p) v.p.forEach(p => { if (typeof p === 'string') check(p, where); });
      }));
    }
    return { total, list };
  }

  /** Çıktıyı dışa aktarılabilir diziye çevirir (çıkarılan sütunlar atılır). */
  function cellValue(v) {
    if (!v || typeof v !== 'object' || v instanceof Date) return v == null ? '' : v;
    if (v.p.length === 1 && v.p[0].x !== undefined) return v.p[0].x;
    return v.p.map(partToText).join('');
  }
  function toAOA(sheetOut) {
    const drop = new Set(sheetOut.dropped);
    return sheetOut.rows.map(row => row.map(cellValue).filter((_, c) => !drop.has(c)));
  }
  /** CSV yazımı: ayırıcı, tırnak ya da satır sonu içeren değer tırnağa alınır; böylece dosya yeniden açıldığında her değer kendi sütununda kalır. */
  function toCSV(sheetOut, lang, d = ';') {
    const q = v => { const s = String(v); return (s.includes(d) || /["\r\n]/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return toAOA(sheetOut).map(r => r.map(v => q(v instanceof Date ? fmtLocal(v, lang) : v)).join(d)).join('\n');
  }
  function toTSV(sheetOut, lang) {
    const safe = s => String(s).replace(/[\t\r\n]+/g, ' ');
    return toAOA(sheetOut).map(r => r.map(v => safe(v instanceof Date ? fmtLocal(v, lang) : v)).join('\t')).join('\n');
  }

  /* ---------------- 7. Geri açma ---------------- */
  /**
   * opts: { off:[etiket türü], numbers:bool, dates:bool, numState:{sıra:bool} }
   * Parçalar: metin | {v, t} (etiket) | {num:true, i, from, to, on} | {date:true, from, to}
   */
  function restoreText(text, key, opts = {}) {
    const map = new Map(Object.values(key.entries).map(e => [e.token, e]));
    const off = new Set(opts.off || []);
    const re = /\\?\[\s*([A-Za-z][A-Za-z0-9_\\]*)\s*\\?\]|(?<![\p{L}\p{N}_[])([A-Z][A-Z0-9_]*_\d+(?:_(?:ILK|SON))?)(?![\p{L}\p{N}_])/gu;
    const out = []; let last = 0, done = 0;
    const unknown = new Set(), held = new Set(), harmony = [];
    for (const m of text.matchAll(re)) {
      const tok = m[2] || m[1].replace(/\\/g, '').toUpperCase();
      if (!/_\d+(?:_(?:ILK|SON))?$/.test(tok)) continue;
      const e = map.get(tok);
      if (!e) { if (m[1]) unknown.add(tok); continue; }
      if (off.has(e.cat)) { held.add(tok); continue; }
      if (m.index > last) out.push(text.slice(last, m.index));
      out.push({ v: e.value, t: tok, src: m[0] }); done++;
      last = m.index + m[0].length;
      const after = text.slice(last).match(/^['’](\p{L}+)/u);
      if (after && badHarmony(e.value, after[1])) harmony.push(`${e.value}'${after[1]}`);
    }
    if (last < text.length) out.push(text.slice(last));
    let parts = out, dates = 0, nums = 0;
    if (opts.dates && key.dated.headers.length) parts = splitDates(parts, key, () => dates++);
    if (opts.numbers && key.scaled.headers.length) parts = splitNumbers(parts, key, opts.numState || {}, () => nums++, opts.lang);
    return { parts, done, dates, nums, unknown: [...unknown], held: [...held], harmony: [...new Set(harmony)] };
  }
  function splitDates(parts, key, count) {
    const re = new RegExp(DATE_RE_SRC, 'gu');
    return parts.flatMap(p => {
      if (typeof p !== 'string') return [p];
      const o = []; let last = 0;
      for (const m of p.matchAll(re)) {
        const d = dateFromMatch(m); if (!d) continue;
        if (m.index > last) o.push(p.slice(last, m.index));
        o.push({ date: true, from: m[0], to: formatDate(addDays(d.d, -key.dayShift), d.fmt) }); count();
        last = m.index + m[0].length;
      }
      if (last < p.length) o.push(p.slice(last));
      return o;
    });
  }
  /** Yanıttaki sayılar: 100 ve üstü varsayılan olarak geri çevrilir; yüzde, yıl ve küçük sayılar dokunulmaz ama tıklanınca çevrilebilir. */
  function splitNumbers(parts, key, state, count, lang) {
    const re = /(?<![\p{L}\p{N}_.,%])[-−]?\d(?:[\d.,]*\d)?(?![\p{L}\p{N}_]|[.,]\d)/gu;
    let i = 0;
    return parts.flatMap(p => {
      if (typeof p !== 'string') return [p];
      const o = []; let last = 0;
      for (const m of p.matchAll(re)) {
        if (/^\s?%/.test(p.slice(m.index + m[0].length))) continue;
        const pn = parseNumber(m[0], lang); if (!pn) continue;
        if (/^(19|20)\d{2}$/.test(m[0])) continue;
        const idx = i++;
        const def = Math.abs(pn.n) >= 100;
        const on = state[idx] !== undefined ? state[idx] : def;
        const rr = roundest(pn.n / key.factor, pn.decimals, key.factor);
        if (m.index > last) o.push(p.slice(last, m.index));
        o.push({ num: true, i: idx, from: m[0], to: String(formatNumber(rr.n, rr.k, pn.style || { pre: '', sign: '-', grp: '', dec: '.', suf: '' })), on });
        if (on) count();
        last = m.index + m[0].length;
      }
      if (last < p.length) o.push(p.slice(last));
      return o;
    });
  }
  /**
   * Ölçeklenmiş sayıyı katsayıya bölerken: maskeli değerin son hanesi ±0,5 belirsizdir, bölünce bu ±0,5/katsayı olur.
   * Bu pencerenin içindeki en yuvarlak değeri seçeriz: 411999,996 → 412000.
   */
  function roundest(real, d, factor) {
    const tol = 0.5 * 10 ** -d / factor + 1e-9;
    for (let k = 0; k <= d + 2; k++) { const r = Math.round(real * 10 ** k) / 10 ** k; if (Math.abs(r - real) <= tol) return { n: r, k }; }
    return { n: real, k: d };
  }
  const restoredToText = parts => parts.map(p => typeof p === 'string' ? p : p.t ? p.v : p.date ? p.to : p.num ? (p.on ? p.to : p.from) : '').join('');

  /** Excel hücresi için geri açma. header: hücrenin sütun başlığı (ölçeklenen/kaydırılan sütunları tanımak için). */
  function restoreValue(value, key, opts, header) {
    const h = header != null ? normHeader(header) : null;
    if (typeof value === 'number') {
      if (opts.numbers && h && key.scaled.headers.includes(h)) return { value: roundest(value / key.factor, decimalsOf(value), key.factor).n, changed: 1 };
      return { value, changed: 0 };
    }
    if (value instanceof Date) {
      if (opts.dates && h && key.dated.headers.includes(h)) return { value: addDays(value, -key.dayShift, true), changed: 1 };
      return { value, changed: 0 };
    }
    if (typeof value !== 'string') return { value, changed: 0 };
    const numCol = opts.numbers && h && key.scaled.headers.includes(h);
    const dateCol = opts.dates && h && key.dated.headers.includes(h);
    const r = restoreText(value, key, { off: opts.off, numbers: numCol, dates: dateCol, numState: {}, lang: opts.lang });
    const changed = r.done + r.dates + r.nums;
    return { value: changed ? restoredToText(r.parts) : value, changed, unknown: r.unknown };
  }

  function badHarmony(value, suffix) {
    const vowels = s => tl(s).match(/[aıoueiöü]/g);
    const v = vowels(value), sv = vowels(suffix);
    if (!v || !sv || /\d$/.test(value)) return false;
    const allowed = { a: 'aı', ı: 'aı', o: 'au', u: 'au', e: 'ei', i: 'ei', ö: 'eü', ü: 'eü' }[v[v.length - 1]];
    return !allowed.includes(sv[0]);
  }

  /* ---------------- 8. Şablonlar ---------------- */
  /** Sütun kurallarını başlık adına göre kaydeder; aynı başlıklı her dosyaya uygulanabilir. */
  function makeProfile(name, book, cfg) {
    const columns = [], seen = new Set();
    book.sheets.forEach((sh, si) => {
      const sc = (cfg.sheets || [])[si]; if (!sc || !sc.hdr) return;
      for (const c in sc.cols) {
        const h = sh.rows[0] && String(sh.rows[0][c] || '').trim(); if (!h) continue;
        const n = normHeader(h); if (seen.has(n)) continue; seen.add(n);
        const rule = sc.cols[c];
        columns.push({ header: h, action: rule.action || 'tag', label: rule.label || '', groups: rule.action === 'group' ? rule.groups || {} : undefined, hideHeader: (sc.cells || []).includes(`0,${c}`) || undefined });
      }
    });
    return {
      format: 'sirdas-sablon', v: 1, name: String(name || '').trim() || 'Şablon', created: new Date().toISOString(),
      options: { propagate: cfg.propagate !== false, auto: !!cfg.auto, cats: cfg.cats || DEFAULT_CATS, hideSheetNames: !!cfg.hideSheetNames },
      columns, terms: (cfg.manual || []).map(m => ({ term: m.term, label: m.label || 'OZEL' }))
    };
  }
  function validProfile(p) { return p && p.format === 'sirdas-sablon' && Array.isArray(p.columns); }
  /** Şablonu kitaba uygular. Dönüş: { cfg, matched:[başlık], missing:[başlık] } */
  function applyProfile(book, profile, baseCfg) {
    const cfg = JSON.parse(JSON.stringify(baseCfg || {}));
    cfg.sheets = book.sheets.map((_, i) => Object.assign({ hdr: true, include: true, cols: {}, cells: [], holes: [] }, (cfg.sheets || [])[i] || {}));
    const found = new Set();
    book.sheets.forEach((sh, si) => {
      const sc = cfg.sheets[si]; if (!sc.hdr) return;
      (sh.rows[0] || []).forEach((h, c) => {
        const rule = profile.columns.find(x => normHeader(x.header) === normHeader(h || ''));
        if (!rule) return;
        found.add(normHeader(rule.header));
        sc.cols[c] = { action: rule.action, label: rule.label || '', groups: rule.groups ? { ...rule.groups } : undefined };
        if (rule.hideHeader && !sc.cells.includes(`0,${c}`)) sc.cells.push(`0,${c}`);
      });
    });
    Object.assign(cfg, profile.options || {});
    const terms = profile.terms || [];
    cfg.manual = (cfg.manual || []).concat(terms.filter(t => !(cfg.manual || []).some(m => clean(m.term) === clean(t.term))));
    const matched = profile.columns.filter(x => found.has(normHeader(x.header))).map(x => x.header);
    const missing = profile.columns.filter(x => !found.has(normHeader(x.header))).map(x => x.header);
    return { cfg, matched, missing };
  }
  /** Şablonun bu kitaba ne kadar uyduğu (0–1): şablondaki başlıkların kaçı dosyada var. */
  function profileScore(book, profile) {
    if (!profile.columns.length) return 0;
    const heads = new Set(); book.sheets.forEach(sh => (sh.rows[0] || []).forEach(h => heads.add(normHeader(h || ''))));
    return profile.columns.filter(x => heads.has(normHeader(x.header))).length / profile.columns.length;
  }

  /* ---------------- 9. Şifreleme ---------------- */
  const b64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const ITER = 250000;
  async function deriveKey(pass, salt, iter) {
    const subtle = globalThis.crypto.subtle;
    const k = await subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  /** Anahtarı parolayla şifreler (PBKDF2-SHA256 250.000 tur + AES-GCM 256). Dosya olarak saklanabilir JSON döndürür. */
  async function encryptKey(key, pass) {
    if (!pass || pass.length < 8) throw new Error('short_password');
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16)), iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(JSON.stringify(key));
    const ct = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deriveKey(pass, salt, ITER), data));
    return { format: 'sirdas-anahtar', v: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITER }, cipher: 'AES-GCM-256', salt: b64(salt), iv: b64(iv), data: b64(ct), entries: Object.keys(key.entries).length, created: key.created };
  }
  async function decryptKey(file, pass) {
    if (!file || file.format !== 'sirdas-anahtar') throw new Error('not_key');
    const pt = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(file.iv) }, await deriveKey(pass, unb64(file.salt), file.kdf.iterations), unb64(file.data));
    return upgradeKey(JSON.parse(new TextDecoder().decode(pt)));
  }
  /** Eski biçimleri (Örtü) tamamlar. */
  function upgradeKey(k) {
    const base = newKey();
    if (Array.isArray(k.entries)) { const o = {}; k.entries.forEach(e => { o[e.key.replace(/^OZEL\|/, 'V|')] = Object.assign({}, e, { key: e.key.replace(/^OZEL\|/, 'V|') }); }); k.entries = o; }
    return Object.assign(base, k, { scaled: Object.assign({ headers: [] }, k.scaled), dated: Object.assign({ headers: [] }, k.dated), sheetNames: k.sheetNames || {}, excluded: k.excluded || [] });
  }
  /** Birden çok anahtarı birleştirir (ilk anahtarın katsayısı ve kaydırması korunur). */
  function mergeKeys(into, other) {
    for (const [k, e] of Object.entries(other.entries)) if (!into.entries[k]) {
      const clash = Object.values(into.entries).some(x => x.token === e.token && x.key !== k);
      if (!clash) into.entries[k] = e;
    }
    for (const k of other.excluded) if (!into.excluded.includes(k)) into.excluded.push(k);
    return into;
  }

  /* ---------------- 10. Tablo okuma yardımcıları ---------------- */
  /** Excel'den kopyalanan ya da CSV metnini satır/sütun dizisine çevirir. */
  function parseTable(text) {
    // Satırlara tırnak dışındaki satır sonlarından böl: tırnak içinde satır sonu olan hücre tek hücre kalır.
    const src = String(text).replace(/\r\n?/g, '\n'), lines = []; let st = 0, q = false;
    for (let i = 0; i <= src.length; i++) {
      if (i === src.length || (src[i] === '\n' && !q)) { lines.push(src.slice(st, i)); st = i + 1; }
      else if (src[i] === '"') q = !q;
    }
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (!lines.length) return null;
    const d = ['\t', ';', '|', ','].map(x => [x, splitCells(lines[0], x).length]).sort((a, b) => b[1] - a[1])[0][0];
    const unq = t => { const v = t.trim(); return /^".*"$/s.test(v) ? v.slice(1, -1).replace(/""/g, '"') : v; };
    return lines.map(l => splitCells(l, d).map(c => unq(c.t)));
  }
  /** Kitabı her satırı aynı genişlikte, metin hücreli hale getirir. */
  /**
   * Kitabı her satırı aynı genişlikte, metin hücreli hale getirir.
   * pos: { r:[Excel satır no (0'dan)], c0: ilk sütun } — biçimi koruyan çıktıda hücreyi asıl yerine yazmak için.
   */
  function makeSheet(name, rows, raw, pos, hidden) {
    const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
    const fix = rs => rs.map(r => { const x = r.slice(); while (x.length < w) x.push(''); return x; });
    return { name: String(name), rows: fix(rows).map(r => r.map(v => v == null ? '' : String(v))), raw: raw ? fix(raw) : null, w, pos: pos || null, hidden: !!hidden };
  }


  /* ---------------- 11. Çok parçalı metin (Word, PowerPoint, PDF) ---------------- */
  /**
   * Birçok metni tek defterle maskeler: aynı değer her paragrafta aynı etiketi alır.
   * İki tur çalışır: ilk turda bulunan bir ad, ikinci turda önceki paragraflarda da gizlenir.
   */
  function maskTexts(texts, key, opts = {}) {
    const reserved = new Set();
    for (const t of texts) for (const m of String(t).matchAll(TOKEN_IN_TEXT)) reserved.add(m[1]);
    const led = makeLedger(key, reserved);
    const run = () => { const ctx = textCtx(key, led, opts); return texts.map(t => (t && /[\p{L}\p{N}]/u.test(t)) ? analyzeString(t, key, led, opts, false, ctx).parts : [t]); };
    run();
    for (const k in led.counts) led.counts[k] = 0;
    const parts = run();
    for (const k in led.counts) if (!led.counts[k]) delete led.counts[k];
    return { parts, added: led.fresh, counts: led.counts, hidden: parts.reduce((a, ps) => a + ps.filter(p => typeof p !== 'string').length, 0) };
  }

  /* ---------------- 12. XML tarayıcı (biçimi koruyarak metin değiştirme) ---------------- */
  const decodeXml = s => s.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|(lt|gt|amp|quot|apos));/g, (m, d, h, n) => d ? String.fromCodePoint(+d) : h ? String.fromCodePoint(parseInt(h, 16)) : { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[n]);
  const encodeXml = (s, attr) => { s = String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); return attr ? s.replace(/"/g, '&quot;') : s; };
  const localName = q => q.slice(q.indexOf(':') + 1);
  /**
   * XML'i DOM kurmadan tarar. Dönüş: düğümler listesi.
   *  { kind:'text', start, end, value, path, tag, group, openStart, openEnd }  (start-end: içerik aralığı)
   *  { kind:'attr', start, end, value, path, name, element }
   *  { kind:'elem', start, end, path }   (öğenin tamamı; alan çıkarmada kullanılır)
   * textTags verilirse yalnızca o öğelerin metni alınır (Word: w:t), verilmezse her metin düğümü.
   * paraTags: aynı paragraftaki metin düğümleri aynı grubu alır.
   */
  function xmlScan(xml, opt = {}) {
    const textTags = opt.textTags ? new Set(opt.textTags) : null, paraTags = new Set(opt.paraTags || []);
    const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
    const out = [], stack = [], paras = [];
    let gid = 0, m, last = 0;
    const path = () => stack.map(x => x.local).join('/');
    const pushText = (a, b, raw, cdata) => {
      if (textTags || b <= a) return;
      if (!/\S/.test(raw)) return;
      out.push({ kind: 'text', start: a, end: b, value: cdata ? raw : decodeXml(raw), path: path(), tag: stack.length ? stack[stack.length - 1].name : '', group: ++gid, cdata: !!cdata });
    };
    while ((m = re.exec(xml))) {
      if (m.index > last) pushText(last, m.index, xml.slice(last, m.index));
      last = re.lastIndex;
      if (m[1] !== undefined) { pushText(m.index + 9, re.lastIndex - 3, m[1], true); continue; }
      if (!m[3]) continue;
      const close = m[2] === '/', self = m[5] === '/', name = m[3], local = localName(name);
      if (close) {
        const top = stack.pop();
        if (top && opt.elements) out.push({ kind: 'elem', start: top.start, end: re.lastIndex, path: stack.map(x => x.local).concat(top.local).join('/') });
        if (paraTags.has(name)) paras.pop();
        continue;
      }
      if (opt.attrs && m[4]) {
        const base = m.index + 1 + name.length, ar = /\s+([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g; let a;
        while ((a = ar.exec(m[4]))) {
          const vs = base + a.index + a[0].length - a[2].length + 1, val = a[3] !== undefined ? a[3] : a[4];
          if (/^xmlns(:|$)/.test(a[1])) continue;
          out.push({ kind: 'attr', start: vs, end: vs + val.length, value: decodeXml(val), path: stack.map(x => x.local).concat(local).join('/') + '/@' + localName(a[1]), name: a[1], element: name, attrStart: base + a.index, attrEnd: base + a.index + a[0].length });
        }
      }
      if (self) { if (opt.elements) out.push({ kind: 'elem', start: m.index, end: re.lastIndex, path: stack.map(x => x.local).concat(local).join('/') }); continue; }
      if (paraTags.has(name)) paras.push(++gid);
      if (textTags && textTags.has(name)) {
        const endTag = '</' + name + '>', ci = xml.indexOf(endTag, re.lastIndex);
        if (ci < 0) continue;
        out.push({ kind: 'text', start: re.lastIndex, end: ci, value: decodeXml(xml.slice(re.lastIndex, ci)), path: path() + '/' + local, tag: name, group: paras.length ? paras[paras.length - 1] : ++gid, openStart: m.index, openEnd: re.lastIndex });
        re.lastIndex = ci + endTag.length; last = re.lastIndex;
        continue;
      }
      stack.push({ name, local, start: m.index });
    }
    return out;
  }
  /** Aralıkları (start, end, text) uygulayarak yeni XML üretir. Aralıklar çakışmamalı. */
  function xmlApply(xml, edits) {
    edits = edits.slice().sort((a, b) => a.start - b.start);
    let o = '', last = 0;
    for (const e of edits) { if (e.start < last) continue; o += xml.slice(last, e.start) + e.text; last = e.end; }
    return o + xml.slice(last);
  }
  /**
   * Bir paragrafın metin düğümlerine maskelenmiş parçaları dağıtır.
   * Etiket, değerin başladığı düğüme yazılır; değerin diğer düğümlerdeki harfleri silinir. Böylece "Proje " + "Atlas"
   * iki ayrı biçimde yazılmış olsa da tek etikete döner ve ilk parçanın biçimini alır.
   * render(p): parçayı metne çevirir (maskelemede "[ETIKET]", geri açmada gerçek değer).
   */
  function redistribute(texts, parts, render) {
    const bounds = []; let pos = 0;
    for (const t of texts) { bounds.push([pos, pos + t.length]); pos += t.length; }
    const out = texts.map(() => '');
    const nodeAt = o => { for (let i = 0; i < bounds.length; i++) if (o < bounds[i][1] || i === bounds.length - 1) return i; return 0; };
    let o = 0;
    for (const p of parts) {
      if (typeof p === 'string') {
        let i = 0;
        while (i < p.length) { const n = nodeAt(o), take = Math.min(p.length - i, Math.max(1, bounds[n][1] - o)); out[n] += p.slice(i, i + take); i += take; o += take; }
      } else { const len = (p.src != null ? p.src : p.from != null ? p.from : p.v).length; out[nodeAt(o)] += render(p); o += len; }
    }
    return out;
  }

  /* ---------------- 13. JSON ve XML: alan yoluna göre seçim ---------------- */
  /** JSON'da her değerin yolu: "siparisler[].musteri.ad". Callback(yol, değer, kap, anahtar) */
  function walkJSON(v, fn, path = '', holder = null, k = null) {
    if (Array.isArray(v)) { v.forEach((x, i) => walkJSON(x, fn, path + '[]', v, i)); return; }
    if (v && typeof v === 'object') { for (const key of Object.keys(v)) walkJSON(v[key], fn, path ? path + '.' + key : key, v, key); return; }
    fn(path, v, holder, k);
  }
  /** Rakamlardan oluşan, başında 0 olan ya da 7+ haneli metin bir koddur (VKN, T.C. kimlik, sipariş/müşteri no): tutar gibi
   *  ölçeklenmez, etiketlenir. Ölçeklemek bir gerçek değeri bilen herkese katsayıyı, dolayısıyla diğer kodları da açar. */
  const isCodeLike = v => typeof v === 'string' && /^\s*\d+\s*$/.test(v) && (/^\s*0\d/.test(v) || v.trim().length >= 7);
  const lastSeg = p => String(p).replace(/\[\]/g, '').split(/[./]/).filter(Boolean).pop() || p;
  /** Alanların listesi: yol, adet, tür, örnek. kind: 'json' | 'xml' */
  function structFields(text, kind) {
    const map = new Map();
    const add = (path, v) => {
      let f = map.get(path); if (!f) { f = { path, name: lastSeg(path).replace(/^@/, ''), count: 0, num: 0, date: 0, str: 0, samples: [] }; map.set(path, f); }
      f.count++;
      if (isCodeLike(v)) f.str++;
      else if (typeof v === 'number' || (typeof v === 'string' && parseNumber(v))) f.num++;
      else if (typeof v === 'string' && parseDate(v)) f.date++;
      else f.str++;
      if (f.samples.length < 3 && v !== '' && v != null && !f.samples.includes(String(v))) f.samples.push(String(v));
    };
    if (kind === 'json') walkJSON(JSON.parse(text), (p, v) => { if (v !== null && typeof v !== 'boolean') add(p, v); });
    else for (const n of xmlScan(text, { attrs: true })) if (n.kind === 'text' || n.kind === 'attr') add(n.path, n.value);
    return [...map.values()].map(f => Object.assign(f, { type: f.date / f.count >= 0.7 ? 'date' : f.num / f.count >= 0.7 ? 'number' : 'text' }));
  }
  /**
   * JSON ya da XML'i alan kurallarına göre maskeler; yapı ve (XML'de) biçim aynen kalır.
   * cfg: { rules:{ yol: {action,label,groups} }, propagate, auto, cats, manual, lang }
   */
  function maskStruct(text, kind, key, cfg) {
    const lang = cfg.lang || 'tr', rules = cfg.rules || {};
    const excluded = new Set(key.excluded);
    const reserved = new Set([...String(text).matchAll(TOKEN_IN_TEXT)].map(m => m[1]));
    const led = makeLedger(key, reserved);
    const stats = { hidden: 0, spread: 0, auto: 0, scaled: 0, bucketed: 0, dated: 0, grouped: 0, dropped: [] };
    const keyUpdates = { scaled: [], dated: [], sheetNames: {} };
    const pool = new Map();
    const addPool = (v, label) => { const t = normValue(v); if (canSpread(t) && !pool.has(clean(t))) pool.set(clean(t), { v: t, label }); };
    const steps = {};
    const fields = structFields(text, kind);
    for (const f of fields) {
      const r = rules[f.path]; if (!r) continue;
      if (r.action === 'scale') keyUpdates.scaled.push(normHeader(f.name));
      if (r.action === 'date') keyUpdates.dated.push(normHeader(f.name));
      if (r.action === 'drop') stats.dropped.push(f.path);
      if (r.action === 'bucket') steps[f.path] = 1;
    }
    if (Object.keys(steps).length) {
      const mx = {};
      const see = (p, v) => { if (steps[p]) { const n = parseNumber(typeof v === 'number' ? v : String(v), lang); if (n) mx[p] = Math.max(mx[p] || 0, Math.abs(n.n)); } };
      if (kind === 'json') walkJSON(JSON.parse(text), see); else xmlScan(text, { attrs: true }).forEach(n => n.value !== undefined && see(n.path, n.value));
      for (const p in steps) steps[p] = niceStep((mx[p] || 1) / 8);
    }
    /** Tek bir değeri kurala göre dönüştürür. Dönüş: yeni değer ya da null (değişmedi). */
    function apply(path, v) {
      const r = rules[path]; if (!r || v == null || v === '' || typeof v === 'boolean') return null;
      const t = String(v).trim(), label = r.label || slug(lastSeg(path).replace(/^@/, '')) || 'ALAN';
      const tag = () => { const e = led.get(label, t, 'V|' + clean(t)); if (excluded.has(e.key)) return null; stats.hidden++; addPool(t, label); return `[${e.token}]`; };
      if (r.action === 'scale') { const p = parseNumber(typeof v === 'number' ? v : t, lang); if (p) { stats.scaled++; const x = formatNumber(p.n * key.factor, typeof v === 'number' ? p.decimals + 2 : p.decimals, typeof v === 'number' ? null : p.style); return typeof v === 'number' ? x : String(x); } }
      else if (r.action === 'bucket') { const p = parseNumber(typeof v === 'number' ? v : t, lang); if (p) { stats.bucketed++; return bucketLabel(p.n, steps[path], lang); } }
      else if (r.action === 'date') { const p = parseDate(t); if (p) { stats.dated++; return formatDate(addDays(p.d, key.dayShift), p.fmt) + (p.rest || ''); } }
      else if (r.action === 'group') { const g = r.groups && r.groups[clean(t)]; if (g) { stats.grouped++; addPool(t, label); return g; } }
      else if (r.action === 'drop') { addPool(t, label); return undefined; }
      return tag();
    }
    for (const m of cfg.manual || []) if (String(m.term).trim()) pool.set(clean(m.term), { v: normValue(m.term), label: m.label || 'OZEL' });
    if (cfg.propagate !== false) for (const e of Object.values(key.entries)) if (e.key.startsWith('V|') && !excluded.has(e.key) && !pool.has(clean(e.value))) pool.set(clean(e.value), { v: e.value, label: e.cat });
    const autoOpts = { auto: true, cats: cfg.cats || DEFAULT_CATS, manual: [] };
    let poolM = null;
    const spread = (s) => {
      if (typeof s !== 'string' || !s) return null;
      let parts = [s], hit = false;
      if (poolM) {
        const o = []; let last = 0;
        for (const m of poolM(s)) {
          const pk = clean(m.text), p = pool.get(pk); if (!p) continue;
          const e = led.get(p.label, m.text, 'V|' + pk); if (excluded.has(e.key)) continue;
          if (m.index > last) o.push(s.slice(last, m.index));
          o.push({ t: e.token, v: m.text }); last = m.index + m.text.length; stats.spread++; hit = true;
        }
        if (hit) { if (last < s.length) o.push(s.slice(last)); parts = o; }
      }
      if (cfg.auto) parts = parts.flatMap(p => { if (typeof p !== 'string' || !/\p{L}{3}|\d{7}/u.test(p)) return [p]; const a = analyzeString(p, key, led, autoOpts, false); const n = a.parts.filter(x => typeof x !== 'string').length; if (n) { hit = true; stats.auto += n; } return a.parts; });
      return hit ? partsToText(parts) : null;
    };
    let out;
    if (kind === 'json') {
      const data = JSON.parse(text);
      const indent = (text.match(/\n([ \t]+)"/) || [, '  '])[1];
      const touched = new Set();
      const pass1 = (v, path) => {
        if (Array.isArray(v)) { const res = []; for (const x of v) { const y = pass1(x, path + '[]'); if (y !== undefined) res.push(y); } return res; }
        if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) { const p = path ? path + '.' + k : k; const y = pass1(v[k], p); if (y !== undefined) o[k] = y; } return o; }
        const x = apply(path, v); if (x === undefined) return undefined; if (x !== null) { touched.add(path); return { __s: x }; } return v;
      };
      const tmp = pass1(data, '');
      poolM = makeMatcher([...pool.values()].map(p => p.v));
      const pass2 = v => {
        if (Array.isArray(v)) return v.map(pass2);
        if (v && typeof v === 'object') {
          if ('__s' in v && Object.keys(v).length === 1) return v.__s;
          const o = {}; for (const k of Object.keys(v)) { const nk = (cfg.propagate !== false && spread(k)) || k; o[nk] = pass2(v[k]); } return o;
        }
        const y = spread(v); return y !== null ? y : v;
      };
      out = JSON.stringify(pass2(tmp), null, /\n/.test(text) ? indent : undefined);
    } else {
      const nodes = xmlScan(text, { attrs: true, elements: true });
      const edits = [], dropRanges = [];
      for (const n of nodes) {
        if (n.kind === 'elem') { if (rules[n.path] && rules[n.path].action === 'drop') dropRanges.push([n.start, n.end]); continue; }
        const x = apply(n.path, n.value);
        if (x === undefined) { if (n.kind === 'attr') edits.push({ start: n.attrStart, end: n.attrEnd, text: '' }); continue; }
        if (x !== null) { n.done = true; edits.push({ start: n.start, end: n.end, text: n.cdata ? String(x) : encodeXml(x, n.kind === 'attr') }); }
      }
      // metin düğümü yolu "a/b" iken öğe yolu da "a/b"dir: çıkar kuralı öğeyi tamamen siler
      poolM = makeMatcher([...pool.values()].map(p => p.v));
      for (const n of nodes) {
        if (n.kind === 'elem' || n.done || (rules[n.path] && rules[n.path].action === 'drop')) continue;
        const y = spread(n.value); if (y !== null) edits.push({ start: n.start, end: n.end, text: n.cdata ? y : encodeXml(y, n.kind === 'attr') });
      }
      const inDrop = e => dropRanges.some(([a, b]) => e.start >= a && e.end <= b);
      out = xmlApply(text, edits.filter(e => !inDrop(e)).concat(dropRanges.map(([a, b]) => ({ start: a, end: b, text: '' }))));
    }
    return { masked: out, added: led.fresh, counts: led.counts, stats, keyUpdates, fields };
  }
  /** JSON ya da XML yanıtını geri açar; ölçeklenen/kaydırılan alanlar alan adıyla tanınır. */
  function restoreStruct(text, kind, key, opts = {}) {
    let done = 0; const unknown = new Set();
    const one = (v, name) => { const r = restoreValue(v, key, opts, name); done += r.changed; (r.unknown || []).forEach(u => unknown.add(u)); return r.value; };
    if (kind === 'json') {
      let data; try { data = JSON.parse(text); } catch { const r = restoreText(text, key, { off: opts.off }); return { text: restoredToText(r.parts), done: r.done, unknown: r.unknown }; }
      const walk = (v, name) => {
        if (Array.isArray(v)) return v.map(x => walk(x, name));
        if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[one(k, null)] = walk(v[k], k); return o; }
        return (typeof v === 'string' || typeof v === 'number') ? one(v, name) : v;
      };
      const indent = (text.match(/\n([ \t]+)"/) || [, '  '])[1];
      return { text: JSON.stringify(walk(data, null), null, /\n/.test(text) ? indent : undefined), done, unknown: [...unknown] };
    }
    const edits = [];
    for (const n of xmlScan(text, { attrs: true })) {
      const r = restoreValue(n.value, key, opts, lastSeg(n.path).replace(/^@/, ''));
      (r.unknown || []).forEach(u => unknown.add(u));
      if (r.changed) { done += r.changed; const v = r.value instanceof Date ? formatDate(r.value, null) : r.value; edits.push({ start: n.start, end: n.end, text: n.cdata ? String(v) : encodeXml(v, n.kind === 'attr') }); }
    }
    return { text: xmlApply(text, edits), done, unknown: [...unknown] };
  }

  /* ================= Dosya sınırları ================= */
  // Büyük bir dosya, özellikle telefonda sekmeyi kilitleyip o anki çalışmayı kaybettirebilir. Okumadan önce:
  // dosya boyutu (app.js), Office/Excel'de açılmış toplam içerik ve parça sayısı (zip dizini), PDF'te sayfa sayısı.
  const MB = 1024 * 1024;
  const LIMITS = {
    file: { sheet: 30 * MB, office: 40 * MB, pdf: 60 * MB, text: 20 * MB },
    inflated: 250 * MB, // Office/Excel dosyası açıldığında toplam içerik
    entries: 10000, // zip içindeki parça sayısı
    pdfPages: 500,
  };
  const limitError = (code, extra) => Object.assign(new Error(code), { code }, extra || {});
  /**
   * Zip'in (xlsx, docx, pptx, ods) merkezi dizininden açılmış toplam boyutu ve parça sayısını okur;
   * hiçbir parçayı açmaz. Zip değilse null. ZIP64 (4 GB üstü alanlar) "çok büyük" sayılır.
   */
  function zipInflated(bytes) {
    const n = bytes.length;
    if (n < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return null;
    const u16 = o => bytes[o] | (bytes[o + 1] << 8), u32 = o => (u16(o) | (u16(o + 2) << 16)) >>> 0;
    let eocd = -1;
    for (let o = n - 22; o >= Math.max(0, n - 22 - 65535); o--) if (u32(o) === 0x06054b50) { eocd = o; break; }
    if (eocd < 0) return null;
    const count = u16(eocd + 10), cdSize = u32(eocd + 12), cdOff = u32(eocd + 16);
    if (count === 0xffff || cdOff === 0xffffffff || cdSize === 0xffffffff) return { total: Infinity, entries: count, zip64: true };
    let o = cdOff, total = 0, entries = 0;
    while (o + 46 <= n && u32(o) === 0x02014b50) {
      const size = u32(o + 24);
      if (size === 0xffffffff) return { total: Infinity, entries, zip64: true };
      total += size; entries++;
      o += 46 + u16(o + 28) + u16(o + 30) + u16(o + 32);
    }
    return { total, entries, zip64: false };
  }
  /** Zip açılmadan önce çağrılır; sınırı aşarsa code: 'too_big_inflated' hatası atar. */
  function checkZip(bytes, limits = LIMITS) {
    const z = zipInflated(bytes);
    if (z && (z.total > limits.inflated || z.entries > limits.entries)) throw limitError('too_big_inflated', { total: z.total, entries: z.entries });
    return z;
  }
  /** Dosya türünün okuma öncesi boyut sınırı (bayt). */
  function fileLimit(ext, limits = LIMITS) {
    if (['xlsx', 'xlsm', 'xls', 'ods'].includes(ext)) return limits.file.sheet;
    if (['docx', 'pptx'].includes(ext)) return limits.file.office;
    if (ext === 'pdf') return limits.file.pdf;
    return limits.file.text;
  }

  return {
    VERSION, CATS, DEFAULT_CATS,
    tl, clean, slug, colName, normHeader, termSource, canSpread, makeMatcher,
    validTCKN, validVKN, validIBAN, luhn, isCodeLike,
    suggestColumns, newKey, upgradeKey, mergeKeys, commit, allEntries,
    maskText, maskBook, toAOA, toTSV, toCSV, cellValue, partsToText,
    restoreText, restoreValue, restoredToText,
    parseNumber, formatNumber, parseDate, formatDate, fmtLocal, addDays, niceStep, bucketLabel,
    makeProfile, applyProfile, profileScore, validProfile,
    encryptKey, decryptKey, parseTable, makeSheet,
    maskTexts, xmlScan, xmlApply, decodeXml, encodeXml, redistribute, structFields, maskStruct, restoreStruct, walkJSON, decimalsOf: n => decimalsOf(n), roundest,
    LIMITS, limitError, zipInflated, checkZip, fileLimit
  };
});
