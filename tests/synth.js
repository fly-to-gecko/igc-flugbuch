// Erzeugt synthetische IGC-Dateien für die Tests.
// Ein Flug wird als Folge von Phasen beschrieben: Dauer, Zielgeschwindigkeit (linear angefahren),
// Steigen, Kurvenrate und ENL-Wert.
const Synth = (() => {
  const pad = (n, w) => String(n).padStart(w, '0');
  const D2R = Math.PI / 180;

  function fmtLat(lat) {
    const ns = lat >= 0 ? 'N' : 'S'; lat = Math.abs(lat);
    let d = Math.floor(lat), m = Math.round((lat - d) * 60000);
    if (m >= 60000) { d++; m -= 60000; }
    return pad(d, 2) + pad(m, 5) + ns;
  }
  function fmtLon(lon) {
    const ew = lon >= 0 ? 'E' : 'W'; lon = Math.abs(lon);
    let d = Math.floor(lon), m = Math.round((lon - d) * 60000);
    if (m >= 60000) { d++; m -= 60000; }
    return pad(d, 3) + pad(m, 5) + ew;
  }
  function fmtAlt(a) { a = Math.round(a); return a < 0 ? '-' + pad(-a, 4) : pad(a, 5); }
  function fmtTime(t) {
    t = ((Math.round(t) % 86400) + 86400) % 86400;
    return pad(Math.floor(t / 3600), 2) + pad(Math.floor((t % 3600) / 60), 2) + pad(t % 60, 2);
  }

  function track(opts) {
    const o = Object.assign({ start: 36000, lat: 51.0, lon: 9.0, alt: 200, interval: 1, heading: 90 }, opts);
    let t = o.start, lat = o.lat, lon = o.lon, alt = o.alt, hdg = o.heading, v = 0;
    const fixes = [{ t, lat, lon, alt, enl: (o.phases[0] && o.phases[0].enl) || 0 }];
    for (const ph of o.phases) {
      const v0 = v, v1 = ph.speed != null ? ph.speed : v;
      const steps = Math.max(1, Math.round(ph.dur / o.interval));
      for (let s = 1; s <= steps; s++) {
        const dt = o.interval;
        v = v0 + (v1 - v0) * s / steps;
        hdg += (ph.turn || 0) * dt;
        alt += (ph.climb || 0) * dt;
        const d = v * dt;
        lat += d * Math.cos(hdg * D2R) / 111195;
        lon += d * Math.sin(hdg * D2R) / (111195 * Math.cos(lat * D2R));
        t += dt;
        fixes.push({ t, lat, lon, alt, enl: ph.enl || 0 });
      }
    }
    return fixes;
  }

  // headers: Array von H-Zeilen; date: 'DDMMYY'; withEnl: I-Record + ENL-Spalte; noGps: GPS-Höhe = 0
  function toIGC(fixes, opts = {}) {
    const lines = ['AXXXSYN Synthetischer Testlogger'];
    if (opts.dteLine !== null) lines.push(opts.dteLine || `HFDTEDATE:${opts.date || '080726'},01`);
    lines.push(...(opts.headers || ['HFPLTPILOTINCHARGE:Erika Mustermann', 'HFGTYGLIDERTYPE:ASK 21', 'HFGIDGLIDERID:D-1234']));
    if (opts.withEnl) lines.push('I013638ENL');
    for (const f of fixes) {
      const g = opts.noGps ? 0 : f.alt;
      lines.push('B' + fmtTime(f.t) + fmtLat(f.lat) + fmtLon(f.lon) + 'A' + fmtAlt(f.alt - 30) + fmtAlt(g) + (opts.withEnl ? pad(Math.max(0, Math.min(999, Math.round(f.enl))), 3) : ''));
    }
    lines.push('LXXXEnde', 'GABCDEF0123456789');
    return lines.join(opts.eol || '\r\n') + (opts.eol || '\r\n');
  }

  // Typische Flugabschnitte
  const ground = (dur, enl) => ({ dur, speed: 0, enl });
  const landing = [{ dur: 120, speed: 28, climb: -1.5 }, { dur: 8, speed: 20, climb: -1 }, { dur: 15, speed: 0 }, { dur: 180, speed: 0 }];
  const cruise = [
    { dur: 300, speed: 25, climb: -1 },
    { dur: 600, speed: 22, turn: 12, climb: 1.5 },
    { dur: 600, speed: 28, climb: -1 }
  ];

  const scenarios = {
    winch: () => [ground(120), { dur: 4, speed: 25 }, { dur: 40, speed: 25, climb: 10 }, { dur: 5, speed: 25, climb: 0 }, ...cruise, ...landing],
    aerotow: () => [ground(120), { dur: 10, speed: 28 }, { dur: 150, speed: 32, climb: 2.6 }, { dur: 20, speed: 32, climb: 4.0 }, { dur: 240, speed: 32, climb: 2.6 }, ...cruise, ...landing],
    aerotowStrong: () => [ground(120), { dur: 10, speed: 28 }, { dur: 40, speed: 32, climb: 3.4 }, { dur: 15, speed: 32, climb: 5.2 }, { dur: 300, speed: 32, climb: 3.2 }, ...cruise, ...landing],
    selfLaunch: () => [ground(60, 30), ground(30, 820), { dur: 12, speed: 26, enl: 860 }, { dur: 300, speed: 28, climb: 2, enl: 850 }, { dur: 20, speed: 25, climb: -1, enl: 120 }, ...cruise.map(p => Object.assign({ enl: 25 }, p)), ...landing.map(p => Object.assign({ enl: 15 }, p))],
    aerotowEnl: () => [ground(120, 10), { dur: 10, speed: 28, enl: 220 }, { dur: 400, speed: 32, climb: 2.6, enl: 240 }, ...cruise.map(p => Object.assign({ enl: 20 }, p)), ...landing.map(p => Object.assign({ enl: 10 }, p))]
  };

  return { fmtLat, fmtLon, fmtAlt, fmtTime, track, toIGC, scenarios };
})();
