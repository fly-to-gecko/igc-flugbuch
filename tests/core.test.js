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

// ---------- Lufträume ----------
const OPENAIR = [
  '* Kommentar: effective from 25th March 2021',
  'AC CTR', 'AN CTR Teststadt', 'AH 3000ft MSL', 'AL GND',
  'DP 51:00:00 N 009:00:00 E', 'DP 51:00:00 N 009:10:00 E', 'DP 50:54:00 N 009:10:00 E', 'DP 50:54:00 N 009:00:00 E', 'DP 51:00:00 N 009:00:00 E',
  '', 'AC C', 'AN TMA Hoch', 'AH FL100', 'AL FL65',
  'DP 51:30:00 N 010:00:00 E', 'DP 51:30:00 N 010:20:00 E', 'DP 51:20:00 N 010:20:00 E', 'DP 51:20:00 N 010:00:00 E',
  '', 'AC R', 'AN ED-R Kreis', 'AH 5000ft MSL', 'AL GND', 'V X=52:00:00 N 011:00:00 E', 'DC 2',
  '', 'AC D', 'AN EDXX Luftraum D', 'AH 4500ft MSL', 'AL 1500ft MSL',
  'DP 50:30:00 N 008:00:00 E', 'DP 50:30:00 N 008:10:00 E', 'DP 50:24:00 N 008:10:00 E', 'DP 50:24:00 N 008:00:00 E',
  '', 'AC W', 'AN Segelflugsektor West', 'AH 4500ft MSL', 'AL GND',
  'DP 50:31:00 N 007:59:00 E', 'DP 50:31:00 N 008:11:00 E', 'DP 50:23:00 N 008:11:00 E', 'DP 50:23:00 N 007:59:00 E',
  '', 'AC TMZ', 'AN TMZ Test', 'AH FL100', 'AL GND',
  'DP 51:00:00 N 009:00:00 E', 'DP 51:00:00 N 009:10:00 E', 'DP 50:54:00 N 009:10:00 E', 'DP 50:54:00 N 009:00:00 E',
  '', 'AC E', 'AN Luftraum E', 'AH FL100', 'AL 2500ft AGL',
  'DP 51:00:00 N 009:00:00 E', 'DP 51:00:00 N 009:10:00 E', 'DP 50:54:00 N 009:10:00 E',
  '', 'AC Q', 'AN ED-D Bogen', 'AH FL100', 'AL GND', 'V X=53:00:00 N 012:00:00 E', 'V D=-', 'DA 3,90,270',
  '', 'AC Q', 'AN ED-D Bogen DB', 'AH FL100', 'AL GND', 'V X=54:00:00 N 012:00:00 E', 'V D=+', 'DB 54:00:00 N 011:55:06 E, 54:00:00 N 012:04:54 E'
].join('\r\n');

// Track direkt im kompakten Format: Punkte [Sekunde, Breite, Länge, GPS-Höhe, Druckhöhe]
function mkTrack(points) {
  return { t0: 0, t: points.map(p => p[0]), lat: points.map(p => Math.round(p[1] * 1e5)), lon: points.map(p => Math.round(p[2] * 1e5)),
    alt: points.map(p => p[3]), palt: points.map(p => p[4] != null ? p[4] : p[3]) };
}
// Gerader Flug von A nach B im Abstand von 10 s
function line(lat1, lon1, lat2, lon2, alt, palt, t0 = 1000, n = 60) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push([t0 + i * 10, lat1 + (lat2 - lat1) * i / n, lon1 + (lon2 - lon1) * i / n, alt, palt]);
  return pts;
}
const AS = Core.parseOpenAir(OPENAIR).items;
const byName = n => AS.find(a => a.name === n);
const flightOf = pts => ({ takeoffT: pts[0][0] - 600, landingT: pts[pts.length - 1][0] + 600 });
const NEUTRAL = { geoid: 0 };
const check = pts => Core.checkAirspaces(mkTrack(pts), flightOf(pts), AS, NEUTRAL);

