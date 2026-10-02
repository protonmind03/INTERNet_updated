import { useId, type ReactNode } from "react";

/**
 * A short label that appears when its child is hovered or focused. Unlike
 * the browser's own `title`, it shows at once, is styled like the rest of
 * the app, and also appears on keyboard focus and on a tap.
 *
 * It is for supplementary hints only: anything the user must know belongs
 * in visible text, not in a tooltip.
 */
export default function Tooltip({
  label,
  side = "top",
  children,
  className = "",
}: {
  label: string;
  side?: "top" | "bottom" | "left";
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const position = {
    top: "bottom-full left-1/2 mb-1.5 -translate-x-1/2",
    bottom: "left-1/2 top-full mt-1.5 -translate-x-1/2",
    left: "right-full top-1/2 mr-1.5 -translate-y-1/2",
  }[side];

  return (
    <span className={`group/tip relative inline-flex ${className}`} aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute z-50 w-max max-w-56 rounded-md bg-slate-900 px-2 py-1 text-center text-xs font-medium leading-snug text-white opacity-0 shadow-lg transition-opacity delay-75 duration-150 group-focus-within/tip:opacity-100 group-hover/tip:opacity-100 ${position}`}
      >
        {label}
      </span>
    </span>
  );
}
