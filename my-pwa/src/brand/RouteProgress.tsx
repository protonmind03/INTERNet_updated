import { BRAND } from "./geometry";

/* ======================================================================
   RouteProgress — thin amber bar on every page change
   ====================================================================== */

/** Render once in the app shell: <RouteProgress trigger={location.pathname} />. */
export default function RouteProgress({ trigger, color = BRAND.amber }: { trigger: string; color?: string }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[95] h-[3px]">
      <div key={trigger} className="inb-route h-full w-full rounded-r-full" style={{ background: `linear-gradient(90deg, ${color}00, ${color} 30%, ${color})` }} />
    </div>
  );
}
