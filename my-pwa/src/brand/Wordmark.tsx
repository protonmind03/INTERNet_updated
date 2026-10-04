import { BRAND, CURSOR_PATH, WORDMARK, WORDMARK_PLAIN } from "./geometry";

type WordmarkProps = {
  /** Cap-to-baseline height in px of the letters (roughly the CSS font-size × 0.72).
   *  Keep it ≥ 18 wherever the logo is the brand (sidebars, headers) so the road lanes stay visible. */
  height?: number;
  /** "onLight" = navy letters, "onDark" = white letters. "et" is always amber. */
  tone?: "onLight" | "onDark";
  /** Detailed = person "I" + road "N" (default at every size). Plain = INTERN + et, only when asked for
   *  (e.g. inside running text or a PDF table). */
  detail?: "auto" | "detailed" | "plain";
  className?: string;
  /** Set false when the word "INTERNet" is already read out nearby. */
  labelled?: boolean;
};

export default function Wordmark({ height = 32, tone = "onLight", detail = "auto", className, labelled = true }: WordmarkProps) {
  const fg = tone === "onDark" ? BRAND.white : BRAND.navy;
  const lane = tone === "onDark" ? BRAND.navy : BRAND.amber;
  const plain = detail === "plain";
  // Small sizes get a heavier lane so the dashes survive anti-aliasing; below 14px there is no room for them.
  const small = height < 28;
  const showLane = height >= 14;
  const a11y = labelled ? { role: "img", "aria-label": "INTERNet" } : { "aria-hidden": true as const };

  if (plain) {
    // Plain viewBox is 77 units tall with letters ~72 units tall.
    const h = height * (WORDMARK_PLAIN.height / 72);
    return (
      <svg viewBox={WORDMARK_PLAIN.viewBox} height={h} width={(h * WORDMARK_PLAIN.width) / WORDMARK_PLAIN.height} className={className} {...a11y}>
        <path d={WORDMARK_PLAIN.intern} fill={fg} />
        <path d={WORDMARK_PLAIN.et} fill={BRAND.amber} />
      </svg>
    );
  }

  // Detailed viewBox is 101 units tall (cap + head rise above the letters) with letters ~72 units tall.
  const h = height * (WORDMARK.height / 72);
  return (
    <svg viewBox={WORDMARK.viewBox} height={h} width={(h * WORDMARK.width) / WORDMARK.height} className={className} {...a11y}>
      <g transform={WORDMARK.iTransform}>
        <circle cx="16" cy="25" r="9" fill={fg} />
        <rect x="7" y="38" width="18" height="66" rx="4" fill={fg} />
        <polygon points="12.5,40 19.5,40 18,45.5 14,45.5" fill={BRAND.amber} />
        <polygon points="14,46.5 18,46.5 20.5,66 16,71 11.5,66" fill={BRAND.amber} />
      </g>
      <path d={WORDMARK.nter} fill={fg} />
      <g transform={WORDMARK.nTransform}>
        <g transform="translate(11.45 57.43) rotate(38.25) scale(0.9)">
          <path d={CURSOR_PATH} fill={BRAND.amber} stroke={fg} strokeWidth="2.2" strokeLinejoin="round" />
        </g>
        <polyline points="14.4,45.8 24,8 56,70 72,7" fill="none" stroke={fg} strokeWidth={small ? 14.5 : 13} strokeLinecap="round" strokeLinejoin="round" />
        {showLane && (
          <polyline
            points="15.1,42.9 24,8 56,70 71.3,9.9"
            fill="none"
            stroke={lane}
            strokeWidth={small ? 3.6 : 2.2}
            strokeDasharray={small ? "7.5 5.5" : "6 5"}
            strokeLinejoin="round"
          />
        )}
        <polygon points="72,-22 88,-15 72,-8 56,-15" fill={fg} />
        <path d="M63 -12 V-7 C63 -3.5 81 -3.5 81 -7 V-12 Z" fill={fg} />
        <path d="M72 -15 L86 -12.5 L86 -5" fill="none" stroke={BRAND.amber} strokeWidth={small ? 3.2 : 2.2} strokeLinecap="round" />
        <circle cx="86" cy="-3.5" r={small ? 3.4 : 2.4} fill={BRAND.amber} />
      </g>
      <path d={WORDMARK.et} fill={BRAND.amber} />
    </svg>
  );
}
