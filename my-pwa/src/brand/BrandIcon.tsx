import { BRAND, CURSOR_PATH } from "./geometry";

type BrandIconProps = {
  /** Rendered width and height in px. */
  size?: number;
  /** Tile colour. Pass "none" for the bare mark (used inside loaders). */
  tile?: string;
  /** Colour of the person and the road. */
  fg?: string;
  /** Plays the loader motion: cursor clicks, road is paved, cap lands, lanes move. */
  animated?: boolean;
  /**
   * Drawing tier. "auto" picks by size:
   *   ≥ 56px  full     – fine strokes, every detail
   *   25–55px compact  – same mark with heavier road, lanes, tassel and cursor so they survive small sizes
   *   ≤ 24px  mini     – favicon only: person, road and a real (simplified) cap, no lanes
   */
  detail?: "auto" | "full" | "compact" | "mini";
  /** Accessible name. Omit when the icon sits next to visible "INTERNet" text. */
  title?: string;
  className?: string;
};

const ROAD = "27,38.7 30.4,20 39.4,51 45.4,18";
const LANE = "27.27,37.2 30.4,20 39.4,51 45.13,19.5";

/**
 * The INTERNet app mark: the person "I" with a tie, and the "N" drawn as a road
 * that a cursor starts, ending in a graduation cap. The cap and the road lanes are
 * part of the mark at every size — never replace them with a diamond or drop them.
 */
export default function BrandIcon({
  size = 40,
  tile = BRAND.navy,
  fg = BRAND.white,
  animated = false,
  detail = "auto",
  title,
  className,
}: BrandIconProps) {
  const tier = detail !== "auto" ? detail : animated ? "full" : size <= 24 ? "mini" : size < 56 ? "compact" : "full";
  const hasTile = tile !== "none";
  // On a white road the lanes take the tile colour; on a coloured road they are amber.
  const lane = fg.toUpperCase() === BRAND.white ? (hasTile ? tile : BRAND.navy) : BRAND.amber;
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": true as const };

  if (tier === "mini") {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" className={className} {...a11y}>
        {hasTile && <rect width="64" height="64" rx="14" fill={tile} />}
        <circle cx="14.25" cy="19" r="6.5" fill={fg} />
        <rect x="8.25" y="29" width="12" height="25" rx="3" fill={fg} />
        <polygon points="12.25,30 16.25,30 17.75,44 14.25,48 10.75,44" fill={BRAND.amber} />
        <polyline points="26.25,51 31.25,21 40.25,50 46.25,20" fill="none" stroke={fg} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        <polygon points="46.25,1.5 57,6.5 46.25,11.5 35.5,6.5" fill={BRAND.amber} />
        <path d="M40.5 8 V11 C40.5 13 52 13 52 11 V8 Z" fill={BRAND.amber} />
      </svg>
    );
  }

  const compact = tier === "compact";
  const roadW = compact ? 7.5 : 6;
  const laneW = compact ? 1.6 : 1.1;
  const dash = compact ? "3.2 2.6" : "2.6 2.2";
  const tasselW = compact ? 1.9 : 1.4;
  const cursorScale = compact ? 0.6 : 0.5;

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} {...a11y}>
      {hasTile && <rect width="64" height="64" rx="15" fill={tile} />}
      <circle cx="14.7" cy="20" r="5" fill={fg} />
      <rect x="10.2" y="27.5" width="9" height="25.5" rx="2.5" fill={fg} />
      <polygon points="13.3,28.5 16.1,28.5 17.3,42 14.7,45 12.1,42" fill={BRAND.amber} />
      {animated && <polyline points={ROAD} fill="none" stroke={fg} strokeOpacity="0.15" strokeWidth={roadW} strokeLinecap="round" strokeLinejoin="round" />}
      <polyline className={animated ? "inb-road" : undefined} pathLength={100} points={ROAD} fill="none" stroke={fg} strokeWidth={roadW} strokeLinecap="round" strokeLinejoin="round" />
      <polyline className={animated ? "inb-lane" : undefined} points={LANE} fill="none" stroke={lane} strokeWidth={laneW} strokeDasharray={dash} strokeLinejoin="round" />
      <g transform={`translate(25.83 45.13) rotate(34.3) scale(${cursorScale})`}>
        <path className={animated ? "inb-click" : undefined} d={CURSOR_PATH} fill={BRAND.amber} stroke={hasTile ? "none" : fg} strokeWidth="2.4" strokeLinejoin="round" />
      </g>
      {/* compact tier: heavier road, so the cap sits a little higher to keep the gap */}
      <g className={animated ? "inb-cap" : undefined} transform={compact ? "translate(0 -1.2)" : undefined}>
        <polygon points="45.4,2.5 54.4,6.7 45.4,10.9 36.4,6.7" fill={fg} />
        <path d="M40.4 8.5 V11.7 C40.4 13.7 50.4 13.7 50.4 11.7 V8.5 Z" fill={fg} />
        <path d="M45.4 6.7 L52.9 8.1 L52.9 12.5" fill="none" stroke={BRAND.amber} strokeWidth={tasselW} strokeLinecap="round" />
        <circle cx="52.9" cy="13.3" r={compact ? 1.8 : 1.4} fill={BRAND.amber} />
      </g>
    </svg>
  );
}
