#!/usr/bin/env python3
"""Erzeugt synthetische Beispiel-IGC-Dateien in tests/beispiele/ (zum Ausprobieren der Oberfläche).

Die Dateien werden mit tests/synth.js in headless Chrome erzeugt.  Aufruf:  python3 tests/make_samples.py
"""
import html as h
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / "beispiele"

script = """
const S = Synth.scenarios, files = {};
const mk = (name, sc, o) => files[name] = Synth.toIGC(Synth.track(Object.assign({ phases: S[sc]() }, o.track)), o.igc || {});
mk('2026-07-08_winde_ask21.igc', 'winch', { track: { start: 36000, lat: 51.13, lon: 9.82 } });
mk('2026-07-08_fschlepp_ls4.igc', 'aerotow', { track: { start: 45000, lat: 51.13, lon: 9.82 },
  igc: { dteLine: 'HFDTE080726', headers: ['HFPLTPILOT Hans Meier', 'HFGTYGLIDERTYPE LS4', 'HFGIDGLIDERIDD-5678'] } });
mk('2026-07-09_eigenstart_arcus.igc', 'selfLaunch', { track: { start: 39000, lat: 48.0, lon: 11.51 },
  igc: { date: '090726', withEnl: true, headers: ['HFPLTPILOTINCHARGE:Erika Mustermann', 'HFCM2CREW2:Max Muster', 'HFGTYGLIDERTYPE:Arcus M', 'HFGIDGLIDERID:D-KAMM', 'HFCIDCOMPETITIONID:AM'] } });
mk('2026-07-10_nachtflug_mitternacht.igc', 'winch', { track: { start: 85800, lat: 50.5, lon: 8.0 }, igc: { date: '100726' } });
document.getElementById('out').textContent = JSON.stringify(files);
"""

page = f"""<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><pre id="out"></pre>
<script>{(ROOT / 'synth.js').read_text(encoding='utf-8')}</script><script>{script}</script></body></html>"""

browser = next((b for b in ("google-chrome", "chromium", "chromium-browser") if shutil.which(b)), None)
if not browser:
    sys.exit("Kein Chrome/Chromium gefunden.")
with tempfile.TemporaryDirectory() as tmp:
    f = pathlib.Path(tmp) / "gen.html"
    f.write_text(page, encoding="utf-8")
    dom = subprocess.run([browser, "--headless=new", "--disable-gpu", "--no-first-run", f"--user-data-dir={tmp}/p",
                          "--dump-dom", f.as_uri()], capture_output=True, text=True, timeout=120).stdout
files = json.loads(h.unescape(re.search(r'<pre id="out">(.*?)</pre>', dom, re.S).group(1)))
OUT.mkdir(exist_ok=True)
for name, text in files.items():
    (OUT / name).write_bytes(text.encode("utf-8"))
    print("geschrieben:", OUT / name)
