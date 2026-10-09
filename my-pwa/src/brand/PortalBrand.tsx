import BrandIcon from "./BrandIcon";
import Wordmark from "./Wordmark";
import { ROLE_THEMES } from "./roles";
import type { BrandRole } from "./roles";
import { LOGO_SIZES } from "./tokens";

type PortalBrandProps = {
  role: BrandRole;
  /** Show the role chip ("Trainee", "Supervisor", "Coordinator"). */
  showTag?: boolean;
  /** "sidebar" (default) for sidebars and drawers, "bar" for top navigation bars. */
  size?: "sidebar" | "bar";
  className?: string;
};

/**
 * Portal brand block: role-tinted app icon, wordmark, portal name (+ role chip).
 * Wrap it in the link to the role's home; hovering it makes the road's lanes flow.
 */
export default function PortalBrand({ role, showTag = false, size = "sidebar", className = "" }: PortalBrandProps) {
  const t = ROLE_THEMES[role];
  const s = LOGO_SIZES[size];
  const dark = t.surface === "dark";
  return (
    <div className={`inb-mark flex items-center ${className}`} style={{ gap: s.gap }}>
      <BrandIcon size={s.icon} tile={t.colors.surfaceRaised} />
      <div className="min-w-0">
        <Wordmark height={s.cap} tone={dark ? "onDark" : "onLight"} />
        <div className="mt-1 flex items-center gap-1.5">
          <p className="truncate text-[11px] font-medium leading-none" style={{ color: t.colors.muted, letterSpacing: "0.01em" }}>
            {t.portal}
          </p>
          {showTag && (
            <span className="inline-flex h-[18px] items-center rounded-full px-2 text-[10px] font-semibold leading-none" style={{ background: t.colors.tagBg, color: t.colors.tagText }}>
              {t.tag}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
