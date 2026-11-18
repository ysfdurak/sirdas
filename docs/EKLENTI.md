# Sırdaş Excel eklentisi

Excel'in içinde çalışan Sırdaş. Gizlenecek sütun ya da hücreleri Excel'de seçip ekliyorsun. **Maskeli kopya oluştur** düğmesi kitabın biçimini koruyarak maskeli bir kopyayı yeni pencerede açar; asıl kitaba dokunmaz. Yapay zekânın döndürdüğü kitabı açıp **Bu çalışma kitabını geri aç** düğmesine bastığında etiketler, ölçeklenmiş sayılar ve kaydırılmış tarihler yerinde geri çevrilir. Formüllere dokunulmaz.

Eklenti, sitedeki ve MCP'deki aynı çekirdeği (`src/core.js`, `src/ofis.js`) kullanır. Şablonlar ve anahtar metni (`SIRDAS1.`) üç sürüm arasında taşınabilir.

## Gereksinimler
- **Excel sürümü:** Microsoft 365 Excel (Windows, Mac ya da web). Eklentinin istediği en düşük sürüm ExcelApi 1.8.
- **Sunucu:** Eklenti dosyaları HTTPS üzerinden yayınlanmalı. Varsayılan adres `https://sirdas.ysfdurak.com/eklenti/`; site yayına girince hazır olur.
- **Bağlantı:** Bölme yalnızca kendi adresinden dosya yükler. Microsoft'un zorunlu tuttuğu `office.js` dosyası dışında hiçbir yere bağlanmaz; kitabın içeriği bilgisayardan çıkmaz.

## Yükleme
### Excel'in web sürümü ya da Windows (deneme için)
1. `eklenti/manifest.xml` dosyasını bilgisayarına indir.
2. Excel'de **Giriş → Eklentiler → Diğer eklentiler** (bazı sürümlerde **Ekle → Eklentiler**) yolunu izle.
3. **Eklentilerim → Eklentimi karşıya yükle** (Upload My Add-in) ile `manifest.xml` dosyasını seç.
4. Giriş sekmesinde **Sırdaş → Maskele** düğmesi çıkar.

Windows masaüstünde karşıya yükleme seçeneği yoksa iki yol var:
- **Paylaşılan klasör:** Manifest'i paylaşılan bir klasöre koy. **Dosya → Seçenekler → Güven Merkezi → Güvenilen Eklenti Katalogları** bölümüne o klasörün yolunu ekle. Ardından eklentiyi **Paylaşılan Klasör** sekmesinden yükle.
- **Kurum geneli:** Microsoft 365 yönetim merkezi → **Tümleşik uygulamalar** üzerinden yükle. Bu işi BT yöneticisi yapar; şirket bilgisayarında eklenti yüklemek BT onayı isteyebilir.

### Kurum içinde kendi sunucunda
1. Depoyu iç bir HTTPS sunucusunda yayınla (bkz. README → Kurum içinde kurmak).
2. `eklenti/manifest.xml` içindeki tüm `https://sirdas.ysfdurak.com` adreslerini kendi adresinle değiştir.
3. Kurumunuz kendi eklenti kimliğini kullanacaksa `<Id>` değerini yeni bir GUID ile değiştir.

## Kullanım
1. **Seç:** Excel'de bir sütunu (ya da sütun başlığını) seç, bölmede işlemi belirle (Etiketle, Çıkar, Katsayıyla ölçekle, Aralığa çevir, Tarihi kaydır) ve **Seçili aralığı ekle**'ye bas. Sütunun tamamını seçersen kural sütuna, birkaç hücre seçersen yalnızca o hücrelere uygulanır. **Başlıklardan seç** tüm sayfaların başlıklarını listeler.
2. **Maskeli kopya oluştur:** Kitap okunur, maskelenir ve yeni bir kitap olarak açılır.
   - **Biçim:** Renkler, sayı biçimleri ve sütun genişlikleri kalır.
   - **Temizlenenler:** Formüller değere çevrilir; notlar, açılır listeler, koşullu biçim kuralları, tablo tanımları, görseller, tanımlı adlar ve belge özellikleri silinir. Gizli sayfalar alınmaz.
   - **Sızıntı uyarısı:** Gizlediğin bir değer kopyada açık kalacaksa önce uyarı verir.
3. **Gönder:** Maskeli kopyayı yapay zekâya ver.
4. **Geri aç:** Yapay zekânın döndürdüğü kitabı aç ve **Bu çalışma kitabını geri aç**'a bas. Metin yanıtları için bölmedeki kutuya yapıştırman yeterli.

## Anahtar
- **Ömrü:** Anahtar bölme açık kaldıkça bellekte durur.
- **Bu bilgisayarda sakla:** Anahtarı parolayla şifreleyip tarayıcı deposuna yazar.
- **Metin olarak kopyala:** Sitedeki Sırdaş'ın da okuyabildiği `SIRDAS1.` metnini verir. Sitede maskeleyip eklentide geri açabilirsin; tersi de olur.

## Sınırlar
- **Kaydedilmemiş değişiklikler:** Maskeli kopya, Excel'in eklentiye verdiği dosyadan üretilir. Kaydetmediğin son değişiklikler bazı Excel sürümlerinde dosyaya yansımayabilir; önce kaydet.
- **Desteklenmeyen sürümler:** `Excel.createWorkbook` desteklemeyen eski sürümlerde maskeli sayfa panoya kopyalanır.
- **Grafikler ve pivot tablolar:** Maskeli kopyaya alınmaz, çünkü önbelleklerinde gerçek veri bulunur.

## Geliştirme
- **Dosyalar:** `eklenti/gorev.html` (bölme), `eklenti/eklenti.js` (mantık), `eklenti/manifest.xml`.
- **Deneme:** `test/eklenti/eklenti-deneme.cjs` eklentiyi sahte bir Excel nesne modeliyle (`office-mock.js`) baştan sona dener. Dener: seçimden kural ekleme, başlık listesi, maskeli kopya, yerinde geri açma, şablon ve anahtar saklama. Playwright ve `python3 -m http.server 8765` gerekir.
