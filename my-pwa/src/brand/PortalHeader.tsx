import type { ReactNode } from "react";
import BrandIcon from "./BrandIcon";
import Wordmark from "./Wordmark";
import { ROLE_THEMES } from "./roles";
import type { BrandRole } from "./roles";

type PortalHeaderProps = {
  role: BrandRole;
  /** Context line, e.g. "BS Information Technology · Philippine Airlines" (student),
   *  "Philippine Airlines · 6 interns" (supervisor), "Pangasinan State University · Lingayen" (coordinator). */
  context?: string;
  /** Current page name, shown on mobile under the brand ("Attendance", "Tasks"…). */
  pageTitle?: string;
  /** Opens the sidebar drawer on mobile. When omitted the menu button is not rendered. */
  onMenu?: () => void;
  /** Right-hand slot: notification bell, avatar, search… */
  right?: ReactNode;
  /** "mobile" = brand bar for < md screens. "desktop" = slim context bar for md+ screens. */
  variant?: "mobile" | "desktop";
  /** Optional live status shown as a chip, e.g. "Timed in 8:02 AM" or "3 to verify". */
  status?: string;
};

/** PWA web header, role-aware. Mobile shows the brand; desktop shows context + role chip. */
export default function PortalHeader({ role, context, pageTitle, onMenu, right, variant = "mobile", status }: PortalHeaderProps) {
  const t = ROLE_THEMES[role];
  const dark = t.surface === "dark";

  if (variant === "desktop") {
    return (
      <header className="relative z-10 flex items-center justify-between gap-4 border-b border-slate-200/80 bg-white px-6 py-4 shadow-card md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: role === "coordinator" ? t.colors.tagBg : "#EEF0FA", color: role === "coordinator" ? t.colors.tagText : "#1A237E" }}>
            {t.tag}
          </span>
          {context && <p className="truncate text-sm text-slate-600">{context}</p>}
          {status && (
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
              {status}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">{right}</div>
      </header>
    );
  }

  return (
    <header
      className={`sticky top-0 z-30 ${dark ? "surface-brand shadow-raised" : ""}`}
      style={dark ? undefined : { background: t.colors.surface, borderBottom: "1px solid #E2E8F0" }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        {onMenu && (
          <button
            type="button"
            onClick={onMenu}
            aria-label="Open menu"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
            style={{ color: t.colors.text, background: dark ? "rgba(255,255,255,.08)" : "#F1F5F9" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
        <BrandIcon size={38} tile={t.colors.surfaceRaised} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Wordmark height={17} tone={dark ? "onDark" : "onLight"} />
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none" style={{ background: t.colors.tagBg, color: t.colors.tagText }}>
              {t.tag}
            </span>
          </div>
          <p className="mt-1 truncate text-[11px] leading-tight" style={{ color: t.colors.muted }}>
            {pageTitle ? `${pageTitle}${context ? ` · ${context}` : ""}` : context ?? t.portal}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">{right}</div>
      </div>
      {status && (
        <div className="px-3 pb-2">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: t.colors.tagBg, color: t.colors.tagText }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.colors.accent }} aria-hidden="true" />
            {status}
          </span>
        </div>
      )}
    </header>
  );
}
