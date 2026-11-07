# IGC-Flugbuch

Digitales Flugbuch für den Segelflug: IGC-Dateien hineinziehen, Start/Landung, Flugzeit,
Startart und Flugplätze werden automatisch erkannt. Eine einzige HTML-Datei, kein Build, kein Server.

**Starten:** `index.html` im Browser öffnen (Doppelklick). Für Karte und Lufträume ist Internet nötig.

## Funktionen

- Upload mehrerer `.igc`-Dateien per Drag & Drop oder Dateiauswahl; Duplikate werden über einen Inhaltshash erkannt
- Erkennung von Datum (`HFDTE…` und `HFDTEDATE:…`), Start-/Landezeit in **UTC**, Flugzeit, Start-/Landeort,
  Pilot, Flugzeugtyp, Kennzeichen (auch ältere H-Records ohne `:`)
- Startart-Heuristik (Windenstart / F-Schlepp / Eigenstart), per Dropdown korrigierbar; der Tooltip zeigt die Messwerte
- Flugplatz-Datenbank: Abgleich im Radius 3 km, Benennen unbekannter Orte direkt in der Tabelle,
  Import von SeeYou-`.cup`-Dateien, manuelles Hinzufügen/Suchen/Löschen, optionale Suche über die openAIP-API
- Tabelle mit direkt editierbaren Zellen, Suche, Sortierung und Statistik-Kacheln
- Karte (Leaflet) mit Start-/Landeort, Flugstrecke und openAIP-Lufträumen (eigener API-Key)
- Barogramm auf Canvas mit Fadenkreuz und ENL-Anzeige
- IGC-Header (A-, H-, I-Zeilen) als Rohtext
- CSV-Export (`;`, UTF-8 mit BOM für Excel) und JSON-Sicherung zum Übertragen/Wiederherstellen

## Speicherung

Die Daten bleiben im Browser: `window.storage` (Claude-Artifact), sonst IndexedDB, sonst `localStorage`.
IndexedDB wird bevorzugt, weil die Tracks für Karte und Barogramm mitgespeichert werden und `localStorage`
(~5 MB) dafür schnell zu klein wäre. Das Flugbuch startet leer. **Regelmäßig über „Sicherung“ exportieren.**

## Erkennungslogik

| Schritt | Regel |
|---|---|
| Geschwindigkeit | Haversine zwischen Fixes, gleitender Mittelwert ±5 Fixes, GPS-Sprünge > 150 m/s verworfen |
| Start | erste Stelle > 10 m/s, die ≥ 60 s darüber bleibt; zurück bis < 2 m/s (Rollbeginn) |
| Landung | dieselbe Logik vom Dateiende rückwärts, dann vorwärts bis zum Ausrollen |
| Eigenstart | ENL- (oder MOP-)Mittel der ersten 120 Fixes > 400 und deutlich über dem Flug-Median |
| Windenstart | max. Steigen über 15 s > 4,5 m/s und (Höhengewinn in 90 s > 180 m oder Ø-Steigen > 2,8 m/s), Steigphase endet innerhalb ~80 s (Ausklinken) – außer bei > 7 m/s |
| sonst | F-Schlepp |

Das Kriterium „Steigphase endet“ ist eine Ergänzung: Ohne sie wurde ein kräftiger F-Schlepp mit kurzem
Bart (5 m/s) als Windenstart erkannt. Die Schwellwerte stehen gesammelt in `Core.CFG` in `index.html`.

Die Flugzeit ergibt sich aus den angezeigten Minuten (Landung 11:15 − Start 10:03 = 1:12), damit Tabelle und
Flugbuch übereinstimmen. Landungen nach Mitternacht werden mit `+1` markiert.

## Tests

```bash
python3 tests/run_tests.py      # Parser-Tests in headless Chrome/Chromium
python3 tests/make_samples.py   # synthetische Beispiel-IGC-Dateien nach tests/beispiele/
```

Die Tests lesen den Core-Block direkt aus `index.html` und prüfen B-/H-/I-Records, Mitternachtsübergang,
Start-/Landeerkennung, Startart, CUP-Parsing, Flugplatz-Abgleich und CSV. Die Dateien in `tests/beispiele/` sind
synthetisch und nur zum Ausprobieren gedacht.
