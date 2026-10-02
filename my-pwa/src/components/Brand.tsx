/** The INTERNet mark: PSU blue tile, white initials, gold rule. */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label="INTERNet"
      className="shrink-0"
    >
      <rect width="40" height="40" rx="9" className="fill-psu-700" />
      <rect x="0.75" y="0.75" width="38.5" height="38.5" rx="8.25" fill="none" className="stroke-white/15" strokeWidth="1.5" />
      <text
        x="20"
        y="24.5"
        textAnchor="middle"
        fontSize="16"
        fontWeight="800"
        letterSpacing="0.5"
        fill="white"
        fontFamily="inherit"
      >
        IN
      </text>
      <rect x="11" y="29" width="18" height="2.5" rx="1.25" className="fill-gold-400" />
    </svg>
  );
}

export function BrandLockup({
  portal,
  tone = "dark",
}: {
  portal: string;
  /** "dark" for dark backgrounds, "light" for white ones. */
  tone?: "dark" | "light";
}) {
  return (
    <div className="flex items-center gap-3">
      <BrandMark />
      <div className="leading-tight">
        <p
          className={`text-[15px] font-bold tracking-tight ${
            tone === "dark" ? "text-white" : "text-slate-900"
          }`}
        >
          INTERNet
        </p>
        <p
          className={`text-xs ${
            tone === "dark" ? "text-psu-200" : "text-slate-500"
          }`}
        >
          {portal}
        </p>
      </div>
    </div>
  );
}
