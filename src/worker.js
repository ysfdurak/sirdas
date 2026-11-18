/* Sırdaş arka plan hesaplayıcısı: büyük tablolarda sayfa donmasın diye maskeleme burada çalışır.
   Tablo bir kez yüklenir ("load"), sonra her seçim değişikliğinde yalnızca anahtar ve ayarlar gelir ("mask"). */
if (typeof Sirdas === 'undefined') self.importScripts('core.js');
let book = null;
self.onmessage = e => {
  const m = e.data;
  try {
    if (m.type === 'load') { book = m.book; self.postMessage({ id: m.id, ok: true }); }
    else if (m.type === 'mask') self.postMessage({ id: m.id, ok: true, result: Sirdas.maskBook(book, m.key, m.cfg) });
  } catch (err) { self.postMessage({ id: m.id, ok: false, error: String((err && err.message) || err) }); }
};
