// Small SVG charts. Rules from the dataviz guide: one y-axis, thin marks with
// 4px rounded data ends, 2px gaps, recessive grid, hover tooltip on every
// mark, legend for 2+ series, categorical colours in fixed order.

import { useEffect, useMemo, useRef, useState } from 'react';
import { number as fmtNum } from '../lib/format';

export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];
// Sequential blue ramp (light → dark) for magnitude.
const SEQ = ['#eef3fb', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

const shortDay = (d) => {
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

function Tip({ x, y, children }) {
  return (
    <div className="chart-tip" style={{ left: x, top: y }}>
      {children}
    </div>
  );
}

export function Legend({ series }) {
  if (series.length < 2) return null;
  return (
    <div className="legend" style={{ marginBottom: 10 }}>
      {series.map((s, i) => (
        <span key={s.key}>
          <i style={{ background: SERIES[i] }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Time series. `kind="bar"` draws grouped bars per x; `kind="line"` draws
 * 2px lines with a crosshair. Every series shares one y-axis.
 */
export function TimeChart({ data, x, series, kind = 'bar', height = 220, format = (v) => fmtNum(v) }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  // Draw at the real container width so text and marks keep their size.
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(280, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pad = { l: 40, r: 8, t: 8, b: 24 };
  const iw = W - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const max = niceMax(Math.max(0, ...data.flatMap((d) => series.map((s) => Number(d[s.key] ?? 0)))));
  const band = iw / Math.max(1, data.length);
  const y = (v) => pad.t + ih - (v / max) * ih;
  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => t * max);
  const labelEvery = Math.ceil(data.length / Math.max(2, Math.floor(iw / 70)));

  const legendH = series.length > 1 ? 28 : 0;
  const tipX = hover !== null ? pad.l + band * (hover + 0.5) : 0;
  const tipY = hover !== null ? legendH + y(Math.max(...series.map((s) => Number(data[hover][s.key] ?? 0)))) : 0;

  return (
    <div className="chart" ref={ref}>
      <Legend series={series} />
      <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" onMouseLeave={() => setHover(null)}>
        <g className="grid">
          {ticks.map((t) => (
            <line key={t} x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
          ))}
        </g>
        <g className="axis">
          {ticks.map((t) => (
            <text key={t} x={pad.l - 6} y={y(t) + 4} textAnchor="end">
              {format(t)}
            </text>
          ))}
          {data.map((d, i) =>
            i % labelEvery === 0 ? (
              <text key={i} x={pad.l + band * (i + 0.5)} y={height - 6} textAnchor="middle">
                {shortDay(String(d[x]))}
              </text>
            ) : null,
          )}
        </g>
        {kind === 'bar' &&
          data.map((d, i) => {
            const gw = Math.min(28, band - 4);
            const bw = Math.max(2, (gw - 2 * (series.length - 1)) / series.length);
            return series.map((s, k) => {
              const v = Number(d[s.key] ?? 0);
              const bx = pad.l + band * i + (band - gw) / 2 + k * (bw + 2);
              const h = Math.max(0, y(0) - y(v));
              return (
                <path
                  key={`${i}-${s.key}`}
                  d={roundedTop(bx, y(v), bw, h, Math.min(4, bw / 2))}
                  fill={SERIES[k]}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              );
            });
          })}
        {kind === 'line' &&
          series.map((s, k) => (
            <path
              key={s.key}
              fill="none"
              stroke={SERIES[k]}
              strokeWidth={2}
              strokeLinejoin="round"
              d={data.map((d, i) => `${i ? 'L' : 'M'}${pad.l + band * (i + 0.5)},${y(Number(d[s.key] ?? 0))}`).join('')}
            />
          ))}
        {kind === 'line' && hover !== null && (
          <g>
            <line x1={pad.l + band * (hover + 0.5)} x2={pad.l + band * (hover + 0.5)} y1={pad.t} y2={pad.t + ih} stroke="var(--border-strong)" />
            {series.map((s, k) => (
              <circle
                key={s.key}
                cx={pad.l + band * (hover + 0.5)}
                cy={y(Number(data[hover][s.key] ?? 0))}
                r={4}
                fill={SERIES[k]}
                stroke="#fff"
                strokeWidth={2}
              />
            ))}
          </g>
        )}
        {data.map((_, i) => (
          <rect key={i} x={pad.l + band * i} y={pad.t} width={band} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover !== null && (
        <Tip x={tipX} y={tipY}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{shortDay(String(data[hover][x]))}</div>
          {series.map((s, k) => (
            <div key={s.key}>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: SERIES[k],
                  marginRight: 6,
                }}
              />
              <span className="k">{s.label}</span> {format(Number(data[hover][s.key] ?? 0))}
            </div>
          ))}
        </Tip>
      )}
    </div>
  );
}

function roundedTop(x, y, w, h, r) {
  if (h <= 0) return '';
  const rr = Math.min(r, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Horizontal magnitude list (breakdowns, funnels). One hue unless `colorBy`. */
export function HBars({ rows, format = (v) => fmtNum(v), color = SERIES[0], max, onClick }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="stack" style={{ gap: 6 }}>
      {rows.map((r, i) => (
        <div key={i} className="hbar" title={r.hint ?? `${format(r.value)}`} onClick={() => onClick?.(i)} style={onClick ? { cursor: 'pointer' } : undefined}>
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {r.label}
          </span>
          <span className="track">
            <span style={{ width: `${(r.value / m) * 100}%`, background: color }} />
          </span>
          <span className="mono" style={{ textAlign: 'right' }}>
            {format(r.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Hour × weekday heat map on the sequential blue ramp. */
export function Heatmap({ cells, value = 'calls', format = (v) => fmtNum(v) }) {
  const [hover, setHover] = useState(null);
  const grid = useMemo(() => {
    const g = Array.from({ length: 7 }, () => Array(24).fill(0));
    cells.forEach((c) => (g[c.weekday][c.hour] = Number(c[value] ?? 0)));
    return g;
  }, [cells, value]);
  const max = Math.max(1e-9, ...grid.flat());
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return (
    <div>
      <div className="heat">
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} style={{ textAlign: 'center' }}>
            {h % 3 === 0 ? h : ''}
          </span>
        ))}
        {grid.map((row, d) => [
          <span key={`l${d}`}>{days[d]}</span>,
          ...row.map((v, h) => (
            <span
              key={`${d}-${h}`}
              className="cell"
              style={{
                background: v ? SEQ[Math.min(SEQ.length - 1, Math.ceil((v / max) * (SEQ.length - 1)))] : 'var(--divider)',
                outline: hover?.d === d && hover.h === h ? '2px solid var(--ink)' : undefined,
              }}
              onMouseEnter={() => setHover({ d, h, v })}
              onMouseLeave={() => setHover(null)}
            />
          )),
        ])}
      </div>
      <div className="row between small muted" style={{ marginTop: 10 }}>
        <span>{hover ? `${days[hover.d]} ${String(hover.h).padStart(2, '0')}:00 — ${format(hover.v)}` : 'Hover a cell for details'}</span>
        <span className="row" style={{ gap: 4 }}>
          Less
          {SEQ.slice(1).map((c) => (
            <i
              key={c}
              style={{
                width: 12,
                height: 12,
                borderRadius: 2,
                background: c,
                display: 'inline-block',
              }}
            />
          ))}
          More
        </span>
      </div>
    </div>
  );
}

/** 100% stacked bar for a share split (e.g. sentiment). */
export function ShareBar({ parts }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 2,
          height: 12,
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        {parts.map((p) => (
          <span
            key={p.label}
            title={`${p.label}: ${fmtNum(p.value)} (${Math.round((p.value / total) * 100)}%)`}
            style={{
              width: `${(p.value / total) * 100}%`,
              background: p.color,
            }}
          />
        ))}
      </div>
      <div className="legend" style={{ marginTop: 10 }}>
        {parts.map((p) => (
          <span key={p.label}>
            <i style={{ background: p.color }} />
            {p.label} · {Math.round((p.value / total) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}

export function Stat({ label, value, hint, onClick }) {
  return (
    <div className="card stat" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function delta(cur, prev) {
  if (prev === undefined || prev === 0) return undefined;
  const d = ((cur - prev) / prev) * 100;
  return `${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(0)}% vs previous period`;
}
