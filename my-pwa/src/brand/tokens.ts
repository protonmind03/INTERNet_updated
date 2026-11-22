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

/*
| 2026-11-21: the trainee and supervisor portals take the landing page's
| three colours: navy (chrome, ink, buttons), brass (the one thing to do
| now) and mist (the paper). The coordinator keeps its own for now.
|
| PSU redesign (internet-revisions, Section 13, "beyond gradients"): every
| header is one flat role colour (`chrome`), every page sits on the role's
| paper (`surface`), and `primary` is the accent for buttons, the active
| item and links. Gold (`accent` for the trainee and the coordinator) is
| the one thing to do now. Status colours are never a role colour.
*/
export const ROLE_PALETTES = {
  student: {
    name: "Time card",
    primary: "#233564",
    onPrimary: "#FBFDFE",
    accent: "#DBA65D",
    onAccent: "#0C1731",
    surface: "#F4F7FA",
    ink: "#0C1731",
    chrome: "#0C1731",
    onChrome: "#F2F6F9",
    decor: "#DBA65D",
  },
  supervisor: {
    name: "Logbook",
    primary: "#233564",
    onPrimary: "#FBFDFE",
    accent: "#DBA65D",
    onAccent: "#0C1731",
    surface: "#F4F7FA",
    ink: "#0C1731",
    chrome: "#0C1731",
    onChrome: "#F2F6F9",
    decor: "#DBA65D",
  },
  coordinator: {
    name: "Route map",
    primary: "#4F46E5",
    onPrimary: "#FFFFFF",
    accent: "#FACC15",
    onAccent: "#0B1440",
    surface: "#F7F8FC",
    ink: "#0B1440",
    chrome: "#1A237E",
    onChrome: "#FFFFFF",
    decor: "#B8C2FF",
  },
} as const satisfies Record<"student" | "supervisor" | "coordinator", RolePalette>;

/** Whether a role's chrome is dark (the seal then sits on its white disc). Every header is now a flat dark role colour. */
export const ROLE_CHROME_DARK = { student: true, supervisor: true, coordinator: true } as const;

/**
 * The rest of each role's surface: the 1 px hairline that replaces shadows,
 * the floating dock (phones) and the side menu (tablets and computers).
 * brand.css carries them as --role-hairline, --role-dock… (a test checks).
 */
export type RoleSurfaces = {
  hairline: string;
  dock: string;
  dockBorder: string;
  dockInk: string;
  dockActive: string;
  onDockActive: string;
  side: string;
  onSide: string;
};

export const ROLE_SURFACES = {
  student: {
    hairline: "#CAD2DB",
    dock: "#FBFDFE",
    dockBorder: "#D1DAE3",
    dockInk: "#233564",
    dockActive: "#0C1731",
    onDockActive: "#F2F6F9",
    side: "#0C1731",
    onSide: "#F2F6F9",
  },
  supervisor: {
    hairline: "#CAD2DB",
    dock: "#0C1731",
    dockBorder: "#0C1731",
    dockInk: "#F2F6F9",
    dockActive: "#DBA65D",
    onDockActive: "#0C1731",
    side: "#0C1731",
    onSide: "#F2F6F9",
  },
  coordinator: {
    hairline: "#E3E6F5",
    dock: "#1A237E",
    dockBorder: "#1A237E",
    dockInk: "#FFFFFF",
    dockActive: "#FACC15",
    onDockActive: "#1A237E",
    side: "#121A5E",
    onSide: "#FFFFFF",
  },
} as const satisfies Record<"student" | "supervisor" | "coordinator", RoleSurfaces>;

/**
 * Each role's eleven-step scale. The app's components were written in the
 * brand blue (`psu-50` … `psu-950`); brand.css redefines that scale under
 * each [data-role], so every button, link, ring and tint in a portal takes
 * the role's colour from one place. Step 600 is the role's `primary`.
 */
export const ROLE_SCALES = {
  student: ["#F1F5FE", "#E3EAF7", "#C9D4EC", "#9FB1D8", "#6E85BA", "#445B93", "#233564", "#18274B", "#0F1B39", "#08122C", "#03071B"],
  supervisor: ["#F1F5FE", "#E3EAF7", "#C9D4EC", "#9FB1D8", "#6E85BA", "#445B93", "#233564", "#18274B", "#0F1B39", "#08122C", "#03071B"],
  coordinator: ["#EEF2FF", "#E0E7FF", "#C7D2FE", "#A5B4FC", "#818CF8", "#6366F1", "#4F46E5", "#4338CA", "#3730A3", "#312E81", "#1E1B4B"],
} as const;

/** The steps of a scale, in order (Tailwind's names). */
export const SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/**
 * Status colours, the same for every role: a tint to sit on and the ink to
 * write with. Green is done or verified, sky is pending or for information,
 * red is rejected, overdue or needs you. `warning` stays for the few amber
 * notices (a clock gap); amber and gold never mean a status on their own.
 */
export const STATUS_COLORS = {
  success: { bg: "#E6F4EA", ink: "#1B5E34" },
  warning: { bg: "#FEF3C7", ink: "#7A4A00" },
  late: { bg: "#FDE8E7", ink: "#B42318" },
  absent: { bg: "#F2F4F7", ink: "#475467" },
  info: { bg: "#E0F2FE", ink: "#075985" },
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
  for (const [role, s] of Object.entries(ROLE_SURFACES)) {
    pairs.push(
      { role, pair: "dock ink on dock", text: s.dockInk, background: s.dock, large: false },
      { role, pair: "active dock label", text: s.onDockActive, background: s.dockActive, large: false },
      { role, pair: "side menu text", text: s.onSide, background: s.side, large: false }
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
  /** PSU redesign: the hero's flat night sky, the navy of the PSU strip and footer, its deeper shade, the gold. */
  sky: "#0E1550",
  navy: "#1A237E",
  navyDeep: "#121A5E",
  gold: "#FACC15",
  onGold: "#1A237E",
  /** A light ground for a section that sits between dark ones, and its dotted grid. */
  paperCool: "#F7F8FC",
  dot: "#D8DCEB",
} as const;
