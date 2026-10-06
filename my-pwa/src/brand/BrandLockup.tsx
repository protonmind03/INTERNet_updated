import BrandIcon from "./BrandIcon";
import Wordmark from "./Wordmark";
import { BRAND } from "./geometry";

type BrandLockupProps = {
  layout?: "horizontal" | "stacked";
  tone?: "onLight" | "onDark";
  /** Letter height of the wordmark in px. The icon scales with it. */
  size?: number;
  /** Line under / beside the wordmark. Pass null to hide. */
  tagline?: string | null;
  className?: string;
};

/** Icon + wordmark (+ tagline). Use on the login brand panel, splash, PDFs and about screens. */
export default function BrandLockup({
  layout = "horizontal",
  tone = "onLight",
  size = 40,
  tagline = "OJT monitoring & analytics",
  className = "",
}: BrandLockupProps) {
  const dark = tone === "onDark";
  const tile = dark ? BRAND.deep : BRAND.navy;
  const sub = dark ? "#C7CDF0" : "#475569";

  if (layout === "stacked") {
    return (
      <div className={`flex flex-col items-center ${className}`} style={{ gap: size * 0.45 }}>
        <BrandIcon size={size * 2.2} tile={tile} />
        <Wordmark height={size} tone={tone} />
        {tagline && (
          <p className="font-mono font-semibold uppercase" style={{ fontSize: Math.max(10, size * 0.22), letterSpacing: "0.16em", color: sub }}>
            {tagline}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center ${className}`} style={{ gap: size * 0.45 }}>
      <BrandIcon size={size * 1.6} tile={tile} />
      <Wordmark height={size} tone={tone} />
      {tagline && (
        <>
          <span aria-hidden="true" style={{ width: 2, alignSelf: "stretch", margin: `${size * 0.15}px ${size * 0.1}px`, background: dark ? "rgba(255,255,255,.18)" : "#E2E8F0" }} />
          <p className="font-medium leading-snug" style={{ fontSize: Math.max(12, size * 0.32), color: sub, maxWidth: size * 4 }}>
            {tagline}
          </p>
        </>
      )}
    </div>
  );
}
