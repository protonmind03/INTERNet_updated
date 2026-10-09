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
