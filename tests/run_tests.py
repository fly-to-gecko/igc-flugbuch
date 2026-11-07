#!/usr/bin/env python3
"""Führt die Parser-Tests in headless Chrome/Chromium aus.

Der Core-Block wird direkt aus index.html gelesen, damit genau der Code
getestet wird, der auch in der App läuft.  Aufruf:  python3 tests/run_tests.py
"""
import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
html = (ROOT / "index.html").read_text(encoding="utf-8")
start = html.index("// ===== CORE START =====")
end = html.index("// ===== CORE END =====")
core = html[start:end]

page = f"""<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><pre id="out">nicht gelaufen</pre>
<script>{core}</script>
<script>{(ROOT / 'tests' / 'synth.js').read_text(encoding='utf-8')}</script>
<script>
try {{
{(ROOT / 'tests' / 'core.test.js').read_text(encoding='utf-8')}
}} catch (e) {{ document.getElementById('out').textContent = 'ABBRUCH: ' + e.stack; }}
</script></body></html>"""

browser = next((b for b in ("google-chrome", "chromium", "chromium-browser") if shutil.which(b)), None)
if not browser:
    sys.exit("Kein Chrome/Chromium gefunden.")

with tempfile.TemporaryDirectory() as tmp:
    f = pathlib.Path(tmp) / "tests.html"
    f.write_text(page, encoding="utf-8")
    out = subprocess.run(
        [browser, "--headless=new", "--disable-gpu", "--no-first-run", f"--user-data-dir={tmp}/profile",
         "--dump-dom", f.as_uri()],
        capture_output=True, text=True, timeout=120,
    ).stdout

import html as h
import re

m = re.search(r'<pre id="out">(.*?)</pre>', out, re.S)
text = h.unescape(m.group(1)) if m else out
print(text)
sys.exit(0 if "ERGEBNIS" in text and "FAIL" not in text else 1)