test('OpenAir: Koordinaten D:M:S und D:M.m', () => {
  const a = Core.parseOpenAirCoord('49:14:38 N 010:31:20 E'); near(a[0], 49 + 14 / 60 + 38 / 3600, 1e-9); near(a[1], 10 + 31 / 60 + 20 / 3600, 1e-9);
  const b = Core.parseOpenAirCoord('49:14.5 S 010:31.25 W'); near(b[0], -(49 + 14.5 / 60), 1e-9); near(b[1], -(10 + 31.25 / 60), 1e-9);
});
test('OpenAir: Höhengrenzen', () => {
  const L = s => Core.parseAltLimit(s);
  eq(L('GND').ref, 'GND'); eq(L('SFC').ref, 'GND'); eq(L('0ft AGL').ref, 'GND'); eq(L('UNL').ref, 'UNL');
  near(L('3000ft MSL').m, 914.4, 0.01); eq(L('3500 ft').ref, 'MSL');
  near(L('FL95').m, 2895.6, 0.01); near(L('FL 65').m, 1981.2, 0.01); eq(L('FL 65').ref, 'FL');
  eq(L('2500ft AGL').ref, 'AGL'); eq(L('1000ft GND').ref, 'AGL'); near(L('1500m MSL').m, 1500, 0.01);
});
test('OpenAir: alle Lufträume gelesen (Polygon, Kreis, Bögen), Kommentare ignoriert', () => {
  eq(AS.length, 9);
  eq(byName('CTR Teststadt').cls, 'CTR');
  const r = byName('ED-R Kreis');
  ok(r.poly.length > 60, 'Kreis in Punkte umgerechnet');
  near(Core.haversine(52, 11, r.poly[10][0], r.poly[10][1]), 2 * 1852, 5, 'Radius 2 NM');
  ok(byName('ED-D Bogen').poly.length > 20 && byName('ED-D Bogen DB').poly.length > 20, 'DA/DB-Bögen');
});
test('OpenAir: Kreis – innen/außen', () => {
  const r = byName('ED-R Kreis');
  ok(Core.pointInPoly(52 + 3000 / 111195, 11, r.poly), '3 km innen'); ok(!Core.pointInPoly(52 + 4000 / 111195, 11, r.poly), '4 km außen');
});
test('OpenAir: Bögen DA (gegen den Uhrzeigersinn) und DB (im Uhrzeigersinn) – Halbkreis im Norden', () => {
  for (const [n, c] of [['ED-D Bogen', 53], ['ED-D Bogen DB', 54]]) {
    const q = byName(n);
    ok(Core.pointInPoly(c + 0.02, 12, q.poly), n + ': Nordhälfte innen'); ok(!Core.pointInPoly(c - 0.02, 12, q.poly), n + ': Südhälfte außen');
  }
});
test('Gültigkeitsdatum aus Dateikopf oder Dateiname', () => {
  eq(Core.guessValidFrom(OPENAIR, 'x.txt'), '2021-03-25');
  eq(Core.guessValidFrom('AC D', 'OpenAir_Airspace_Germany_CW14_2015.txt'), '2015-01-01');
  eq(Core.guessValidFrom('AC D', 'airspace.txt'), '');
});
test('Luftraumprüfung: Durchflug CTR unterhalb der Obergrenze = Verletzung, TMZ = Info', () => {
  const f = check(line(50.97, 8.9, 50.97, 9.3, 600));
  const ctr = f.find(x => x.name === 'CTR Teststadt');
  ok(ctr, 'CTR erkannt'); eq(ctr.kind, 'verletzung');
  ok(ctr.t2 > ctr.t1, 'Zeitraum'); near(ctr.maxVert, 914 - 600, 2, 'Abstand zur Obergrenze');
  eq(f.find(x => x.name === 'TMZ Test').kind, 'info');
  ok(!f.some(x => x.cls === 'E'), 'Luftraum E wird ignoriert');
});
test('Luftraumprüfung: über der CTR und knapp unter der Obergrenze (Toleranz) = keine Meldung', () => {
  ok(!check(line(50.97, 8.9, 50.97, 9.3, 1000)).some(x => x.cls === 'CTR'), 'über der CTR');
  ok(!check(line(50.97, 8.9, 50.97, 9.3, 900)).some(x => x.cls === 'CTR'), '14 m unter der Grenze');
});
test('Luftraumprüfung: Flugflächen werden mit der Druckhöhe verglichen', () => {
  const pts = line(51.4, 9.9, 51.4, 10.4, 2100, 1900); // FL65 = 1981 m
  ok(!check(pts).some(x => x.name === 'TMA Hoch'), 'Druckhöhe unter FL65');
  ok(check(line(51.4, 9.9, 51.4, 10.4, 2100, 2100)).some(x => x.name === 'TMA Hoch' && x.kind === 'verletzung'), 'Druckhöhe über FL65');
});
test('Luftraumprüfung: Flug im Segelflugsektor = sektor statt Verletzung', () => {
  const f = check(line(50.45, 7.95, 50.45, 8.2, 900)).find(x => x.name === 'EDXX Luftraum D');
  ok(f, 'D erkannt'); eq(f.kind, 'sektor');
});
test('Luftraumprüfung: Start in der CTR = prüfen (Freigabe wahrscheinlich)', () => {
  const pts = line(50.97, 9.05, 50.97, 9.4, 600);
  const f = Core.checkAirspaces(mkTrack(pts), { takeoffT: pts[0][0], landingT: pts[pts.length - 1][0] + 600 }, AS, NEUTRAL).find(x => x.cls === 'CTR');
  eq(f.kind, 'pruefen'); ok(f.notes.some(n => /Start/.test(n)));
});
test('Luftraumprüfung: Abstieg aus Luftraum C kurz vor der Landung bleibt Verletzung', () => {
  const pts = line(51.4, 9.9, 51.4, 10.5, 2100, 2100).map((p, i, arr) => i > arr.length - 8 ? [p[0], p[1], p[2], 1500, 1500] : p);
  const f = Core.checkAirspaces(mkTrack(pts), { takeoffT: pts[0][0] - 600, landingT: pts[pts.length - 1][0] + 30 }, AS, NEUTRAL).find(x => x.name === 'TMA Hoch');
  eq(f.kind, 'verletzung');
});
test('Luftraumprüfung: Flugbeschränkungsgebiet = prüfen (Aktivierung unbekannt)', () => {
  eq(check(line(51.95, 10.9, 52.05, 11.1, 800)).find(x => x.cls === 'R').kind, 'pruefen');
});
test('Luftraumprüfung: Track ohne Druckhöhe nutzt GPS-Höhe für FL', () => {
  const tr = mkTrack(line(51.4, 9.9, 51.4, 10.4, 2100)); tr.palt = null;
  ok(Core.checkAirspaces(tr, flightOf(line(51.4, 9.9, 51.4, 10.4, 2100)), AS, NEUTRAL).some(x => x.name === 'TMA Hoch'));
});

