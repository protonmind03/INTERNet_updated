/*
| The tones (system pass): one meaning per colour, used by ui.tsx's IconTile
| and CardHeader and by display.tsx. Status tones are the status colours,
| never a role colour; brand is the role's own colour for plain subjects.
*/

export type Tone = "brand" | "info" | "success" | "warning" | "danger" | "neutral";

export const TONE_TILE: Record<Tone, string> = {
  brand: "bg-psu-50 text-psu-700",
  info: "bg-(--status-info-bg) text-(--status-info-ink)",
  success: "bg-(--status-success-bg) text-(--status-success-ink)",
  warning: "bg-(--status-warning-bg) text-(--status-warning-ink)",
  danger: "bg-(--status-late-bg) text-(--status-late-ink)",
  neutral: "bg-slate-100 text-slate-600",
};

/** The solid colour of a tone: meters, accents, dots. */
export const TONE_SOLID: Record<Tone, string> = {
  brand: "bg-psu-600",
  info: "bg-(--status-info-ink)",
  success: "bg-(--status-success-ink)",
  warning: "bg-(--status-warning-ink)",
  danger: "bg-(--status-late-ink)",
  neutral: "bg-slate-400",
};
