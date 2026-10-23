import type { ReactNode } from "react";
import { LaneDash } from "./motifs";
import { ROLE_THEMES } from "./roles";
import type { BrandRole } from "./roles";

type PortalHeaderProps = {
  role: BrandRole;
  /** The one context line under the title, e.g. "Acme Corp · Day 52 of 61", "Week 9 of 16 · CCS · BSIT". */
  context?: ReactNode;
  /** The page's name, drawn as the header's title ("Today", "Review", "Home"). */
  pageTitle?: string;
  /** False when the page draws its own level-1 heading (a student's record), so there is one. */
  titleIsHeading?: boolean;
  /** Opens a side menu. When omitted the menu button is not drawn. */
  onMenu?: () => void;
  /** Right-hand slot: the bell. */
  right?: ReactNode;
  /** "mobile": the phone header. "desktop": a slim context bar over a side menu. */
  variant?: "mobile" | "desktop";
  /** A short status shown as a chip, e.g. "3 to verify". */
  status?: string;
};

/*
| PSU redesign (Sections 7, 10, 11, 13). The phone header is one flat role
| colour with grain: the page's name in the display face, one line of
| context, and the bell. The role's motif shows here once: the trainee's
| lane-dash strip along the bottom edge, the supervisor's faint ruled lines.
| The coordinator's header is plain navy.
*/
export default function PortalHeader({ role, context, pageTitle, onMenu, right, variant = "mobile", status, titleIsHeading = true }: PortalHeaderProps) {
  const t = ROLE_THEMES[role];

  if (variant === "desktop") {
    return (
      <header className="relative z-10 flex items-center justify-between gap-4 border-b border-(--role-hairline) bg-white px-6 py-4 md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-psu-50 px-3 text-xs font-semibold text-psu-800">{t.tag}</span>
          {context && <p className="truncate text-sm text-slate-600">{context}</p>}
          {status && <span className="st-badge st-badge--info hidden sm:inline-flex">{status}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">{right}</div>
      </header>
    );
  }

  return (
    <header className={`surface-brand-bar sticky top-(--inb-top-inset) z-30 ${role === "supervisor" ? "ruled-header" : ""}`}>
      <div className="flex min-h-[76px] items-center gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {onMenu && (
          <button
            type="button"
            onClick={onMenu}
            aria-label="Open menu"
            className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white hover:bg-white/10"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-display truncate text-[26px] font-extrabold leading-tight text-white" role={titleIsHeading ? "heading" : undefined} aria-level={titleIsHeading ? 1 : undefined}>
            {pageTitle ?? t.portal}
          </p>
          {context && <p className="mt-0.5 truncate text-[13.5px] font-medium text-white/85">{context}</p>}
        </div>
        {status && <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white">{status}</span>}
        <div className="flex shrink-0 items-center gap-1">{right}</div>
      </div>
      {role === "student" && <LaneDash />}
    </header>
  );
}
