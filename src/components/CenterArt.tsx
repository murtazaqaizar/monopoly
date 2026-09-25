/** Faint map-themed artwork behind the board's centre controls. */
export function CenterArt({ mapId }: { mapId: string }) {
  if (mapId === 'pakistan') return <Skyline />;
  if (mapId === 'europe') return <MetroMap />;
  if (mapId === 'world') return <Compass />;
  return <Globe />;
}

/** Classic: a wireframe globe with rough continents. */
function Globe() {
  return (
    <svg className="center-art art-globe" viewBox="0 0 200 200" aria-hidden>
      <defs>
        <clipPath id="globe-clip">
          <circle cx="100" cy="100" r="78" />
        </clipPath>
      </defs>
      <circle cx="100" cy="100" r="78" className="art-fill" />
      <g clipPath="url(#globe-clip)" className="art-land">
        {/* Americas */}
        <path d="M52 48c10-6 22-4 26 4s-2 14-8 18 2 12-4 18-4 16 2 24 6 22-2 30-12-2-12-12 4-20-2-28-12-12-10-24 6-24 10-30z" />
        {/* Europe + Africa */}
        <path d="M96 44c8-4 18-2 22 4s-4 10 0 14 12 2 14 10-6 10-4 18 8 18 2 30-14 18-20 12-4-16-8-24-10-10-8-20 8-14 6-22-8-16-4-22z" />
        {/* Asia */}
        <path d="M128 50c14-4 30 0 38 10s4 18-4 22-18 0-22 8-12 12-18 8-4-12-2-18-8-8-6-16 6-12 14-14z" />
        {/* Australia */}
        <path d="M150 120c8-2 16 2 16 8s-6 10-14 8-10-14-2-16z" />
      </g>
      <g className="art-grid" clipPath="url(#globe-clip)">
        <line x1="100" x2="100" y1="20" y2="180" />
        {[22, 45, 64].map((rx) => (
          <ellipse key={rx} cx="100" cy="100" rx={rx} ry="78" />
        ))}
        {[40, 70, 100, 130, 160].map((y) => (
          <line key={y} x1="10" x2="190" y1={y} y2={y} />
        ))}
      </g>
      <circle cx="100" cy="100" r="78" className="art-rim" />
    </svg>
  );
}

/** World Tour: a compass rose; the flight arcs are drawn on top. */
function Compass() {
  return (
    <svg className="center-art art-compass" viewBox="0 0 200 200" aria-hidden>
      <circle cx="100" cy="100" r="80" className="art-rim" />
      <circle cx="100" cy="100" r="64" className="art-rim thin" />
      {Array.from({ length: 36 }, (_, i) => {
        const a = (i * 10 * Math.PI) / 180;
        const r1 = i % 9 === 0 ? 70 : 75;
        return <line key={i} x1={100 + Math.cos(a) * r1} y1={100 + Math.sin(a) * r1} x2={100 + Math.cos(a) * 80} y2={100 + Math.sin(a) * 80} className="art-tick" />;
      })}
      <path d="M100 30 L108 100 L100 170 L92 100Z" className="art-land" />
      <path d="M30 100 L100 92 L170 100 L100 108Z" className="art-land dim" />
      <path d="M100 30 L108 100 L100 100Z" className="art-accent" />
      {['N', 'E', 'S', 'W'].map((l, i) => {
        const a = ((i * 90 - 90) * Math.PI) / 180;
        return (
          <text key={l} x={100 + Math.cos(a) * 90} y={100 + Math.sin(a) * 90 + 4} className="art-letter">
            {l}
          </text>
        );
      })}
    </svg>
  );
}

/** Pakistan: Minar-e-Pakistan, Faisal Mosque, a domed mazar and city blocks. */
function Skyline() {
  return (
    <svg className="center-art art-skyline" viewBox="0 0 300 120" preserveAspectRatio="xMidYMax meet" aria-hidden>
      <g className="art-land">
        {/* city blocks */}
        <rect x="0" y="86" width="22" height="34" />
        <rect x="24" y="74" width="16" height="46" />
        <rect x="262" y="80" width="18" height="40" />
        <rect x="282" y="70" width="18" height="50" />
        {/* Faisal Mosque: tent roof and four minarets */}
        <path d="M44 120 L44 104 L78 70 L112 104 L112 120Z" />
        <rect x="38" y="56" width="3" height="64" />
        <path d="M36.5 56 L39.5 46 L42.5 56Z" />
        <rect x="115" y="56" width="3" height="64" />
        <path d="M113.5 56 L116.5 46 L119.5 56Z" />
        {/* Minar-e-Pakistan */}
        <path d="M142 120 L146 60 L148 40 L150 22 L152 40 L154 60 L158 120Z" />
        <path d="M136 120 L140 104 L160 104 L164 120Z" />
        <circle cx="150" cy="20" r="3" />
        {/* Mazar-e-Quaid: square base with a dome */}
        <rect x="186" y="92" width="44" height="28" />
        <path d="M190 92 Q208 58 226 92Z" />
        <rect x="206" y="64" width="4" height="8" />
        {/* palms */}
        <path d="M246 120 L248 94 L250 120Z" />
        <path d="M248 94 q-10 -2 -14 6 q8 -4 14 -6 q6 -8 14 -6 q-8 0 -14 6 q-2 -8 4 -12 q-6 4 -4 12Z" />
      </g>
      <g className="art-accent">
        {/* crescent and star */}
        <path d="M78 30 a12 12 0 1 0 10 18 a9 9 0 1 1 -10 -18Z" />
        <path d="M92 34 l2 5 5 0 -4 3 2 5 -5 -3 -4 3 1 -5 -4 -3 5 0Z" />
      </g>
    </svg>
  );
}

/** Euro Trip: a stylised metro map with the Eiffel Tower. */
function MetroMap() {
  return (
    <svg className="center-art art-metro" viewBox="0 0 200 200" aria-hidden>
      <g className="art-lines">
        <path d="M20 60 H80 L110 90 H180" className="l1" />
        <path d="M40 170 V120 L70 90 V20" className="l2" />
        <path d="M20 140 H90 L130 100 V30" className="l3" />
        <path d="M60 180 L150 90 H190" className="l4" />
      </g>
      <g className="art-stops">
        {[
          [80, 60],
          [110, 90],
          [70, 90],
          [40, 120],
          [90, 140],
          [130, 100],
          [150, 90],
          [70, 20],
          [130, 30],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="4" />
        ))}
      </g>
      {/* Eiffel Tower */}
      <path className="art-land" d="M160 190 L166 150 L168 128 L170 110 L172 128 L174 150 L180 190 L174 190 L170 164 L166 190Z M163 150 H177 M166 128 H174" />
    </svg>
  );
}
