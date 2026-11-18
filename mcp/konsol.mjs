// MCP stdio kanalında stdout yalnızca protokol mesajlarına ayrılmıştır. Kütüphanelerin (ör. pdf.js) uyarıları
// stdout'a yazılırsa istemci bozulur; bu yüzden ilk iş console çıktılarını stderr'e yönlendiriyoruz.
for (const k of ['log', 'info', 'warn', 'debug']) console[k] = (...a) => process.stderr.write(a.map(String).join(' ') + '\n');
