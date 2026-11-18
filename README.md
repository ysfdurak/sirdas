# Sırdaş

**Yapay zekâya göndermeden önce tabloda ya da metinde seçtiğin sütun, satır ve hücreleri maskeleyen, yanıtı geri açan araç. Operasyon adı, müşteri kodu, maliyet: verinin kişisel olması gerekmez. Tarayıcıda çalışır, veri hiçbir sunucuya gitmez. Türkçe ve İngilizce; ayrıca yerel MCP sunucusu.**

- **Web (Türkçe):** https://sirdas.ysfdurak.com/
- **Web (English):** https://sirdas.ysfdurak.com/en/
- **MCP (Claude Desktop vb.):** [docs/MCP.md](docs/MCP.md)

> **English:** Sırdaş masks the columns, rows and cells you choose in an Excel table or text before you send it to an AI, and puts the real values back into the answer. Numbers can be scaled by a hidden factor (totals and ratios stay right), dates shifted by whole weeks, columns removed or grouped. Templates remember your choices by header name; an encrypted key file keeps labels consistent across sessions. Runs in the browser; nothing is uploaded. A local MCP server offers the same core to AI assistants, which then only ever see the masked data.

![Sırdaş: örnek tabloda Operasyon ve Sorumlu sütunları etiketlenmiş, maliyet ölçeklenmiş, tarihler kaydırılmış](docs/ekran/sirdas.png)

## Neler var?
- **Sen seçersin:** Sütun harfine, satır numarasına ya da hücreye tıkla, sürükleyerek alan seç. Başlık hücresi de gizlenebilir. Metin görünümünde seçtiğin parçaya kendi etiketini verirsin (`[PLAN_1]`).
- **Sütun başına işlem:**
  - **Etiketle:** `Proje Atlas` → `[OPERASYON_1]`. Aynı değer her yerde ve her mesajda aynı etiketi alır.
  - **Çıkar:** Sütun hiç gönderilmez; değerleri başka hücrelerde geçerse orada etiketlenir.
  - **Katsayıyla ölçekle:** Tüm sayılar aynı gizli katsayıyla çarpılır. Toplam, ortalama ve oranlar doğru kalır; yanıttaki sonuçlar geri çevrilir.
  - **Aralığa çevir:** `412.000` → `400 bin–500 bin`. Geri çevrilmez.
  - **Tarihi kaydır:** Tüm tarihler aynı gizli sayıda tam hafta kayar. Süreler ve haftanın günü korunur; yanıtta geri kaydırılır.
  - **Grupla:** `Kadıköy` → `İstanbul` gibi kendi eşlemen. Geri çevrilmez.
