# Sırdaş · geliştirici notları ve öğrenme rehberi

Bu belge, projeyi kendin değiştirebilmen ve sorulduğunda anlatabilmen için yazıldı. Her bölüm “ne var, neden böyle, nasıl değiştirilir” sırasıyla gider. Sonda mülakatta ya da sunumda gelebilecek sorular ve kısa cevapları var.

## 1. Klasör yapısı

```
sirdas/
├─ src/core.js        ← ÇEKİRDEK: maskeleme, geri açma, şablon, şifreleme. DOM ve ağ yok.
├─ src/app.js         ← web arayüzü (ekran, seçim, dosya işleri)
├─ src/i18n.js        ← Türkçe ve İngilizce arayüz metinleri
├─ src/worker.js      ← arka plan hesaplayıcısı (büyük tablolar için)
├─ web/source.html    ← sayfanın HTML iskeleti ve CSS'i (DÜZENLEDİĞİN dosya)
├─ tools/build.mjs    ← source.html'den index.html, en/index.html, dist/artifact.html üretir
├─ index.html, en/    ← ÜRETİLİR (elle düzenleme, üzerine yazılır)
├─ mcp/               ← yerel MCP sunucusu (sunucu.mjs) ve işlemleri (islemler.mjs)
├─ test/core.test.js  ← çekirdek testleri; mcp/sunucu.test.mjs uçtan uca MCP testi
├─ lib/               ← SheetJS 0.20.3, Mammoth 1.6.0, yazı tipleri, lisansları
└─ sw.js, wrangler.jsonc, .assetsignore, _headers, sitemap.xml, robots.txt, favicon.svg, og.png
```

**Neden tek çekirdek?** Web, Worker, MCP ve testler aynı `core.js` dosyasını kullanır. Bir kural değişince dört yerde değil, bir yerde değişir ve testler hepsini birden korur. Bu, projelerde istediğin “aynı çekirdek üzerinde web + MCP” ikili yapısının kendisi.

## 2. Çekirdeğin içi (src/core.js)

| Ad | Ne işe yarar |
|---|---|
| `newKey()` | Yeni anahtar: boş etiket listesi, gizli **katsayı** (0,35–0,85 ya da 1,15–2,60) ve gizli **tarih kaydırması** (±6–52 tam hafta). |
| `makeLedger(key)` | Tek bir hesaplamanın defteri. Var olan etiketleri okur, yenilerini `fresh` içine yazar. Numaralar etiket türüne göre artar: `OPERASYON_1`, `OPERASYON_2`… |
| `commit(key, sonuç)` | Yeni etiketleri anahtara işler. Arayüz bunu yalnızca **kopyalayınca ya da indirince** çağırır. Böylece seçimle oynarken numaralar boşuna şişmez. |
| `maskBook(kitap, anahtar, ayar)` | Tablo maskelemenin kalbi. Üç tur çalışır (aşağıda). |
| `maskText(metin, anahtar, ayar)` | Metin görünümü: elle seçilen terimler, bilinen değerler ve isteğe bağlı kişisel veri tespiti. |
| `restoreText` / `restoreValue` | Geri açma. Metin için parçalar döndürür, Excel hücresi için tek değer. |
| `makeProfile` / `applyProfile` / `profileScore` | Şablonlar: sütun kurallarını **başlık adıyla** kaydeder, aynı başlıklı dosyaya uygular, ne kadar uyduğunu ölçer. |
| `encryptKey` / `decryptKey` | Anahtar dosyası: PBKDF2-SHA256 (250.000 tur) ile paroladan anahtar türetilir, içerik AES-GCM 256 ile şifrelenir. |
| `makeMatcher(değerler)` | Binlerce değeri tek geçişte arayan eşleyici (aşağıda). |

### maskBook'un üç turu
1. **Seçimler.** Her hücre için şu sıra izlenir: kullanıcı bu hücreyi açtıysa (delik) dokunulmaz; başlık satırıysa yalnızca açıkça seçildiyse gizlenir; sütun kuralı varsa işlem uygulanır (etiketle, çıkar, ölçekle, aralık, tarih, grup); tek hücre seçildiyse etiketlenir. Gizlenen her metin değeri bir “havuza” eklenir.
2. **Yayma ve tespit.** Havuzdaki değerler, seçilmemiş hücrelerin içinde aranır (`Proje Atlas deposu` → `[OPERASYON_1] deposu`). İstenirse kişisel veri tespiti de burada çalışır.
3. **Kontrol.** Sayfa adları gizlenir (`Sayfa 1`). İstatistikler toplanır. Sızıntı taranır: değer yayma kapalıyken hücrelerde açık kalan gizli değerler, sayfa adları ve etiket adının kendisi (`Proje Atlas` başlıklı sütunun etiketi `PROJE_ATLAS` olur, bu da bir sızıntıdır).

