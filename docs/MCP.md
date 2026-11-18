# Sırdaş MCP sunucusu

Sırdaş'ın yerel MCP sunucusu, yapay zekâ asistanının (Claude Desktop, Claude Code ya da MCP destekleyen başka bir istemci) dosyalarını **senin bilgisayarında** maskelemesini sağlar. Asistan dosyayı kendisi okumaz. Sırdaş dosyayı şablona göre maskeler, asistana yalnızca maskeli önizlemeyi verir. Sonucu gerçek değerlerle diske yine Sırdaş yazar ve asistana içerik döndürmez.

Web sürümüyle aynı çekirdeği (`src/core.js`), aynı şablon dosyalarını ve aynı anahtar biçimini kullanır.

## Kurulum
Node.js 20 ya da üstü gerekir. `npm install`, ExcelJS, JSZip ve pdf.js'i de kurar.

```bash
git clone https://github.com/ysfdurak/sirdas.git
cd sirdas/mcp
npm install
```

### Claude Desktop
`claude_desktop_config.json` dosyasına ekle. Dosya Windows'ta `%APPDATA%\Claude\`, macOS'ta `~/Library/Application Support/Claude/` klasöründedir.

```json
{
  "mcpServers": {
    "sirdas": {
      "command": "node",
      "args": ["C:\\Araclar\\sirdas\\mcp\\sunucu.mjs", "C:\\Users\\yusuf\\Raporlar"],
      "env": { "SIRDAS_PAROLA": "en-az-8-karakterlik-bir-parola" }
    }
  }
}
```

- **`args`:** İlk değer sunucunun yolu. Sonrakiler Sırdaş'ın okuyup yazabileceği klasörler; bunların dışındaki dosyalar reddedilir.
- **`SIRDAS_PAROLA`:** Anahtar dosyasını şifreler. Verilmezse anahtar şifresiz saklanır; dosya yalnızca senin okuyabileceğin izinle yazılır, yine de parola önerilir.

### Claude Code
```bash
claude mcp add -e SIRDAS_PAROLA=... sirdas -- node /yol/sirdas/mcp/sunucu.mjs /yol/Raporlar
```

## Araçlar
| Araç | Ne yapar | Asistana ne döner |
|---|---|---|
| `basliklari_goster` | Excel/CSV'de sütun başlıklarını ve türlerini (metin, sayı, tarih), JSON/XML'de alan yollarını listeler. | Başlıklar ya da alan yolları, satır ve adet sayıları. Hücre değeri, örnek değer ya da sayfa adı dönmez. |
| `maskele_dosya` | Excel'i biçimiyle (şablon ya da `sutunlar`), Word ve PowerPoint'i biçimiyle (`terimler`, bilinen değerler, kişisel veri), JSON/XML'i alan yoluyla (`alanlar`), PDF'i metin olarak maskeler; `<ad>.maskeli.<uzantı>` yazar (PDF için `.txt`). | Maskeli önizleme (sayfa başına 50 satır, en çok 500), özet ve neyin temizlendiği. |
| `yaniti_kaydet` | Asistanın etiketli yanıtını gerçek değerlerle dosyaya yazar. | Yalnızca dosya yolu ve kaç değerin çevrildiği. |
| `geri_ac_dosya` | Asistanın ürettiği Excel, Word, PowerPoint, JSON, XML, CSV ya da metin dosyasını biçimiyle, gerçek değerlerle `<ad>.acilmis` olarak yazar. | Yalnızca yol ve sayılar. |
| `sablonlari_listele` | Kayıtlı şablonları listeler. | Şablon adları, başlıklar ve işlemler. |
| `anahtar_ozeti` | Anahtarda hangi türden kaç etiket olduğunu verir. | Sayılar. Gerçek değer dönmez. |

Sızıntı uyarıları da değer içermez; yalnızca kaç tane olduğu ve hangi hücrede kaldığı söylenir.

## Şablonlar
Web sürümünde **Şablon → Dosyaya al** ile indirdiğin `.json` dosyasını `~/.sirdas/sablonlar/` klasörüne koy (Windows'ta `C:\Users\<ad>\.sirdas\sablonlar\`). Asistana “Haftalık şablonuyla maskele” demen yeterli. Şablon yoksa asistan önce `basliklari_goster` ile başlıkları görür, sonra hangi sütunları gizleyeceğini sana sorar.

## Örnek akış
> **Sen:** Raporlar klasöründeki haftalik.xlsx'i Haftalık şablonuyla maskele, en riskli üç operasyonu bul ve sonucu rapor.md olarak kaydet.

1. Asistan `maskele_dosya` çağırır ve `[OPERASYON_3]` ile ölçeklenmiş maliyetleri görür.
2. Asistan analizini etiketlerle yazar.
3. Asistan `yaniti_kaydet` çağırır. `rapor.md` dosyasında gerçek operasyon adları ve gerçek maliyetler yer alır.

## Ayarlar
| Ortam değişkeni | Anlamı | Varsayılan |
|---|---|---|
| `SIRDAS_PAROLA` | Anahtar dosyasının parolası | yok (şifresiz) |
| `SIRDAS_DIZIN` | Anahtar ve şablon klasörü | `~/.sirdas` |
| `SIRDAS_ANAHTAR` | Anahtar dosyasının yolu | `~/.sirdas/anahtar.json` |
| `SIRDAS_KLASOR` | İzinli klasörler (`args` yerine; `;` ya da `:` ile ayrılır) | çalışma klasörü |
| `SIRDAS_DIL` | `en` verilirse etiket ve sayfa adları İngilizce olur | `tr` |

## Dikkat
- **Geri açılan dosyalar gerçek veri içerir.** Asistanın dosya okuyabildiği başka bir aracı (ör. dosya sistemi MCP'si) varsa `.acilmis` ve `yanit` dosyalarını izinli klasörlerin dışına yazdır ya da o aracı bu klasöre açma.
- **Anahtar dosyasını paylaşma.** Anahtar dosyası ve parolası birlikte gerçek değerleri açar.
- Web sürümündeki anahtar dosyasıyla MCP anahtarı aynı biçimdedir. Web'den indirdiğin anahtar dosyasını `SIRDAS_ANAHTAR` ile gösterebilirsin; parolası `SIRDAS_PAROLA` ile aynı olmalı.
