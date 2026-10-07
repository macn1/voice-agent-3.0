export function LogoMark({ size = 64 }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="lm-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2b2b2b" />
          <stop offset="1" stopColor="#050505" />
        </linearGradient>
      </defs>
      <path
        fill="url(#lm-g)"
        fillRule="evenodd"
        d="M32 4c3.2 0 5.6 1.7 7.3 4.6l20 34.8c3.6 6.3-.4 12.6-7.3 12.6H12c-6.9 0-10.9-6.3-7.3-12.6l20-34.8C26.4 5.7 28.8 4 32 4Zm0 28.5c-5.3 0-9.5 3.6-9.5 8s4.2 8 9.5 8 9.5-3.6 9.5-8-4.2-8-9.5-8Z"
      />
    </svg>
  );
}

export function Brand({ sub }) {
  return (
    <div className="brand">
      <LogoMark />
      <span className="brand-word">AURLYNN</span>
      {sub && <span className="brand-sub">{sub}</span>}
    </div>
  );
}

// Leaves placed along the stems of an olive branch: [x, y, angle, length].
const STEMS = ['M250 320 C 215 250, 175 170, 150 20', 'M200 205 C 150 175, 95 150, 40 150', 'M168 110 C 205 85, 240 70, 280 72'];
const LEAVES = [
  [232, 280, -35, 30],
  [212, 262, 200, 28],
  [205, 228, -20, 32],
  [186, 214, 215, 30],
  [184, 178, -10, 30],
  [170, 160, 205, 30],
  [170, 130, -25, 28],
  [160, 100, 190, 28],
  [160, 72, -15, 26],
  [152, 48, 200, 24],
  [151, 24, -40, 20],
  [150, 186, 95, 26],
  [130, 170, 250, 26],
  [105, 162, 110, 26],
  [82, 152, 240, 24],
  [58, 152, 120, 22],
  [42, 150, 200, 20],
  [195, 92, -80, 24],
  [215, 82, 100, 24],
  [240, 74, -70, 22],
  [262, 72, 80, 20],
  [280, 72, 0, 18],
];

/** Decorative arch, olive branch and sphere — stands in for the marble render. */
export function HeroArt() {
  return (
    <div className="hero-art" aria-hidden>
      <div className="ring" />
      <svg className="branch" viewBox="0 0 300 330">
        <defs>
          <linearGradient id="leaf-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7a8650" />
            <stop offset="1" stopColor="#2f3a1f" />
          </linearGradient>
        </defs>
        {STEMS.map((d) => (
          <path key={d} d={d} fill="none" stroke="#4b4632" strokeWidth="2" strokeLinecap="round" />
        ))}
        {LEAVES.map(([x, y, a, l], i) => (
          <ellipse key={i} cx={x + l / 2} cy={y} rx={l / 2} ry={l / 5.2} fill="url(#leaf-g)" transform={`rotate(${a} ${x} ${y})`} />
        ))}
      </svg>
      <div className="arch" />
      <div className="plinth" />
      <div className="sphere" />
    </div>
  );
}
