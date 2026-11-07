// Tests der Parser-Logik (Core) mit synthetischen Daten. Läuft im Browser über tests/run_tests.py.
const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, err: e.message }); }
}
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || ''} erwartet ${JSON.stringify(b)}, erhalten ${JSON.stringify(a)}`); }
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error(`${msg || ''} erwartet ${b} ±${tol}, erhalten ${a}`); }
function ok(c, msg) { if (!c) throw new Error(msg || 'Bedingung nicht erfüllt'); }

const S = Synth.scenarios;
const sumDur = phases => phases.reduce((s, p) => s + p.dur, 0);
// Zeitpunkt, an dem die Landung zum Stillstand kommt: Ende der Phase "speed 0" nach dem Ausrollen
const stopTime = (start, phases) => start + sumDur(phases) - phases[phases.length - 1].dur;

// ---------- B-Records ----------
test('B-Record: Felder an festen Positionen (Beispiel aus IGC-Spezifikation)', () => {
  const p = Core.parseIGC('HFDTE160701\nB1101355206343N00006198WA0058700558\n');
  eq(p.fixes.length, 1);
  const f = p.fixes[0];
  eq(f.t, 11 * 3600 + 1 * 60 + 35, 'Zeit');
  near(f.lat, 52 + 6.343 / 60, 1e-9, 'Breite');
  near(f.lon, -(6.198 / 60), 1e-9, 'Länge (W negativ)');
  eq(f.valid, true, 'Gültigkeit A');
  eq(f.palt, 587, 'Druckhöhe'); eq(f.galt, 558, 'GPS-Höhe');
});

test('B-Record: negative Druckhöhe, Südhalbkugel, Gültigkeit V', () => {
  const f = Core.parseIGC('B0000003430000S05830000WV-001200015\n').fixes[0];
  eq(f.palt, -12); eq(f.galt, 15); eq(f.valid, false);
  near(f.lat, -34.5, 1e-9); near(f.lon, -58.5, 1e-9);
});

test('B-Record: ungültige / unvollständige Zeilen werden übersprungen', () => {
  const p = Core.parseIGC('B110135520634\nB1101355206343N00006198WA00587\nBxx\nB1101355206343N00006198WA0058700558\n');
  eq(p.fixes.length, 1);
});

test('I-Record: ENL-Position aus mehreren Extensions', () => {
  const p = Core.parseIGC('I033638FXA3940SIU4143ENL\nB1101355206343N00006198WA0058700558' + '123' + '07' + '456\n');
  eq(p.ext.ENL.start, 41); eq(p.ext.ENL.end, 43);
  eq(p.fixes[0].enl, 456);
});

test('I-Record fehlt: kein ENL-Wert', () => {
  eq(Core.parseIGC('B1101355206343N00006198WA0058700558123\n').fixes[0].enl, undefined);
});

// ---------- H-Records ----------
test('HFDTE: Format "HFDTE080726"', () => {
  const d = Core.parseIGC('HFDTE080726\n').date; eq(d.y, 2026); eq(d.m, 7); eq(d.d, 8);
});
test('HFDTE: Format "HFDTEDATE:080726,01"', () => {
  const d = Core.parseIGC('HFDTEDATE:080726,01\n').date; eq(d.y, 2026); eq(d.m, 7); eq(d.d, 8);
});
test('HFDTE: zweistelliges Jahr vor 1980 = 20xx, danach 19xx', () => {
  eq(Core.parseIGC('HFDTE010199\n').date.y, 1999);
  eq(Core.parseIGC('HFDTE010179\n').date.y, 2079);
});

test('H-Records mit ":" (aktuelles Format)', () => {
  const p = Core.parseIGC('HFPLTPILOTINCHARGE: Max Müller\nHFGTYGLIDERTYPE:Discus 2c\nHFGIDGLIDERID:D-KXYZ\nHFCM2CREW2:Anna B\nHFCIDCOMPETITIONID:XY\n');
  eq(p.pilot, 'Max Müller'); eq(p.gliderType, 'Discus 2c'); eq(p.gliderId, 'D-KXYZ'); eq(p.copilot, 'Anna B'); eq(p.compId, 'XY');
});
test('H-Records ohne ":" (ältere Dateien)', () => {
  const p = Core.parseIGC('HFPLTPILOT Hans Meier\nHFGTYGLIDERTYPE LS4\nHFGIDGLIDERIDD-5678\n');
  eq(p.pilot, 'Hans Meier'); eq(p.gliderType, 'LS4'); eq(p.gliderId, 'D-5678');
});
test('H-Records: Wert nach dem ERSTEN ":" und Platzhalter wie NKN', () => {
  const p = Core.parseIGC('HFPLTPILOTINCHARGE:Dr: Kurz\nHFGTYGLIDERTYPE:NKN\nHOGIDGLIDERID:D-0001\n');
  eq(p.pilot, 'Dr: Kurz'); eq(p.gliderType, ''); eq(p.gliderId, 'D-0001');
});
test('Header-Rohzeilen (A, H, I) werden gespeichert, B/L/G nicht', () => {
  const igc = Synth.toIGC(Synth.track({ phases: S.winch() }), { withEnl: true });
  const raw = Core.parseIGC(igc).headerRaw;
  ok(raw.length === 6, 'erwartet 6 Zeilen, erhalten ' + raw.length);
  ok(raw.every(l => /^[AHI]/.test(l)));
});

// ---------- Hilfsfunktionen ----------
test('Haversine: 1° Breite ≈ 111,2 km', () => near(Core.haversine(50, 9, 51, 9), 111195, 30));
test('Hash: gleiche Datei mit CRLF/LF identisch, andere Datei verschieden', () => {
  const a = 'HFDTE010126\r\nB1101355206343N00006198WA0058700558\r\n';
  eq(Core.hashText(a), Core.hashText(a.replace(/\r\n/g, '\n')));
  ok(Core.hashText(a) !== Core.hashText(a.replace('587', '588')));
});
test('Formatierung: Zeiten, Dauer, Datum', () => {
  eq(Core.fmtHM(86400 + 3600 + 59), '01:00'); eq(Core.fmtHMS(45296), '12:34:56');
  eq(Core.fmtDuration(605), '10:05'); eq(Core.fmtDuration(7), '0:07'); eq(Core.fmtDateDE('2026-07-08'), '08.07.2026');
});
test('CSV: BOM, Semikolon, Quoting', () => {
  const csv = Core.toCSV([['a', 'b;c', 'd"e'], ['1', '2', '3']]);
  eq(csv.charCodeAt(0), 0xFEFF);
  eq(csv.slice(1), 'a;"b;c";"d""e"\r\n1;2;3\r\n');
});

// ---------- Start-/Landeerkennung und Startart ----------
function run(name, opts = {}) {
  const phases = S[name]();
  const start = opts.start != null ? opts.start : 36000;
  const fx = Synth.track({ start, phases, interval: opts.interval || 1 });
  if (opts.mutate) opts.mutate(fx);
  const igc = Synth.toIGC(fx, Object.assign({ withEnl: /Enl|self/i.test(name) }, opts.igc));
  const a = Core.analyzeIGC(igc);
  return { a: a.flight, track: a.track, phases, start };
}

test('Windenstart: Start-/Landezeit und Startart', () => {
  const { a, start, phases } = run('winch');
  ok(a.detected, 'Flug erkannt');
  near(a.takeoffT, start + 120, 6, 'Startzeit');
  near(a.landingT, stopTime(start, phases), 8, 'Landezeit');
  eq(a.launchType, 'Windenstart');
  ok(a.launchMetrics.maxClimb15 > 8, 'max. Steigen ' + a.launchMetrics.maxClimb15);
  eq(a.date, '2026-07-08'); eq(a.altSource, 'GPS');
  eq(a.pilot, 'Erika Mustermann'); eq(a.gliderType, 'ASK 21'); eq(a.gliderId, 'D-1234');
});

test('Windenstart mit 4-s-Aufzeichnungsintervall', () => {
  const { a, start, phases } = run('winch', { interval: 4 });
  near(a.takeoffT, start + 120, 16, 'Startzeit'); near(a.landingT, stopTime(start, phases), 20, 'Landezeit');
  eq(a.launchType, 'Windenstart');
});

test('F-Schlepp (normal, kurzer Bart mit 4 m/s)', () => {
  const { a, start } = run('aerotow');
  near(a.takeoffT, start + 120, 6); eq(a.launchType, 'F-Schlepp');
});

test('F-Schlepp mit starkem Schlepp (15 s mit 5,2 m/s) wird nicht als Winde erkannt', () => {
  const { a } = run('aerotowStrong');
  ok(a.launchMetrics.maxClimb15 > 4.5, 'Testfall soll Steiggrenze überschreiten');
  eq(a.launchType, 'F-Schlepp');
});

test('Eigenstart über ENL', () => {
  const { a, start } = run('selfLaunch');
  near(a.takeoffT, start + 90, 6, 'Startzeit (Rollbeginn nach Motor-Warmlauf)');
  eq(a.launchType, 'Eigenstart');
  ok(a.launchMetrics.engineLaunch > 400);
});

test('F-Schlepp mit Schleppmaschinen-Geräusch (ENL ~240) bleibt F-Schlepp', () => {
  const { a } = run('aerotowEnl'); eq(a.launchType, 'F-Schlepp');
});

test('Mitternachtsübergang: Landung am Folgetag', () => {
  const { a, start, phases } = run('winch', { start: 23 * 3600 + 50 * 60 });
  near(a.takeoffT, start + 120, 6);
  ok(a.landingT > 86400, 'Landezeit läuft über 24 h hinaus');
  near(a.landingT, stopTime(start, phases), 8);
  eq(a.dayShift, 1); eq(a.date, '2026-07-08');
  eq(a.durationMin, Math.floor(a.landingT / 60) - Math.floor(a.takeoffT / 60));
  ok(a.durationMin > 25 && a.durationMin < 35, 'Dauer ' + a.durationMin);
});

test('Mitternachtsübergang vor dem Start: Datum = Folgetag von HFDTE', () => {
  const { a } = run('winch', { start: 23 * 3600 + 59 * 60 + 30 });
  eq(a.date, '2026-07-09'); eq(Core.fmtHM(a.takeoffT), '00:01'); eq(a.dayShift, 0);
});

test('GPS-Ausreißer am Boden erzeugt keinen Fehlstart', () => {
  const { a, start } = run('winch', { mutate: fx => { fx[50].lat += 0.0045; fx[51].lat += 0.0045; } });
  near(a.takeoffT, start + 120, 6);
});

test('Ohne GPS-Höhe wird die Druckhöhe verwendet', () => {
  const { a } = run('winch', { igc: { noGps: true } });
  eq(a.altSource, 'Druck'); eq(a.launchType, 'Windenstart');
});

test('Datei ohne Flug (nur Boden): Fallback auf erste/letzte Aufzeichnung', () => {
  const fx = Synth.track({ phases: [{ dur: 600, speed: 0 }] });
  const a = Core.analyzeIGC(Synth.toIGC(fx)).flight;
  eq(a.detected, false); eq(a.takeoffT, fx[0].t); eq(a.landingT, fx[fx.length - 1].t);
});

test('Datei ohne B-Records wirft verständlichen Fehler', () => {
  let msg = '';
  try { Core.analyzeIGC('HFDTE010126\n'); } catch (e) { msg = e.message; }
  ok(/B-Records/.test(msg), msg);
});

test('Track wird kompakt gespeichert (≤ 1501 Punkte)', () => {
  const { track } = run('winch');
  ok(track.t.length <= 1501 && track.t.length > 100, 'Punkte ' + track.t.length);
  eq(track.t[0], 0);
});

// ---------- CUP ----------
const CUP = [
  'name,code,country,lat,lon,elev,style,rwdir,rwlen,freq,desc',
  '"Musterstadt","EDXM",DE,5107.830N,00949.000E,250.0m,4,070,800m,"123.505","Segelfluggelände"',
  '"Berg, Ober-","OBER",DE,4800.000N,01130.500E,1640ft,2,,,,"Gras, Hang"',
  '"Wende ""Kirche""",KIR,DE,5000.000N,01000.000E,300m,1,,,,',
  '"Süd",SUD,AR,3430.000S,05830.000W,10m,5,,,,',
  '"Feld 7",F7,DE,5000.000N,00900.000E,200m,3,,,,',
  '-----Related Tasks-----',
  '"Task1","Musterstadt","Berg, Ober-"',
  'Options,NoStart=10:00:00'
].join('\r\n');

test('CUP-Koordinaten DDMM.mmmN / DDDMM.mmmE', () => {
  near(Core.parseCupLat('5107.830N'), 51.1305, 1e-9);
  near(Core.parseCupLon('00949.000E'), 9 + 49 / 60, 1e-9);
  near(Core.parseCupLat('3430.000S'), -34.5, 1e-9);
  near(Core.parseCupLon('05830.000W'), -58.5, 1e-9);
  ok(isNaN(Core.parseCupLat('51.1305')));
});
test('CUP: Anführungszeichen, Kommas in Namen, Höhe in ft', () => {
  const r = Core.parseCUP(CUP, null);
  eq(r.items.length, 5);
  eq(r.items[1].name, 'Berg, Ober-'); eq(r.items[1].elev, 500); eq(r.items[1].code, 'OBER');
  eq(r.items[2].name, 'Wende "Kirche"');
  eq(r.items[0].elev, 250); eq(r.items[0].style, 4);
});
test('CUP: Abschnitt "Related Tasks" wird ignoriert', () => {
  ok(!Core.parseCUP(CUP, null).items.some(i => i.name === 'Task1' || i.name === 'Options'));
});
test('CUP: nur Flugplätze (Style 2, 4, 5)', () => {
  const r = Core.parseCUP(CUP, [2, 4, 5]);
  eq(r.items.map(i => i.name).join('|'), 'Musterstadt|Berg, Ober-|Süd'); eq(r.filtered, 2);
});
test('CUP ohne Kopfzeile (Standardreihenfolge)', () => {
  const r = Core.parseCUP('"A",A1,DE,5000.000N,00900.000E,100m,4\n', null);
  eq(r.items.length, 1); near(r.items[0].lat, 50, 1e-9);
});
test('Koordinaten-Eingabe dezimal und CUP-Format', () => {
  const a = Core.parseCoordInput('51,1305; 9,8167'); near(a.lat, 51.1305, 1e-9); near(a.lon, 9.8167, 1e-9);
  const b = Core.parseCoordInput('5107.830N 00949.000E'); near(b.lat, 51.1305, 1e-9);
  eq(Core.parseCoordInput('abc'), null); eq(Core.parseCoordInput('95, 10'), null);
});

// ---------- Flugplatz-Abgleich ----------
test('Flugplatz-Abgleich: Radius 3 km und nächster Platz', () => {
  const afs = [{ name: 'A', lat: 51, lon: 9 }, { name: 'B', lat: 51.02, lon: 9 }];
  eq(Core.matchAirfield(51 - 2900 / 111195, 9, afs).airfield.name, 'A');
  eq(Core.matchAirfield(51 - 3100 / 111195, 9, afs), null);
  eq(Core.matchAirfield(51.015, 9, afs).airfield.name, 'B');
});

// ---------- Ausgabe ----------
const failed = results.filter(r => !r.ok);
document.getElementById('out').textContent =
  results.map(r => (r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '\n     ' + r.err)).join('\n') +
  `\n\nERGEBNIS: ${results.length - failed.length}/${results.length} bestanden`;
