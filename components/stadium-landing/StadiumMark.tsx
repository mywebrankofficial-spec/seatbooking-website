/** Minimal top-down stadium illustration: white roof, red bowl, North Stand lit orange, striped pitch. */
export function StadiumMark({ className = '', idPrefix = 'sm' }: { className?: string; idPrefix?: string }) {
  const shadow = `${idPrefix}-shadow`;
  const clip = `${idPrefix}-pitch`;
  const stripes = Array.from({ length: 8 }, (_, i) => i);
  return (
    <svg viewBox="0 0 400 260" className={className} overflow="visible" role="img" aria-label="Arena seen from above">
      <defs>
        <filter id={shadow} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#1d3a57" floodOpacity="0.18" />
        </filter>
        <clipPath id={clip}>
          <rect x="106" y="94" width="188" height="72" rx="2" />
        </clipPath>
      </defs>

      {/* roof shell */}
      <rect x="22" y="22" width="356" height="216" rx="92" fill="#ffffff" filter={`url(#${shadow})`} />
      <rect x="22" y="22" width="356" height="216" rx="92" fill="none" stroke="#0b1626" strokeOpacity="0.06" />

      {/* seating bowl */}
      <rect x="62" y="56" width="276" height="148" rx="56" fill="none" stroke="#d2443b" strokeWidth="28" />
      <rect x="57" y="51" width="286" height="158" rx="61" fill="none" stroke="#2f6bd8" strokeOpacity="0.85" strokeWidth="1.6" />
      <rect x="67" y="61" width="266" height="138" rx="51" fill="none" stroke="#2f6bd8" strokeOpacity="0.85" strokeWidth="1.6" />

      {/* North Stand highlighted */}
      <path d="M118 56H282" stroke="#F26A21" strokeWidth="28" />
      <path d="M118 51H282M118 61H282" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.2" />

      {/* pitch */}
      <rect x="76" y="70" width="248" height="120" rx="42" fill="#3f8f45" />
      <g clipPath={`url(#${clip})`}>
        <rect x="106" y="94" width="188" height="72" fill="#4ea153" />
        {stripes.map((i) =>
          i % 2 === 0 ? <rect key={i} x={106 + i * 23.5} y="94" width="23.5" height="72" fill="#5aae5e" /> : null,
        )}
      </g>
      <g fill="none" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="1.4">
        <rect x="106" y="94" width="188" height="72" rx="1" />
        <path d="M200 94V166" />
        <circle cx="200" cy="130" r="11" />
        <rect x="106" y="112" width="24" height="36" />
        <rect x="270" y="112" width="24" height="36" />
      </g>
    </svg>
  );
}

export default StadiumMark;
