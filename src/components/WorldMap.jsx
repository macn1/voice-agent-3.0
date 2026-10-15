// Dot-grid world map. Land is a 2° raster of Natural Earth 1:50m land
// (180 × 71 cells, 84°N → 58°S, equirectangular), run-length encoded per row:
// base-36 counts that alternate water, land, water…

import { useMemo, useState } from 'react';
import { number as fmtNum } from '../lib/format';

const STEP = 2;
const TOP = 84;
const COLS = 180;
const CELL = 10;

const LAND = [
  "1d.a.8.c.2t", "16.16.u.1.5.1.f.2.16", "y.1.3.2.1.c.1.q.f.8.y.5.12", "u.2.2.1.2.1.2.1.1.3.1.5.4.p.h.2.o.1.h.5.y",
  "w.5.3.3.1.6.b.k.11.3.d.d.c.3.i", "s.7.1.2.1.5.1.7.a.h.12.1.7.1.1.2.1.o.6.3.h", "0.1.9.4.e.1.2.7.4.2.1.b.7.g.o.2.c.1.5.1b.a",
  "0.1.6.w.2.1.1.3.1.2.1.1.1.4.7.f.k.b.3.1.5.1q", "0.4.4.15.4.6.4.a.o.e.1.1w", "2.2.2.14.1.2.2.1.1.5.6.6.9.4.d.5.1.26",
  "4.1.3.11.2.2.5.4.7.4.b.1.c.7.1.27", "7.10.8.4.b.3.n.7.2.1v.2.6.4", "9.4.7.n.8.5.1.1.u.1.4.6.3.1q.2.1.3.1.9",
  "a.2.1.1.8.o.5.8.s.2.5.1.1.3.2.1n.8.4.8", "n.q.1.b.p.3.5.3.1.1.1.1n.9.3.9", "p.o.1.c.n.2.1.3.2.1x.6.2.a", "q.10.q.20.1.1.6.1.b",
  "s.v.2.2.p.20.1.1.i", "s.u.5.1.p.1y.2.1.i", "s.v.u.7.1.8.2.1.1.1d.m", "s.r.u.8.2.2.2.5.6.1b.3.2.i", "s.q.v.6.3.1.2.7.1.1e.5.1.j",
  "s.p.w.5.4.1.3.1.1.2.1.1a.3.2.6.1.j", "t.n.y.3.2.5.1.1.3.1.1.1c.2.2.3.3.j", "t.n.z.8.d.16.3.1.2.4.k", "v.j.10.b.3.1.6.18.4.2.n",
  "w.i.z.e.1.1f.t", "x.9.6.2.z.t.1.10.t", "x.9.7.1.x.o.1.7.2.x.u", "y.1.1.5.15.y.4.u.u", "11.4.7.3.v.q.1.b.4.o.2.1.t",
  "11.4.4.2.4.1.u.r.1.a.5.9.2.8.1.1.y", "12.4.2.2.7.3.q.r.1.9.7.6.5.6.1.1.z", "14.6.10.s.1.6.9.5.6.7.6.1.t",
  "18.4.x.t.1.5.b.3.9.6.5.1.t", "1a.2.x.w.e.3.9.6.5.2.s", "1b.1.4.5.p.u.1.3.c.2.9.1.2.2.8.1.r", "1c.c.n.w.d.1.1.1.8.1.2.1.9.1.r",
  "1f.a.n.v.f.1.9.1.7.1.3.1.r", "1f.d.l.5.3.l.o.1.1.2.5.3.u", "1f.e.u.i.q.1.1.1.4.3.v", "1e.f.u.h.r.3.2.5.1.2.2.1.p",
  "1e.h.r.h.t.2.3.4.1.1.2.1.1.2.n", "1d.l.p.f.v.2.2.3.1.2.5.6.i", "1d.n.o.e.w.1.f.5.2.1.e", "1e.n.n.e.x.4.c.5.g",
  "1f.l.o.e.12.2.1.2.7.2.1.1.g", "1f.l.p.d.1y", "1g.j.p.f.3.1.14.3.3.1.i", "1g.j.p.f.2.2.11.6.3.2.h", "1i.h.p.e.2.3.10.c.h",
  "1j.f.q.c.4.3.10.d.g", "1j.f.r.b.4.2.y.h.7.1.7", "1j.e.s.b.4.2.x.i.f", "1i.c.v.a.5.2.x.j.e", "1i.c.v.a.14.k.d",
  "1i.b.x.8.15.k.d", "1i.b.y.6.17.j.d", "1i.a.z.5.18.5.4.9.e", "1i.9.2d.1.9.7.f", "1h.9.2q.5.c.1.2", "1h.8.38.2.1",
  "1h.6.2v.2.c.2.2", "1h.5.2x.1.b.2.3", "1h.4.39.2.4", "1h.4.39.1.5", "1g.4.1w.1.1j", "1h.3.4.1.3b", "1h.3.3g", "1j.2.3f", "50",
];

const DOTS = (() => {
  const out = [];
  LAND.forEach((row, r) => {
    let c = 0;
    row.split('.').forEach((run, i) => {
      const n = parseInt(run, 36);
      if (i % 2) for (let k = 0; k < n; k++) out.push([c + k, r]);
      c += n;
    });
  });
  return out;
})();

const W = COLS * CELL;
const H = LAND.length * CELL;