- **Başka hücrelerde de gizler:** Gizlediğin `Proje Atlas` bir not hücresinde geçiyorsa orada da etiketlenir.
- **Şablonlar:** Seçimini başlık adlarıyla kaydet; aynı başlıklı her yeni dosyada tek tıkla uygula. Sütunun yeri değişse de çalışır. Şablon `.json` dosyası olarak alınıp verilebilir ve MCP sunucusu da aynı dosyayı kullanır.
- **Anahtar dosyası:** Etiketler, sayı katsayısı ve tarih kaydırması parolayla şifrelenip (PBKDF2-SHA256 250.000 tur + AES-GCM 256) dosyaya alınır. Ertesi gün yükleyince aynı değerler aynı etiketleri alır.
- **Çok sayfalı Excel:** Her sayfa ayrı seçilir, hepsi tek dosyada maskelenir. Sayfa adları `Sayfa 1, 2…` olarak gizlenir ve geri açarken eski adlarına döner.
- **Göndermeden kontrol:** Kaç değerin gizlendiğini ve hangi sütunların çıkarıldığını gösterir. Açık kalan gizli değerleri, etiket adından sızan değerleri, seçim yapılmamış sayfaları ve açık giden başlıkları da listeler.
- **Temiz Excel çıktısı:** Yalnızca değerler aktarılır. Formül, not, gizli sayfa, biçim ve dosya bilgisi taşınmaz; dosya adı sabittir (`sirdas-maskeli.xlsx`).
- **Geri açma:** Yanıtı yapıştır ya da yapay zekânın döndürdüğü Excel'i aç. Etiketler, ölçeklenmiş sayılar ve kaydırılmış tarihler geri çevrilir. Metinde her sayı tek tıkla açılıp kapanır. Bilinmeyen etiketler ve Türkçe ek uyumu (`Kerem Tan'in`) için uyarı verir.
- **İsteğe bağlı kişisel veri tespiti:** Ad soyad, T.C. kimlik (kontrol haneli), vergi no, IBAN, kart (Luhn), telefon, e-posta, adres, firma, plaka, IP.
- **Büyük dosyalar:** Hesap arka planda (Web Worker) çalışır, sayfa donmaz. 40.000 satırlık bir tablo yaklaşık 1 saniyede maskelenir.
- **İki dil, internetsiz çalışma:** Türkçe ve İngilizce. İlk açılıştan sonra internet olmadan da çalışır (`sw.js`).

## Nasıl çalışıyor?
- **Tek çekirdek:** Maskeleme mantığının tamamı `src/core.js` dosyasında. Web arayüzü (`src/app.js`), arka plan hesaplayıcısı (`src/worker.js`), MCP sunucusu (`mcp/`) ve testler aynı dosyayı kullanır.
- **Sunucu yok:** Hesaplar tarayıcıda yapılır. SheetJS 0.20.3, Mammoth ve yazı tipleri depodaki `lib/` klasöründen gelir. Sayfanın güvenlik kuralı (CSP, `connect-src 'self'`) başka adrese bağlantıyı tarayıcı düzeyinde engeller.
- **Kayıt yok:** Tablolar, metinler ve anahtar yalnızca sayfanın belleğinde durur; sayfa kapanınca silinir. Tarayıcıda saklanan tek şey şablonların ve dil seçimin.
- **Ayrıntı:** Geliştirici notları ve projeyi anlatabilmen için hazırlanmış rehber: [docs/GELISTIRME.md](docs/GELISTIRME.md).

## Sınırlar
- **Seçmediğin hücreler olduğu gibi gider.** Bağlam da ele verebilir: ad gizlense de bölge, tarih ve tutar birlikte bir operasyonu tanıtabilir.
- **Ölçekleme şifreleme değildir.** Oranlar korunduğu için tek bir gerçek değeri bilen biri katsayıyı bulabilir. Rakamın kendisi hassassa aralığa çevir ya da sütunu çıkar.
- **Bu, takma adlandırmadır.** Anahtar var oldukça veri geri çevrilebilir, yani anonim sayılmaz. Kurum verisinde şirket kuralların ve KVKK yükümlülüklerin geçerliliğini korur.
- **Tam sayılar ölçeklenince yuvarlanır.** Geri çevrilen değer ±1 sapabilir.

## Geliştirme
```bash
npm run build     # web/source.html + src/*.js → index.html, en/index.html, dist/artifact.html
npm test          # çekirdek testleri + MCP uçtan uca testi (önce: cd mcp && npm install)
npm run serve     # http://localhost:8000/
```

## Yayın
Canlı adres **sirdas.ysfdurak.com**. Yayın Cloudflare Workers üzerinden yapılır ve `main` dalına her gönderimde otomatik çalışır. Ayarlar `wrangler.jsonc` dosyasında, yayına girmeyen dosyalar `.assetsignore` dosyasında. `index.html` ve `en/index.html` derleme çıktısıdır; kaynağı değiştirdikten sonra `npm run build` çalıştırıp ikisini de gönder.

## Nasıl yapıldı?
Ürünü, kapsamı ve sınırlarını Yusuf Durak belirledi; kod yapay zekâ (Claude) ile geliştirildi. İlk sürüm “Örtü” adıyla bir claude.ai artifact'ı olarak yapıldı. Bu sürümde sütun ve hücre seçimi öne alındı, şablonlar, sayı ve tarih koruma, çok sayfa, son kontrol ve MCP sunucusu eklendi.

## Lisans

Bu proje [PolyForm Shield 1.0.0](LICENSE.md) lisansıyla yayınlanır. Kaynak kodu açıktır, ancak resmi anlamda bir "açık kaynak" lisansı değildir.

- **Serbest:** Kişiler, okullar ve şirketler kendi işlerinde ücretsiz kullanabilir, değiştirebilir ve kendi bilgisayarlarına ya da sunucularına kurabilir. İzin almak gerekmez.
- **Yazılı izin gerekir:** Yazılımı satmak, adını değiştirip ürün gibi sunmak ya da bununla (ücretsiz olsa bile) rakip bir ürün veya hizmet sunmak.
- **Garanti yok:** Yazılım olduğu gibi sunulur. Bağlayıcı olan İngilizce lisans metnidir.
- Üçüncü taraf bileşenler kendi lisanslarına tabidir (`lib/lisanslar/`).

**Kurum içinde kurmak:** Depoyu indir, `npm run build` çalıştır ve klasörü herhangi bir iç web sunucusunda (IIS, nginx, Apache) yayınla. Dış bağlantı olmadığından kapalı ağda da çalışır. MCP sunucusu için [docs/MCP.md](docs/MCP.md).

Kurumunuzda kullanıyorsanız haber verirseniz sevinirim: kurulumda yardımcı olabilir, kurumunuza özel ihtiyaçları birlikte değerlendirebiliriz. İletişim: iletisim@ysfdurak.com

### License (English)

Released under [PolyForm Shield 1.0.0](LICENSE.md). The source is available, but this is not an OSI "open source" licence.

- **Free:** individuals, schools and companies may use it in their own work, change it and run it on their own computers or servers. No permission needed.
- **Needs written permission:** selling it, rebranding it as a product, or providing a product or service that competes with it (even free of charge).
- **No warranty:** provided as is. The English licence text is binding.
- Third-party components keep their own licences (`lib/lisanslar/`).

**Running it inside your organisation:** download the repository, run `npm run build` and serve the folder from any internal web server (IIS, nginx, Apache). It makes no outside connections, so it also works on closed networks. For the MCP server see [docs/MCP.md](docs/MCP.md).

Using it in your organisation? I'd be glad to hear from you: I can help with setup and look at your organisation's needs together. Contact: contact@ysfdurak.com
