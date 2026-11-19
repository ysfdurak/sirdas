"""Sırdaş tarayıcı duman testi: sayfa hatasız açılır, örnek tablo maskelenir, büyük dosya reddedilir
ve ekrandaki çalışma bozulmaz, PowerPoint'teki görsellerin yeri listelenir.
Çalıştırma: python3 test/tarayici/duman_test.py [chrome-yolu]   (gerekenler: pip install playwright)"""
import functools, http.server, os, socketserver, sys, tempfile, threading, zipfile
from playwright.sync_api import sync_playwright

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CHROME = sys.argv[1] if len(sys.argv) > 1 else None
tmp = tempfile.mkdtemp()
bomba, sunum = os.path.join(tmp, 'bomba.xlsx'), os.path.join(tmp, 'sunum.pptx')
with zipfile.ZipFile(bomba, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', '<Types/>'); z.writestr('xl/worksheets/sheet1.xml', b'\0' * (300 * 1024 * 1024))
blip = '<a:blip r:embed="rId9"/>'
with zipfile.ZipFile(sunum, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('ppt/presentation.xml', '<p:presentation/>')
    for i in (1, 2, 3):
        z.writestr(f'ppt/slides/slide{i}.xml', f'<p:sld><a:p><a:r><a:t>Slayt {i}</a:t></a:r></a:p>' + (f'<p:pic>{blip}</p:pic>' if i == 2 else '') + '</p:sld>')

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=REPO))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{srv.server_address[1]}/'
sonuc = []
def ok(ad, kosul): sonuc.append(bool(kosul)); print(('✓' if kosul else '✗'), ad)

with sync_playwright() as p:
    b = p.chromium.launch(**({'executable_path': CHROME} if CHROME else {}))
    pg = b.new_page(locale='tr-TR', viewport={'width': 1280, 'height': 900})
    hatalar = []; pg.on('pageerror', lambda e: hatalar.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(2500)
    once = pg.evaluate("document.querySelector('table')?.innerText || ''")
    ok('örnek tablo yüklendi', len(once) > 50)
    ok('maskeli önizlemede etiket var', pg.evaluate("[...document.querySelectorAll('td, .tok')].some(e => /\\[[A-ZÇĞİÖŞÜ0-9_]+_\\d+\\]/.test(e.textContent))"))
    pg.set_input_files('#file', bomba); pg.wait_for_timeout(2500)
    durum = pg.inner_text('#fileStatus')
    ok('300 MB açılan dosya reddedildi', 'açılmadı' in durum)
    ok('ekrandaki tablo değişmedi', pg.evaluate("document.querySelector('table')?.innerText || ''") == once)
    pg.set_input_files('#file', sunum); pg.wait_for_timeout(3000)
    ok('görsel yeri listelendi (Slayt 2)', 'Slayt 2' in pg.inner_text('#sendSum'))
    ok('sayfa hatası yok', not hatalar)
    if hatalar: print(hatalar[:3])
    b.close()
print('SONUÇ:', 'hepsi geçti' if all(sonuc) else 'HATA')
sys.exit(0 if all(sonuc) else 1)
