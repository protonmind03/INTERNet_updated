import type { CSSProperties } from "react";
import BrandIcon from "./BrandIcon";
import RoadGlyph from "./RoadGlyph";
import { BRAND } from "./geometry";
import { getActiveRole, messageFor } from "./roles";
import type { BrandRole, LoadProcess } from "./roles";

type BrandLoaderProps = {
  /** What is being loaded — drives the role-specific message. */
  process: LoadProcess;
  /** Defaults to the signed-in role (localStorage "active_role"). */
  role?: BrandRole;
  /**
   * page    – a whole page is waiting (first load): the loader story + road progress bar
   * section – inside a card / panel / table body
   * inline  – one line next to text (dropdowns, search results, small lists)
   * button  – glyph only, inherits currentColor
   */
  variant?: "page" | "section" | "inline" | "button";
  /** Background the loader sits on. */
  tone?: "onLight" | "onDark";
  /** Override the message. */
  message?: string;
  className?: string;
};

/** The INTERNet loading element: the cursor taps, the road is paved, the lanes flow, the cap lands. */
export default function BrandLoader({ process, role, variant = "section", tone = "onLight", message, className = "" }: BrandLoaderProps) {
  const r = role ?? getActiveRole();
  const text = message ?? messageFor(r, process);
  const dark = tone === "onDark";
  const fg = dark ? BRAND.white : BRAND.navy;
  const sub = dark ? BRAND.periwinkle : "#475569";

  if (variant === "button") {
    return (
      <span role="status" className={`inline-flex ${className}`}>
        <RoadGlyph size={18} />
        <span className="sr-only">{text}</span>
      </span>
    );
  }

  if (variant === "inline") {
    return (
      <span role="status" aria-live="polite" className={`inline-flex items-center gap-2 text-sm ${className}`} style={{ color: sub }}>
        <RoadGlyph size={18} color={fg} />
        {text}
      </span>
    );
  }

  const big = variant === "page";
  return (
    <div role="status" aria-live="polite" className={`inb-fade-up flex flex-col items-center justify-center ${big ? "min-h-[60vh] gap-5 py-16" : "gap-3.5 py-10"} ${className}`}>
      <BrandIcon size={big ? 112 : 76} tile="none" fg={fg} animated />
      <p className="text-center font-mono text-[13px] font-medium tracking-tight" style={{ color: sub }}>
        {text}
      </p>
      {big && (
        <div
          className="inb-roadbar h-[6px] w-44"
          style={{ "--inb-track": dark ? "rgba(255,255,255,.14)" : "#E2E8F0", "--inb-fill": dark ? "rgba(255,255,255,.9)" : BRAND.navy } as CSSProperties}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
