import BrandIcon from "./BrandIcon";
import Wordmark from "./Wordmark";
import PsuSeal from "./PsuSeal";
import { BRAND } from "./geometry";
import { LOCKUP, SEAL } from "./tokens";

type BrandLockupProps = {
  layout?: "horizontal" | "stacked";
  tone?: "onLight" | "onDark";
  /** Letter (cap) height of the wordmark in px. Icon and spacing follow the fixed lockup ratios. */
  size?: number;
  /** Line beside / under the wordmark. null hides it. */
  tagline?: string | null;
  /** Splash/about screens: the icon plays its story and the word assembles. */
  animated?: boolean;
  /**
   * Iteration 19, the co-brand lockup: the PSU seal, a 1 px hairline, then the
   * wordmark with "Pangasinan State University · Lingayen Campus" under it.
   * The seal is 1.6 times the wordmark's cap height, with a quarter of its
   * diameter clear on each side of the hairline. `tagline` is not shown.
   */
  withSeal?: boolean;
  className?: string;
};

/** The caption of the co-brand lockup. */
export const CO_BRAND_CAPTION = "Pangasinan State University · Lingayen Campus";

/** Icon + wordmark (+ tagline) with the same proportions as the exported lockup files. */
export default function BrandLockup({ layout = "horizontal", tone = "onLight", size = 40, tagline = "OJT monitoring & analytics", animated = false, withSeal = false, className = "" }: BrandLockupProps) {
  const dark = tone === "onDark";
  const tile = dark ? BRAND.deep : BRAND.navy;
  const sub = dark ? BRAND.periwinkle : "#475569";

  if (withSeal) {
    const seal = Math.max(SEAL.minPx, Math.round(size * SEAL.lockupToCap));
    const space = Math.round(seal * SEAL.clearSpace);
    return (
      <div className={`flex items-center ${className}`}>
        <PsuSeal size={seal} onDark={dark} clearSpace={false} />
        <span aria-hidden="true" className="self-stretch" style={{ width: 1, minHeight: seal, margin: `0 ${space}px`, background: "currentColor", opacity: 0.35 }} />
        <span className="flex min-w-0 flex-col" style={{ gap: Math.max(3, size * 0.18) }}>
          <Wordmark height={size} tone={tone} reveal={animated} />
          <span className="font-medium leading-tight" style={{ fontSize: Math.max(11, Math.round(size * 0.42)), color: sub }}>
            {CO_BRAND_CAPTION}
          </span>
        </span>
      </div>
    );
  }

  if (layout === "stacked") {
    return (
      <div className={`flex flex-col items-center ${className}`} style={{ gap: size * 0.55 }}>
        <span className={animated ? "inb-pop inb-tile-sheen" : ""} style={{ display: "inline-flex" }}>
          <BrandIcon size={size * LOCKUP.stackedIconToCap} tile={tile} animated={animated} />
        </span>
        <Wordmark height={size} tone={tone} reveal={animated} />
        {tagline && (
          <p className={`font-mono font-semibold uppercase ${animated ? "inb-fade-up" : ""}`} style={{ fontSize: Math.max(10, size * 0.25), letterSpacing: "0.2em", color: sub, animationDelay: "0.7s" }}>
            {tagline}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center ${className}`} style={{ gap: size * LOCKUP.gapToCap }}>
      <BrandIcon size={size * LOCKUP.iconToCap} tile={tile} animated={animated} />
      <Wordmark height={size} tone={tone} reveal={animated} />
      {tagline && (
        <>
          <span aria-hidden="true" style={{ width: Math.max(2, size * 0.045), height: size, borderRadius: 2, background: dark ? "rgba(255,255,255,.22)" : "#CBD5E1", margin: `0 ${size * 0.02}px` }} />
          <p className="font-medium" style={{ fontSize: Math.max(12, size * 0.39), lineHeight: 1.15, color: sub, maxWidth: size * 4.2 }}>
            {tagline}
          </p>
        </>
      )}
    </div>
  );
}
