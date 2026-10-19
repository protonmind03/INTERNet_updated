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

/*
|--------------------------------------------------------------------------
| BRAND KIT v4 (Iteration 19): ROLE PALETTES, STATUS COLOURS, THE SEAL
|--------------------------------------------------------------------------
|
| The INTERNet icon's navy stays the shared brand colour. Each role adds a
| layer of its own, set as CSS custom properties on the root element's
| [data-role] (brand.css, written from these values; a test checks the two
| agree). Status colours are the same for every role. Every text pair below
| is checked for WCAG contrast by a test: 4.5:1, or 3:1 for text 24 px and
| larger. `decor` is never used for text.
|
*/

export type RolePalette = {
  /** The palette's name in the brand kit. */
  name: string;
  primary: string;
  onPrimary: string;
  accent: string;
  onAccent: string;
  surface: string;
  ink: string;
  chrome: string;
  onChrome: string;
  decor: string;
};

export const ROLE_PALETTES = {
  student: {
    name: "Sunpath",
    primary: "#A84B0B",
    onPrimary: "#FFFFFF",
    accent: "#FFE047",
    onAccent: "#3A2A12",
    surface: "#FFF8E8",
    ink: "#3A2A12",
    chrome: "#FFF8E8",
    onChrome: "#3A2A12",
    decor: "#F7AB15",
  },
  supervisor: {
    name: "Laurel Ledger",
    primary: "#0F6B5C",
    onPrimary: "#FFFFFF",
    accent: "#7FD1AE",
    onAccent: "#0E2A26",
    surface: "#EEF6F2",
    ink: "#0E2A26",
    chrome: "#FFFFFF",
    onChrome: "#0E2A26",
    decor: "#F7AB15",
  },
  coordinator: {
    name: "Royal Seal",
    primary: "#0A28DD",
    onPrimary: "#FFFFFF",
    accent: "#FFE047",
    onAccent: "#0B1440",
    surface: "#F1F3FB",
    ink: "#0B1440",
    chrome: "#0B1440",
    onChrome: "#FFFFFF",
    decor: "#B8C2FF",
  },
} as const satisfies Record<"student" | "supervisor" | "coordinator", RolePalette>;

/** Whether a role's chrome is dark (the seal then sits on its white disc). */
export const ROLE_CHROME_DARK = { student: false, supervisor: false, coordinator: true } as const;

/** Status colours, the same for every role: a tint to sit on and the ink to write with. */
export const STATUS_COLORS = {
  success: { bg: "#E6F4EA", ink: "#1B5E34" },
  warning: { bg: "#FEF3C7", ink: "#7A4A00" },
  late: { bg: "#FDE8E7", ink: "#B42318" },
  absent: { bg: "#F2F4F7", ink: "#475467" },
  info: { bg: "#E8EEFD", ink: "#1D3FB0" },
} as const;

/** The weekend columns of a calendar (background only). */
export const WEEKEND_TINT = "#FFF5F5";

/** The seal's rules, in numbers (brand/PsuSeal.tsx). */
export const SEAL = {
  /** Clear space on every side, as a share of the diameter. */
  clearSpace: 0.25,
  /** Smallest diameter on screen, CSS px. */
  minPx: 24,
  /** Smallest diameter in print, mm. */
  minPrintMm: 12,
  /** The white disc behind it on dark chrome, as a multiple of its diameter. */
  discRatio: 1.12,
  /** Co-brand lockup: the seal's height as a multiple of the wordmark's cap height. */
  lockupToCap: 1.6,
} as const;

/** WCAG relative luminance of "#RRGGBB". */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two "#RRGGBB" colours. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Every text pair the palettes use, for the contrast test and the preview. `large`: only ever 24 px or larger. */
export function paletteTextPairs(): Array<{ role: string; pair: string; text: string; background: string; large: boolean }> {
  const pairs: Array<{ role: string; pair: string; text: string; background: string; large: boolean }> = [];
  for (const [role, p] of Object.entries(ROLE_PALETTES)) {
    pairs.push(
      { role, pair: "on-primary on primary", text: p.onPrimary, background: p.primary, large: false },
      { role, pair: "on-accent on accent", text: p.onAccent, background: p.accent, large: false },
      { role, pair: "ink on surface", text: p.ink, background: p.surface, large: false },
      { role, pair: "on-chrome on chrome", text: p.onChrome, background: p.chrome, large: false },
      { role, pair: "primary on surface (links)", text: p.primary, background: p.surface, large: false }
    );
  }
  for (const [status, s] of Object.entries(STATUS_COLORS)) {
    pairs.push({ role: "all", pair: `${status} ink on its tint`, text: s.ink, background: s.bg, large: false });
  }
  pairs.push({ role: "all", pair: "late ink on the weekend tint", text: STATUS_COLORS.late.ink, background: WEEKEND_TINT, large: false });
  return pairs;
}

/**
 * Iteration 23: the landing page's neutrals (paper, ink, rules). The role
 * palettes above colour its three doors; brand.css carries these as --land-*.
 */
export const LANDING = {
  paper: "#FFFFFF",
  paperWarm: "#F7F5EF",
  ink: "#0F172A",
  muted: "#475569",
  line: "#E2E8F0",
  night: "#0B1440",
  onNight: "#FFFFFF",
  onNightMuted: "#C7CDF0",
} as const;
