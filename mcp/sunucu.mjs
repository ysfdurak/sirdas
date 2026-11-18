#!/usr/bin/env node
/*
 * Sırdaş yerel MCP sunucusu (stdio).
 * Yapay zekâ dosyayı doğrudan okumaz: bu sunucu dosyayı senin bilgisayarında şablona göre maskeler, yapay zekâya
 * yalnızca maskeli önizlemeyi verir. Yanıtı geri açmak da burada olur ve sonuç yalnızca diske yazılır.
 *
 * Çalıştırma: node sunucu.mjs <izinli klasör> [<izinli klasör> ...]
 * Ortam: SIRDAS_PAROLA (anahtarı şifreler, önerilir), SIRDAS_ANAHTAR, SIRDAS_DIZIN, SIRDAS_DIL=tr|en
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as I from './islemler.mjs';

const cfg = I.ayarlar(process.env, process.argv.slice(2));
const server = new McpServer({ name: 'sirdas', version: I.S.VERSION }, {
  instructions: 'Sırdaş, kullanıcının dosyalarını yapay zekâya göndermeden önce maskeler. Gerçek değerleri sen hiç görmezsin; [OPERASYON_1] gibi etiketler, ölçeklenmiş sayılar ve kaydırılmış tarihler görürsün. ' +
    'Yanıtında etiketleri olduğu gibi, köşeli parantezleriyle yaz; ölçeklenmiş sayılarla hesap yapabilirsin (oranlar doğrudur). Gerçek değerleri tahmin etmeye çalışma. ' +
    'Sonucu kullanıcıya gerçek değerlerle vermek için yaniti_kaydet ya da geri_ac_dosya kullan; bunlar sonucu diske yazar, sana içerik döndürmez.'
});
const ok = obj => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }], structuredContent: obj });
const run = fn => async args => { try { return ok(await fn(args)); } catch (e) { return { isError: true, content: [{ type: 'text', text: String((e && e.message) || e) }] }; } };
const ISLEM = z.enum(['tag', 'drop', 'scale', 'bucket', 'date']).describe('tag: etiketle · drop: hiç gönderme · scale: gizli katsayıyla çarp (hesap doğru kalır) · bucket: aralığa çevir · date: tarihleri tam hafta kaydır');

server.registerTool('basliklari_goster', {
  title: 'Sütun başlıklarını göster',
  description: 'Bir Excel/CSV dosyasının sayfa sırasını, satır sayısını, sütun başlıklarını ve sütun türünü (metin/sayı/tarih) verir. Hücre değeri ve sayfa adı döndürmez. Hangi sütunların gizleneceğini önermek için kullan.',
  inputSchema: { dosya: z.string().describe('Dosyanın tam yolu (izinli klasörlerin içinde)') },
  annotations: { readOnlyHint: true }
}, run(a => ({ sayfalar: I.basliklar(cfg, a.dosya) })));

server.registerTool('maskele_dosya', {
  title: 'Dosyayı maskele',
  description: 'Dosyayı şablona ya da verilen sütun kurallarına göre maskeler, maskeli kopyayı diske yazar (<ad>.maskeli.xlsx) ve sana yalnızca maskeli önizlemeyi döndürür. Anahtar kullanıcının bilgisayarında kalır; aynı değer her seferinde aynı etiketi alır. Metin dosyalarında kişisel veriler otomatik bulunur.',
  inputSchema: {
    dosya: z.string().describe('Maskelenecek dosyanın tam yolu'),
    sablon: z.string().optional().describe('Kayıtlı şablonun adı ya da .json şablon dosyasının yolu (sablonlari_listele)'),
    sutunlar: z.array(z.object({ baslik: z.string(), islem: ISLEM.default('tag'), etiket: z.string().optional() })).optional().describe('Şablona ek sütun kuralları, başlık adıyla'),
    terimler: z.array(z.string()).optional().describe('Metin dosyalarında ayrıca gizlenecek ifadeler'),
    deger_yay: z.boolean().optional().describe('Gizlenen değerler başka hücrelerde geçerse onları da gizle (varsayılan açık)'),
    sayfa_adlarini_gizle: z.boolean().optional().describe('Varsayılan açık'),
    kisisel_veri: z.boolean().optional().describe('Kişisel verileri (ad, T.C. kimlik, IBAN, telefon…) otomatik bul'),
    onizleme_satir: z.number().int().optional().describe('Sayfa başına önizleme satırı (1–500, varsayılan 50)'),
    cikti: z.string().optional().describe('Maskeli dosyanın yolu (varsayılan: kaynağın yanında .maskeli)')
  }
}, run(a => I.maskeleDosya(cfg, a)));

server.registerTool('geri_ac_dosya', {
  title: 'Dosyayı geri aç',
  description: 'Etiketli bir dosyayı (senin ürettiğin Excel, CSV, Markdown ya da metin) gerçek değerlerle yeni bir dosyaya yazar (<ad>.acilmis). Ölçeklenmiş sayılar ve kaydırılmış tarihler, başlığı eşleşen sütunlarda geri çevrilir. İçeriği sana DÖNDÜRMEZ; yalnızca yol ve sayılar döner.',
  inputSchema: {
    dosya: z.string(), cikti: z.string().optional(),
    sayilar: z.boolean().optional().describe('Ölçeklenmiş sayıları geri çevir (varsayılan açık)'),
    tarihler: z.boolean().optional().describe('Kaydırılmış tarihleri geri al (varsayılan açık)')
  }
}, run(a => I.geriAcDosya(cfg, a)));

server.registerTool('yaniti_kaydet', {
  title: 'Yanıtı gerçek değerlerle kaydet',
  description: 'Etiketlerle yazdığın yanıtı alır, gerçek değerlerle kullanıcının belirttiği dosyaya yazar. Metinde ölçeklenmiş sayılar 100 ve üstüyse geri çevrilir, yüzdeler ve yıllar dokunulmaz. İçeriği sana döndürmez.',
  inputSchema: {
    metin: z.string(), cikti: z.string().describe('Yazılacak dosya, ör. .../rapor.md'),
    sayilar: z.boolean().optional(), tarihler: z.boolean().optional(), uzerine_yaz: z.boolean().optional()
  }
}, run(a => I.yanitiKaydet(cfg, a)));

server.registerTool('sablonlari_listele', {
  title: 'Şablonları listele',
  description: 'Kayıtlı maskeleme şablonlarını (ad, sütun başlıkları ve işlemleri) listeler. Şablonlar web sürümünde “Dosyaya al” ile indirilip şablon klasörüne konur.',
  inputSchema: {}, annotations: { readOnlyHint: true }
}, run(() => ({ klasor: cfg.tplDir, sablonlar: I.sablonlar(cfg).map(x => ({ ad: x.profile.name, sutunlar: x.profile.columns.map(c => ({ baslik: c.header, islem: c.action })) })) })));

server.registerTool('anahtar_ozeti', {
  title: 'Anahtar özeti',
  description: 'Anahtarda kaç etiket olduğunu türlerine göre verir. Gerçek değer döndürmez.',
  inputSchema: {}, annotations: { readOnlyHint: true }
}, run(() => I.anahtarOzeti(cfg)));

await server.connect(new StdioServerTransport());