### Hücre çıktısının biçimi
Değişmeyen hücre özgün değerini korur (metin, sayı ya da tarih). Değişen hücre `{ p: [parça, …] }` olur. Bir parça şunlardan biridir:
- düz metin;
- `{ t: 'OPERASYON_1', v: 'Proje Atlas' }`, yani etiket;
- `{ x: yeni değer, v: özgün, k: 's' | 'b' | 'd' | 'g' }`, yani ölçek, aralık, tarih ya da grup.

Önizleme bu parçaları renklendirir. `toAOA` ise Excel'e yazılacak düz değerlere çevirir: tek parçalı ölçek ya da tarih Excel'de gerçek sayı ya da tarih olarak kalır.

### Neden ölçekleme, neden tam hafta?
- **Ölçekleme:** Sayıyı etiketlersen (`[MALIYET_1]`) yapay zekâ toplayamaz. Hepsini aynı katsayıyla çarparsan toplam, ortalama, sıralama ve oranlar doğru kalır. Yanıttaki sonuç katsayıya bölünerek gerçeğe döner. Zayıf yanı şu: tek bir gerçek değeri bilen biri katsayıyı bulabilir. Bu yüzden arayüz bunu “şifreleme değildir” diye açıkça yazar.
- **Tam hafta:** Depo ve operasyon verisinde haftanın günü önemlidir (pazartesi yükü gibi). 7'nin katı kadar kaydırınca gün korunur, tarih ise ele vermez.
- **Katsayı neden 1'e yakın değil?** 0,95 gibi bir katsayı değerleri neredeyse olduğu gibi bırakırdı.

### Sayı biçimi tuzağı
`412.000` Türkçede dört yüz on iki bin, İngilizcede dört yüz on iki tam sıfırdır. `parseNumber(v, hint)` tek ayırıcı ve ardından tam üç hane gördüğünde dile bakar: `tr` ise binlik, `en` ise ondalık sayar. Excel'den gelen sayılar zaten sayı olarak (ham değer) gelir ve bu sorunu yaşamaz.

### Hız: makeMatcher
İlk sürüm her terim için `[pP][rR][oO]…` gibi harf sınıflı bir regex kuruyordu; 20.000 satır 5,2 saniye sürüyordu. Şimdi hücre Türkçe kurala göre küçük harfe çevriliyor ve düz metin regex'iyle aranıyor; aynı iş 0,9 saniye. Küçük harfe çevirince uzunluğu değişen nadir metinlerde eski yavaş yola düşülür, sonuç değişmez.

## 3. Arayüz (src/app.js)
- **`state`:** Açık kitap, sayfa ayarları (`sheetCfg`: kurallar, seçili hücreler, delikler), seçenekler, anahtar, son sonuç.
- **`refresh()`:** Her seçim değişikliğinde çekirdeği çalıştırır. Hesap Worker'da yapılır, yalnızca ilk 200 satır geri gelir. Eski bir hesabın sonucu geç gelirse `seq` sayacı onu atar.
- **`eff()`:** Ekranda geçerli anahtar, yani kaydedilmiş anahtar artı henüz kopyalanmamış yeni etiketler. Örnek veride yanıt hemen geri açılabilsin diye var.
- **Kopyala ve Excel indir:** Bu ikisi tüm satırlarla yeniden hesaplar (`keepRows: 0`) ve ardından `commit` eder.
- **Şablonlar:** Tarayıcıda (`localStorage`, `sirdas_sablonlar`) saklanır, `.json` olarak alınıp verilebilir. Dosya açılınca uyan şablon varsa (%60 ve üstü) önerilir.
- **Ortam (`SIRDAS_ENV`):** Sitede kütüphaneler `/lib/`, Worker `/src/worker.js` yolundan gelir ve indirme tarayıcının kendisiyle yapılır. claude.ai sayfasında kütüphaneler jsDelivr'den gelir, Worker kodu sayfaya gömülüdür, indirme claude.ai'nin indirme onayıyla yapılır.

## 4. Değiştirme tarifleri
- **Yeni bir sütun işlemi eklemek:**
  1. `core.js` → `maskBook` 1. turunda `rule.action === 'yeni'` dalını yaz.
  2. `app.js` → `ACTIONS` listesine ekle.
  3. `i18n.js` → `act_yeni` ve `note_yeni` metinlerini iki dile de ekle.
  4. Bir test yaz.
