import { BRAND, GLYPH, paint } from "./geometry";

/** Working state: the road "N" is paved on a loop. Lanes flow from 20 px up. Inherits currentColor. */
export default function RoadGlyph({ size = 18, color = "currentColor", lane }: { size?: number; color?: string; lane?: string }) {
  const g = GLYPH.road;
  const html = g.markup + (size >= 20 && lane ? paint(g.lane, { fg: color, lane }) : "");
  return <svg width={size} height={size} viewBox={g.viewBox} aria-hidden="true" style={{ flexShrink: 0, color }} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Success: a check that draws itself inside a ring that pulses once. */
export function CheckGlyph({ size = 18, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0, overflow: "visible" }}>
      <circle className="inb-ring" cx="12" cy="12" r="10" fill="none" stroke={color} strokeWidth="2" />
      <path className="inb-check" d="M5.5 12.5l4.2 4.2L18.5 8" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Milestone success: the graduation cap is tossed, lands, the tassel swings; optional spark burst. */
export function CapGlyph({ size = 20, color = "currentColor", tassel = BRAND.amber, burst = false }: { size?: number; color?: string; tassel?: string; burst?: boolean }) {
  const g = GLYPH.cap;
  const html = paint((burst ? g.sparks : "") + g.markup, { fg: color, lane: "", acc: tassel });
  return <svg width={size} height={size} viewBox={g.viewBox} aria-hidden="true" style={{ flexShrink: 0, overflow: "visible", color }} dangerouslySetInnerHTML={{ __html: html }} />;
}
