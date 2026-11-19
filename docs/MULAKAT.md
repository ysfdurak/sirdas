# Mülakatta sorulabilecek sorular · Sırdaş

Bu kart, projeyi kendi ağzınla anlatabilmen için. Cevaplar kısa tutuldu; ayrıntısı belirtilen belgede. Kod yapay zekâ (Claude) ile yazıldı; kapsam, öncelik ve aşağıdaki kararlar senin. Bunu saklama, açıkça söyle: "Ürünü ve kararları ben belirledim, kodu yapay zekâyla yazdım, her kararın nedenini anlatabilirim."

**1. Bu proje ne yapıyor?**
Excel tablosunda ya da metinde seçtiğin değerleri yapay zekâya göndermeden önce maskeliyor, gelen cevabı geri açıyor. Sayılar ve tarihler hesabı bozmadan gizleniyor.

**2. Neden gerekli?**
Şirket verisini olduğu gibi yapay zekâya yapıştırmak risk; ama maskeleme oranları ve hesapları bozarsa cevap işe yaramaz.

**3. Sayıları nasıl gizliyorsun?**
Ölçekleme: bütün sütun aynı gizli katsayıyla çarpılıyor, oranlar korunuyor. Ama bu şifreleme değil; tek bir gerçek değeri bilen katsayıyı bulabilir. Değerin kendisi hassassa aralığa çevirmek ya da sütunu çıkarmak gerekiyor.

**4. Anonimleştirme mi?**
Hayır, takma adlandırma. Anahtar oldukça veri geri çevrilebilir; KVKK açısından anonim sayılmaz.

**5. Veri nereye gidiyor?**
Hiçbir yere. Her şey tarayıcıda; sayfanın güvenlik ayarı dış adrese bağlantıyı engelliyor. Anahtar ve tablo yalnız sayfanın belleğinde.

**6. Word, PowerPoint, PDF?**
Word ve PowerPoint biçimiyle maskelenip indiriliyor; PDF'ten yalnız metin alınıyor. Görsellerin içindeki yazı maskelenmiyor; belge açılınca görsellerin yeri (slayt, paragraf) listeleniyor.

**7. Büyük dosyalar?**
Dosya okunmadan boyut sınırı, Office dosyasında açılmadan içerik ve parça sınırı, PDF'te sayfa sınırı. Sınırı aşan dosya açıklamayla reddediliyor, ekrandaki çalışma bozulmuyor.

**8. Teknik yapı?**
Tek sayfa, sade JavaScript; çekirdek (core.js) tarayıcıda ve Node'da (MCP) aynı. ExcelJS, JSZip, pdf.js ve SheetJS kullanılıyor.

**9. Bilinen sınırlar?**
Bağlam ele verebilir (ad gizli ama bölge, tarih ve tutar birlikte tanıtabilir); kasıtla bozulmuş bir zip dosyası boyut denetimini geçip sekmeyi kilitleyebilir (veri sızmaz).

**10. Neyi farklı yapardın?**
Dosya sınırlarını ve görsel listesini ilk sürümde koyardım.


## Bu projede verdiğim kararlar (sorun → karar → bedel)

- **Gerçekçi sahte değer kullanmamak:** Yapay zekâ sahte adı gerçek sanıp geri açmayı zorlaştırabilir → köşeli parantezli etiket → çıktı daha yapay görünüyor.
- **Dosya sınırları:** Büyük dosya telefonda sekmeyi kilitleyebiliyordu → okuma öncesi sınırlar → çok büyük dosyayı bölmek gerekiyor.
- **Görseller:** Resimdeki yazı maskelenmiyor → yerlerini listeleme → kontrolü kullanıcı yapıyor, metin tanıma (OCR) yok.

---
Son güncelleme: 19 Kasım 2026.
