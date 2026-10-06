import BrandIcon from "./BrandIcon";
import RoadGlyph from "./RoadGlyph";
import { BRAND } from "./geometry";
import { getActiveRole, messageFor } from "./roles";
import type { BrandRole, LoadProcess } from "./roles";

type BrandLoaderProps = {
  /** What is being loaded. Drives the role-specific message. */
  process: LoadProcess;
  /** Defaults to the signed-in role (localStorage "active_role"). */
  role?: BrandRole;
  /**
   * page    – full area, centred (route-level loads)
   * section – inside a card or table body ("Loading complaints…" replacements)
   * inline  – one line next to text (search results, small lists)
   * button  – glyph only, for "Saving…" buttons; inherits currentColor
   */
  variant?: "page" | "section" | "inline" | "button";
  /** Background the loader sits on. */
  tone?: "onLight" | "onDark";
  /** Override the message. */
  message?: string;
  className?: string;
};

/** The INTERNet loading element: the cursor starts the road, the road is paved, the cap lands. */
export default function BrandLoader({ process, role, variant = "section", tone = "onLight", message, className = "" }: BrandLoaderProps) {
  const r = role ?? getActiveRole();
  const text = message ?? messageFor(r, process);
  const dark = tone === "onDark";
  const fg = dark ? BRAND.white : BRAND.navy;
  const sub = dark ? "#C7CDF0" : "#475569";

  if (variant === "button") {
    return (
      <span role="status" className={`inline-flex ${className}`}>
        <RoadGlyph size={18} color="currentColor" />
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
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-4 ${big ? "min-h-[60vh] py-16" : "py-10"} ${className}`}
    >
      <BrandIcon size={big ? 104 : 72} tile="none" fg={fg} animated />
      <p className="font-mono text-[13px] font-medium" style={{ color: sub }}>
        {text}
      </p>
      {big && (
        <div className="h-1 w-40 rounded-full" style={{ background: dark ? "rgba(255,255,255,.14)" : "#E2E8F0" }}>
          <div className="inb-indeterminate h-1 w-full rounded-full" style={{ color: BRAND.amber }} />
        </div>
      )}
    </div>
  );
}
