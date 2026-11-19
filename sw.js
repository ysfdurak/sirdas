// Sırdaş · çevrimdışı çalışma. Yalnızca bu sitenin kendi dosyalarını önbelleğe alır; başka hiçbir adrese istek göndermez.
// Tablolar, metinler ve anahtarlar önbelleğe girmez; onlar zaten yalnızca sayfanın belleğinde durur.
// Strateji: önce ağ (her zaman en yeni sürüm), ağ yoksa önbellek. Yeni sürümde CACHE adını değiştir.
const CACHE = 'sirdas-1.2.2-akis';
const FILES = ['/', '/index.html', '/en/', '/en/index.html', '/favicon.svg', '/src/core.js', '/src/ofis.js', '/src/i18n.js', '/src/app.js', '/src/worker.js', '/lib/fonts/fonts.css', '/lib/xlsx.full.min.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('sirdas-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== self.location.origin) return;
  e.respondWith(
    fetch(r).then((res) => {
      if (res.ok && res.status === 200) { const kopya = res.clone(); caches.open(CACHE).then((c) => c.put(r, kopya)); }
      return res;
    }).catch(async () => {
      const c = await caches.match(r, { ignoreSearch: true });
      if (c) return c;
      if (r.mode === 'navigate') return caches.match(u.pathname.startsWith('/en/') ? '/en/index.html' : '/index.html');
      return Response.error();
    })
  );
});