- **Yeni arayüz metni:** `web/source.html` içinde `data-t="anahtar"` kullan, anahtarı `i18n.js` dosyasına iki dilde ekle, `npm run build` çalıştır. Anahtar bir dilde eksikse derleme hata verir.
- **Yeni kişisel veri türü:** `core.js` → `CATS` ve `findCandidates`; `i18n.js` → `CATN`.
- **Sürüm çıkarmak:** `core.js` içindeki `VERSION`, iki `package.json` ve `sw.js` içindeki `CACHE` adını güncelle; ardından `npm run build` ve `npm test`.

## 5. Testler
`npm test` iki şey çalıştırır:
- **Çekirdek testleri (18):** Doğrulayıcılar, etiket tutarlılığı, değer yayma, sızıntı, çıkarma, ölçekleme ve geri çevirme, tarih kaydırma (haftanın günü), aralık ve grup, hücre ve delik, çok sayfa, şablon, şifreleme, sayı ayrıştırma ve 20.000 satırlık hız testi.
- **MCP testi:** Gerçek bir MCP istemcisiyle sunucuyu başlatır, dosyayı maskeler, yanıtı kaydeder, dosyayı geri açar. Sonunda yapay zekâ tarafına giden her yanıtta gerçek değer aranır; bulunursa test başarısız olur.

## 6. Bilerek yapılmayanlar
- **Yapay zekâya doğrudan gönderme:** Araç kendi başına bir yapay zekâya bağlansaydı “verin bu sayfadan çıkmaz” sözü bozulurdu. Kopyalamayı ya da göndermeyi kullanıcı yapar.
- **Sunucu (VPS):** Gerekmiyor. Her şey yerelde çalışıyor; bu, aracın güvenilirliğinin temeli.
- **Gerçekçi sahte değer (ör. `Selin Aksoy` yerine `Ayla Kurt`):** Yapay zekâ sahte değeri gerçek sanıp yanıtta geri açılması zor hale getirebilir. Köşeli parantezli etiket her zaman geri bulunur.
- **Formül aktarmak:** Formül, gizli bir hücreye başvurarak değeri sızdırabilir. Yalnızca değerler aktarılır.

## 7. Sorulabilecek sorular
- **“Bu anonimleştirme mi?”** Hayır, takma adlandırma (pseudonymisation). Anahtar var oldukça geri çevrilebilir. Anonim olsaydı yanıtı geri açamazdık.
- **“Yapay zekâ etiketleri bozarsa ne olur?”** Geri açma `\[OPERASYON\_1\]`, köşeli parantezsiz `OPERASYON_1` ve küçük harf yazımları da tanır. Anahtarda olmayan etiketleri ayrıca listeler.
- **“Aynı kişi iki mesajda farklı etiket alırsa?”** Almaz. Etiketin kimliği değerin küçük harfli, boşlukları düzeltilmiş halidir (`V|proje atlas`). Anahtar dosyasıyla günler arasında da aynı kalır.
- **“Ölçekleme neden güvenli değil?”** Oranlar korunuyor. Gerçek bir değeri bilen biri `maskeli / gerçek` işlemiyle katsayıyı bulur. Bu yüzden hassas rakam için aralık ya da sütunu çıkarma önerilir.
- **“Neden tarih tam hafta kayıyor?”** Haftanın günü analiz için önemli. Rastgele gün sayısı pazartesiyi perşembeye çevirirdi.
- **“Büyük dosyada sayfa neden donmuyor?”** Hesap Web Worker'da, yani ayrı bir iş parçacığında çalışıyor. Ekrana yalnızca ilk 200 satır geliyor.
- **“Anahtar dosyası çalınırsa?”** Parola olmadan açılmaz: PBKDF2 ile 250.000 tur, ardından AES-GCM. Yine de dosya ile parolayı ayrı yerlerde tut.
- **“MCP sürümünde yapay zekâ gerçek değeri görebilir mi?”** Sırdaş'ın araçları görmesine izin vermez; testi tam olarak bunu denetliyor. Ancak yapay zekânın başka bir dosya okuma aracı varsa geri açılmış dosyayı okuyabilir. Bu yüzden belgede çıktıyı izinli klasörün dışına yazdırma önerisi var.
- **“KVKK açısından yeterli mi?”** Tek başına değil. Maskeleme riski azaltır, ama şirket politikası, aktarım kuralları ve veri sorumlusunun kararları geçerliliğini korur.
