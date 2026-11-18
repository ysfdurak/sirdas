// Sırdaş derleme: tek kaynaktan üç çıktı.
//   index.html      → Türkçe site sayfası (sirdas.ysfdurak.com)
//   en/index.html   → İngilizce site sayfası
//   dist/artifact.html → claude.ai sayfası (kütüphaneler jsDelivr'den, betikler gömülü)
// Kullanım: node tools/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = new URL('..', import.meta.url).pathname;
const read = p => readFileSync(root + p, 'utf8');
const { STR } = require(root + 'src/i18n.js');
const { VERSION } = require(root + 'src/core.js');
const SITE = 'https://sirdas.ysfdurak.com';
const src = read('web/source.html');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => esc(s).replace(/"/g, '&quot;');

/** data-t öğelerinin metnini ve data-tph/ttl/tal özniteliklerini seçilen dile çevirir. */
function translate(html, lang) {
  const d = STR[lang];
  html = html.replace(/(<([a-z0-9]+)\b[^>]*\bdata-t="(\w+)"[^>]*>)([^<]*)(<\/\2>)/g, (m, open, tag, k, _txt, close) => {
    if (d[k] == null) throw new Error('çeviri yok: ' + k);
    return open + esc(d[k]) + close;
  });
  html = html.replace(/<[a-z0-9]+\b[^>]*>/g, tag => {
    for (const [data, attr] of [['tph', 'placeholder'], ['ttl', 'title'], ['tal', 'aria-label']]) {
      const m = tag.match(new RegExp(`data-${data}="(\\w+)"`)); if (!m) continue;
      const v = escAttr(d[m[1]]);
      tag = new RegExp(`\\s${attr}="`).test(tag) ? tag.replace(new RegExp(`(\\s${attr}=")[^"]*"`), `$1${v}"`) : tag.replace(/>$/, ` ${attr}="${v}">`);
    }
    return tag;
  });
  return html;
}

const META = {
  tr: { title: 'Sırdaş · Yapay zekâya göndermeden veri maskeleme', desc: 'Excel tablosunda ya da metinde seçtiğin sütun, satır ve hücreleri yapay zekâya göndermeden önce maskele, yanıtı geri aç. Sayılar ve tarihler hesap bozulmadan gizlenir. Tarayıcıda çalışır, veri hiçbir sunucuya gitmez.', url: SITE + '/' },
  en: { title: 'Sırdaş · Mask data before you send it to AI', desc: 'Mask the columns, rows and cells you choose in an Excel table or text before sending it to an AI, then unmask the answer. Numbers and dates are hidden without breaking the maths. Runs in your browser; nothing is sent to a server.', url: SITE + '/en/' }
};
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'";

function sitePage(lang) {
  const m = META[lang];
  let body = src.replace(/<title[^>]*>.*?<\/title>\n?/, '').replace(/<meta name="claude:viewport-fit-sides"[^>]*>\n?/, '');
  body = translate(body, lang);
  body = body.replace('<!--@FONTS-->\n', '');
  body = body.replace('<!--@SCRIPTS-->', `<script>window.SIRDAS_ENV={xlsxUrl:'/lib/xlsx.full.min.js',exceljsUrl:'/lib/exceljs.min.js',jszipUrl:'/lib/jszip.min.js',pdfUrl:'/lib/pdf.min.js',pdfWorkerUrl:'/lib/pdf.worker.min.js',workerUrl:'/src/worker.js'}</script>
<script src="/src/core.js?v=${VERSION}"></script>
<script src="/src/ofis.js?v=${VERSION}"></script>
<script src="/src/i18n.js?v=${VERSION}"></script>
<script src="/src/app.js?v=${VERSION}"></script>
<script>if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('/sw.js').catch(function(){});</script>`);
  const redirect = lang === 'tr'
    ? `<script>(function(){try{var q=new URLSearchParams(location.search),p=q.get('lang'),k='sirdas_dil',git=function(){q.delete('lang');var s=q.toString();location.replace('/en/'+(s?'?'+s:'')+location.hash);};
if(p==='tr'||p==='en'){localStorage.setItem(k,p);if(p==='en')git();return;}
if(/bot|crawl|spider|slurp|lighthouse/i.test(navigator.userAgent))return;
var s=localStorage.getItem(k);if(s==='en'){git();return;}
if(!s&&!(navigator.languages||[navigator.language]).some(function(l){return /^tr/i.test(l||'');}))git();}catch(e){}})();</script>`
    : `<script>(function(){try{var q=new URLSearchParams(location.search),p=q.get('lang');if(p==='tr'||p==='en'){localStorage.setItem('sirdas_dil',p);if(p==='tr')location.replace('/'+location.hash);}}catch(e){}})();</script>`;
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(m.title)}</title>
<meta name="description" content="${escAttr(m.desc)}">
<link rel="canonical" href="${m.url}">
<link rel="alternate" hreflang="tr" href="${SITE}/">
<link rel="alternate" hreflang="en" href="${SITE}/en/">
<link rel="alternate" hreflang="x-default" href="${SITE}/">
${redirect}
<meta property="og:type" content="website">
<meta property="og:title" content="${escAttr(m.title)}">
<meta property="og:description" content="${escAttr(m.desc)}">
<meta property="og:url" content="${m.url}">
<meta property="og:image" content="${SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#14222B">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/lib/fonts/fonts.css">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${body}
</body>
</html>
`;
}

function artifactPage() {
  const core = read('src/core.js'), ofis = read('src/ofis.js'), worker = read('src/worker.js'), i18n = read('src/i18n.js'), app = read('src/app.js');
  const J = 'https://cdn.jsdelivr.net/npm/';
  const env = { artifact: true, xlsxUrl: J + '@e965/xlsx@0.20.3/dist/xlsx.full.min.js', exceljsUrl: J + 'exceljs@4.4.0/dist/exceljs.min.js', jszipUrl: J + 'jszip@3.10.1/dist/jszip.min.js', pdfUrl: J + 'pdfjs-dist@3.11.174/build/pdf.min.js', pdfWorkerUrl: J + 'pdfjs-dist@3.11.174/build/pdf.worker.min.js', workerSrc: core + '\n' + worker };
  const inline = s => s.replace(/<\/script/gi, '<\\/script');
  return translate(src, 'tr')
    .replace('<!--@FONTS-->', '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap">')
    .replace('<!--@SCRIPTS-->', () => `<script>window.SIRDAS_ENV=${inline(JSON.stringify(env))};</script>\n<script>${inline(core)}</script>\n<script>${inline(ofis)}</script>\n<script>${inline(i18n)}</script>\n<script>${inline(app)}</script>`);
}

mkdirSync(root + 'en', { recursive: true }); mkdirSync(root + 'dist', { recursive: true });
writeFileSync(root + 'index.html', sitePage('tr'));
writeFileSync(root + 'en/index.html', sitePage('en'));
writeFileSync(root + 'dist/artifact.html', artifactPage());
console.log(`Sırdaş ${VERSION}: index.html, en/index.html, dist/artifact.html üretildi.`);
