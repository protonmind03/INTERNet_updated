import BrandIcon from "./BrandIcon";
import Wordmark from "./Wordmark";
import { ROLE_THEMES } from "./roles";
import type { BrandRole } from "./roles";

type PortalBrandProps = {
  role: BrandRole;
  /** Show the role chip ("Trainee", "Supervisor", "Coordinator") next to the portal name. */
  showTag?: boolean;
  className?: string;
};

/**
 * Sidebar / drawer header: role-tinted app icon, wordmark, and the portal name.
 * Replaces every hand-written "IN" tile + "INTERNet / OJT Monitoring System" block.
 */
export default function PortalBrand({ role, showTag = false, className = "" }: PortalBrandProps) {
  const t = ROLE_THEMES[role];
  const dark = t.surface === "dark";
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <BrandIcon size={44} tile={t.colors.surfaceRaised} />
      <div className="min-w-0">
        <Wordmark height={20} tone={dark ? "onDark" : "onLight"} />
        <div className="mt-1 flex items-center gap-1.5">
          <p className="truncate text-[11px] leading-tight" style={{ color: t.colors.muted }}>
            {t.portal}
          </p>
          {showTag && (
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none" style={{ background: t.colors.tagBg, color: t.colors.tagText }}>
              {t.tag}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
