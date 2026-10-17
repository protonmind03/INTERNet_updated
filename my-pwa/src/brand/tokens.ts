/** One set of proportions for every logo placement, so the brand looks identical in every portal. */
export const LOGO_SIZES = {
  /** sidebars and drawers */
  sidebar: { icon: 44, cap: 20, gap: 12 },
  /** top bars (supervisor navigation) and mobile headers */
  bar: { icon: 38, cap: 17, gap: 10 },
} as const;

/** Lockup ratios (relative to the wordmark cap height). Used by BrandLockup and the exported SVG lockups. */
export const LOCKUP = {
  iconToCap: 1.62,
  gapToCap: 0.42,
  stackedIconToCap: 2.4,
} as const;

/** Motion timings in ms — mirror the CSS variables in brand.css. */
export const MOTION = {
  press: 120,
  hover: 200,
  enter: 320,
  emphasis: 480,
  loaderLoop: 3200,
  /** how long a finished action keeps its "done" label */
  doneHold: 1800,
  /** delay before a "working" toast appears (fast actions don't flash a toast) */
  workingToastDelay: 450,
} as const;

/*
| The portal sidebar's look, taken from the student portal's (roadmap 5.8)
| and shared by the coordinator's: navy surface, light text, small capitals
| for group names, and the current page as a lit panel with a gold edge.
| Each token is a set of Tailwind classes, so a layout says what a part is
| ("an item", "the current item") rather than repeating how it looks.
*/
export const SIDEBAR = {
  /** The column itself: the brand's navy, with the shared scroll pane inside. */
  surface: "surface-brand",
  /** The line under the brand block and above the account footer. */
  divider: "border-white/10",
  brandBlock: "border-b border-white/10 px-5 py-5",
  /** The scrolling list of pages between the brand block and the account footer. */
  nav: "px-3 pb-4 pt-4",
  groupLabel: "mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-psu-300",
  /** The space above every group label but the first. */
  groupGap: "mt-6",
  groupItems: "space-y-0.5",
  item: "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
  itemIdle: "text-psu-100 hover:bg-white/5 hover:text-white",
  itemActive: "bg-linear-to-r from-white/15 to-white/5 text-white ring-1 ring-inset ring-white/10",
  /** The gold edge on the current page. */
  activeBar: "absolute inset-y-2 left-0 w-[3px] rounded-r bg-gold-400",
  activeIcon: "text-gold-300",
  /** CountBadge's tone on this surface. */
  badgeTone: "dark",
  footer: "border-t border-white/10 p-3",
  accountLink: "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
  accountIdle: "hover:bg-white/5",
  accountActive: "bg-white/10",
  accountName: "block truncate text-sm font-semibold text-white",
  accountDetail: "block truncate text-xs text-psu-200",
  signOut:
    "mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-psu-100 transition-colors hover:bg-white/5 hover:text-white",
  /** The brand block's words on this surface (PortalBrand onDark). */
  brandMuted: "#C7CDF0",
  brandTagBg: "rgba(255, 255, 255, 0.12)",
  brandTagText: "#FFFFFF",
} as const;
