/** The road "N" being paved on a loop — the small loading glyph for buttons, chips and toasts. */
export default function RoadGlyph({ size = 18, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="19.4 14 30 44" aria-hidden="true" style={{ flexShrink: 0 }}>
      <polyline points="27,38.7 30.4,20 39.4,51 45.4,18" fill="none" stroke={color} strokeOpacity="0.25" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline className="inb-road-fast" pathLength={100} points="27,38.7 30.4,20 39.4,51 45.4,18" fill="none" stroke={color} strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A check that draws itself — success state. */
export function CheckGlyph({ size = 18, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path className="inb-check" d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The graduation cap on its own — used to celebrate brand moments (time-in, task submitted, evaluation done). */
export function CapGlyph({ size = 18, color = "currentColor", tassel = "#FACC15" }: { size?: number; color?: string; tassel?: string }) {
  return (
    <svg width={size} height={size} viewBox="34 0 22 16" aria-hidden="true" className="inb-cap-pop" style={{ flexShrink: 0 }}>
      <polygon points="45.4,1 55,5.5 45.4,10 35.8,5.5" fill={color} />
      <path d="M40 7.3 V10.6 C40 12.8 50.8 12.8 50.8 10.6 V7.3 Z" fill={color} />
      <path d="M45.4 5.5 L53.4 7 L53.4 12" fill="none" stroke={tassel} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="53.4" cy="13" r="1.6" fill={tassel} />
    </svg>
  );
}
