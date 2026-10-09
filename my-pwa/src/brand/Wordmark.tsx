import { WORDMARK, paint, tonePaint } from "./geometry";

type WordmarkProps = {
  /** Letter (cap) height in px. Keep ≥ 17 where the logo is the brand so the lane stays visible. */
  height?: number;
  /** "onLight" = navy letters, "onDark" = white letters. "et" is always yellow. */
  tone?: "onLight" | "onDark";
  /** Splash/about: the word assembles itself (person → NTER → road → et) and the road is paved. */
  reveal?: boolean;
  className?: string;
  /** Set false when "INTERNet" is already read out nearby. */
  labelled?: boolean;
  /** @deprecated v1 option, ignored — the detailed mark is used at every size. */
  detail?: "auto" | "detailed" | "plain";
};

export default function Wordmark({ height = 32, tone = "onLight", reveal = false, className = "", labelled = true }: WordmarkProps) {
  const h = (height * WORDMARK.height) / WORDMARK.cap;
  const w = (h * WORDMARK.width) / WORDMARK.height;
  // reveal = a one-time entrance (classes in brand.css); the static drawing stays put afterwards
  const template = height < 28 ? WORDMARK.small : WORDMARK.large;
  const a11y = labelled ? { role: "img", "aria-label": "INTERNet" } : { "aria-hidden": true as const };
  return (
    <svg
      viewBox={WORDMARK.viewBox}
      width={w}
      height={h}
      className={`inb-mark ${reveal ? "inb-reveal" : ""} ${className}`}
      style={{ flexShrink: 0, overflow: "visible" }}
      {...a11y}
      dangerouslySetInnerHTML={{ __html: paint(template, tonePaint(tone)) }}
    />
  );
}