// Höhenbezug: Boden 400 m, QNH hoch (Druckhöhe 80 m zu niedrig), GPS über Ellipsoid (+45 m).
// Wahre Höhe beim CTR-Durchflug 880 m (34 m unter der Obergrenze 914 m).
function qnhFlight() {
  const ground = [], fly = [];
  for (let i = 0; i < 12; i++) ground.push([400 + i * 10, 50.97, 8.85, 400 + 45, 400 - 80]);
  for (const p of line(50.97, 8.9, 50.97, 9.3, 880 + 45, 880 - 80, 600)) fly.push(p);
  const pts = ground.concat(fly);
  return { tr: mkTrack(pts), flight: { takeoffT: 520, landingT: fly[fly.length - 1][0] + 600, altSource: 'GPS' } };
}
test('Höhenbezug: mit Platzhöhe wird die Druckhöhe auf QNH abgeglichen', () => {
  const { tr, flight } = qnhFlight();
  const r = Core.checkAirspaces(tr, flight, AS, { takeoffElev: 400 });
  const ctr = r.find(x => x.cls === 'CTR');
  ok(ctr && ctr.kind === 'verletzung', 'CTR-Verletzung erkannt');
  near(ctr.maxAlt, 880, 2, 'MSL-Höhe'); eq(r.altRef.estimated, false); ok(/QNH 1023/.test(r.altRef.method), r.altRef.method);
});
test('Höhenbezug: unkorrigierte GPS-Höhe (Ellipsoid) hätte die Verletzung übersehen', () => {
  const { tr, flight } = qnhFlight();
  ok(!Core.checkAirspaces(tr, flight, AS, { geoid: 0 }).some(x => x.cls === 'CTR'));
});
test('Höhenbezug: ohne Platzhöhe GPS minus Geoid-Schätzung, knappe Fälle = prüfen', () => {
  const { tr, flight } = qnhFlight();
  const r = Core.checkAirspaces(tr, flight, AS);
  const ctr = r.find(x => x.cls === 'CTR');
  eq(ctr.kind, 'pruefen'); ok(ctr.notes.some(n => /geschätzt/.test(n))); eq(r.altRef.estimated, true);
});
test('Höhenbezug: QNH-Änderung zwischen Start und Landung wird ausgeglichen', () => {
  const pts = [[0, 50, 8, 445, 320], [100, 50, 8, 445, 320], [1000, 50.5, 8.5, 1500, 1400], [2000, 51, 9, 445, 340], [2100, 51, 9, 445, 340]];
  const m = Core.altitudeModel(mkTrack(pts), { takeoffT: 100, landingT: 2000 }, { takeoffElev: 400, landingElev: 400 });
  near(m.msl(0), 400, 0.5); near(m.msl(3), 400, 0.5, 'Landung'); near(m.msl(2), 1400 + 80 - 20 * (900 / 1900), 0.5, "Mitte interpoliert");
});

// ---------- Ausgabe ----------
const failed = results.filter(r => !r.ok);
document.getElementById('out').textContent =
  results.map(r => (r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '\n     ' + r.err)).join('\n') +
  `\n\nERGEBNIS: ${results.length - failed.length}/${results.length} bestanden`;
