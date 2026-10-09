import { useId } from "react";
import { BRAND, ICON, paint } from "./geometry";

type BrandIconProps = {
  /** Rendered width and height in px. */
  size?: number;
  /** Tile colour (it gets a soft gradient + highlight). Pass "none" for the bare mark (loaders). */
  tile?: string;
  /** Colour of the person, road and cap. */
  fg?: string;
  /** Plays the loader story: cursor taps → road is paved → lanes flow → cap lands. */
  animated?: boolean;
  /**
   * Drawing tier, chosen by size when "auto":
   *   ≥ 56 px full · 25–55 px compact (heavier lane, cursor, tassel) · ≤ 24 px mini (favicon: no lane, no cursor)
   * Every tier keeps the person, the tie, the road and the graduation cap.
   */
  detail?: "auto" | "full" | "compact" | "mini";
  /** Accessible name. Omit when "INTERNet" text is visible next to it. */
  title?: string;
  className?: string;
};

/** The INTERNet app mark — the person "i" with a tie and the road "N" that a cursor starts and a graduation cap ends. */
export default function BrandIcon({ size = 40, tile = BRAND.navy, fg = BRAND.white, animated = false, detail = "auto", title, className = "" }: BrandIconProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const hasTile = tile !== "none";
  const tier = detail !== "auto" ? detail : size <= 24 ? "mini" : size < 56 ? "compact" : "full";
  const template = animated ? (hasTile ? ICON.animated : ICON.bareAnimated) : hasTile ? ICON[tier] : ICON.bare;
  const onWhiteRoad = fg.toUpperCase() === BRAND.white;
  const html = paint(template, {
    fg,
    // white road → lanes in the tile colour; coloured road → amber lanes
    lane: onWhiteRoad ? (hasTile ? tile : BRAND.navy) : BRAND.amber,
    acc: !hasTile && !onWhiteRoad ? BRAND.amberOnLight : BRAND.amber,
    out: hasTile ? tile : fg,
    tile: hasTile ? tile : BRAND.navy,
    uid,
  });
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": true as const };
  return (
    <svg
      width={size}
      height={size}
      viewBox={ICON.viewBox}
      className={`inb-mark ${className}`}
      style={{ flexShrink: 0, overflow: "visible" }}
      {...a11y}
      dangerouslySetInnerHTML={{ __html: (title ? `<title>${title.replace(/[<&>]/g, "")}</title>` : "") + html }}
    />
  );
}