/** Approximate centre of each country (lat, lng), keyed by ISO 3166-1 alpha-2. */
export const COUNTRY_CENTER = {
  AE: [24.2, 54.4], AR: [-34.6, -64.2], AT: [47.5, 14.6], AU: [-25.3, 134], BD: [23.7, 90.4], BE: [50.6, 4.7],
  BH: [26.1, 50.6], BR: [-12, -51.9], CA: [56.1, -106.3], CH: [46.8, 8.2], CL: [-33.4, -70.6], CN: [35.9, 104.2],
  CO: [4.6, -74.1], CZ: [49.8, 15.5], DE: [51.2, 10.4], DK: [56.3, 9.5], EG: [26.8, 30.8], ES: [40.5, -3.7],
  FI: [62, 25.7], FR: [46.6, 2.2], GB: [53.5, -1.8], GH: [7.9, -1], GR: [39.1, 21.8], HK: [22.3, 114.2],
  ID: [-2.5, 117.9], IE: [53.4, -8.2], IL: [31.1, 34.9], IN: [21.8, 78.9], IT: [42.8, 12.6], JP: [36.2, 138.3],
  KE: [-0.02, 37.9], KR: [36.5, 127.9], KW: [29.3, 47.5], LK: [7.9, 80.8], MA: [31.8, -7.1], MX: [23.6, -102.6],
  MY: [4.2, 102], NG: [9.1, 8.7], NL: [52.1, 5.3], NO: [61.5, 9], NP: [28.4, 84.1], NZ: [-41.5, 172.8],
  OM: [21.5, 55.9], PE: [-9.2, -75], PH: [12.9, 121.8], PK: [30.4, 69.3], PL: [52, 19.1], PT: [39.6, -8],
  QA: [25.3, 51.2], RO: [45.9, 24.9], RU: [61.5, 96], SA: [23.9, 45.1], SE: [62.2, 15.6], SG: [1.35, 103.8],
  TH: [15.9, 100.9], TR: [39, 35.2], TW: [23.7, 121], TZ: [-6.4, 34.9], UA: [48.4, 31.2], US: [39.8, -98.6],
  VN: [14.1, 108.3], ZA: [-30.6, 22.9],
};

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(undefined, { type: 'region' });
  } catch {
    return null;
  }
})();

export function countryName(code) {
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

const project = ([lat, lng]) => [((lng + 180) / STEP) * CELL, ((TOP - lat) / STEP) * CELL];

/**
 * `points` is [{ code, count }]; codes without a known centre are skipped.
 * `selected` / `onSelect` highlight one country.
 */
export function WorldMap({ points, selected, onSelect, unit = 'customer' }) {
  const [hover, setHover] = useState(null);
  const pins = useMemo(() => {
    const max = Math.max(1, ...points.map((p) => p.count));
    return points
      .filter((p) => COUNTRY_CENTER[p.code])
      .map((p) => {
        const [x, y] = project(COUNTRY_CENTER[p.code]);
        return { ...p, x, y, r: 14 + Math.sqrt(p.count / max) * 20 };
      })
      .sort((a, b) => b.count - a.count);
  }, [points]);

  // Land dots near a pin pick up its glow.
  const lit = useMemo(() => {
    const m = new Map();
    pins.forEach((p) => {
      const reach = p.r * 2.6;
      DOTS.forEach(([c, r]) => {
        const dx = c * CELL + CELL / 2 - p.x;
        const dy = r * CELL + CELL / 2 - p.y;
        const d = Math.hypot(dx, dy);
        if (d < reach) m.set(`${c}:${r}`, Math.max(m.get(`${c}:${r}`) ?? 0, 1 - d / reach));
      });
    });
    return m;
  }, [pins]);

  const tip = hover && pins.find((p) => p.code === hover);

  return (
    <div className="world-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Map of customer locations" onMouseLeave={() => setHover(null)}>
        <defs>
          <radialGradient id="wm-glow">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g className="wm-land">
          {DOTS.map(([c, r]) => {
            const glow = lit.get(`${c}:${r}`);
            return (
              <circle
                key={`${c}:${r}`}
                cx={c * CELL + CELL / 2}
                cy={r * CELL + CELL / 2}
                r={glow ? 3 + glow * 0.8 : 2.9}
                className={glow ? 'lit' : undefined}
                style={glow ? { opacity: 0.35 + glow * 0.65 } : undefined}
              />
            );
          })}
        </g>
        {pins.map((p) => {
          const active = selected === p.code || hover === p.code;
          return (
            <g
              key={p.code}
              className={`wm-pin ${active ? 'active' : ''} ${selected && selected !== p.code ? 'dim' : ''}`}
              transform={`translate(${p.x} ${p.y})`}
              onMouseEnter={() => setHover(p.code)}
              onClick={() => onSelect?.(selected === p.code ? null : p.code)}
            >
              <circle r={p.r * 2.4} fill="url(#wm-glow)" />
              <circle className="wm-ring" r={p.r} />
              <circle className="wm-core" r={Math.max(8, p.r * 0.42)} />
              <circle r={p.r * 1.6} fill="transparent" />
            </g>
          );
        })}
      </svg>
      {tip && (
        <div className="chart-tip" style={{ left: `${(tip.x / W) * 100}%`, top: `${((tip.y - tip.r) / H) * 100}%` }}>
          <div className="fw-semibold">{countryName(tip.code)}</div>
          <div>
            <span className="k">{tip.count === 1 ? unit : `${unit}s`}</span> {fmtNum(tip.count)}
          </div>
        </div>
      )}
    </div>
  );
}
