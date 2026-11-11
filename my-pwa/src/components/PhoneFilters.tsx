import { useState, type ReactNode } from "react";
import Icon from "./Icon";
import { useMediaQuery } from "../lib/useMediaQuery";

/*
| The supervisor's calm pass (2026-11-12). On a computer the filters sit in
| the page's tools row as they always did. On a phone, where each dropdown
| took a full-width line before the first item, they fold behind one
| "Filters" button that says how many are in use.
*/
export default function PhoneFilters({ children, active = 0 }: { children: ReactNode; active?: number }) {
  const wide = useMediaQuery("(min-width: 768px)");
  const [open, setOpen] = useState(false);
  if (wide) return <>{children}</>;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold ring-1 ring-inset ${
          open || active > 0 ? "bg-psu-50 text-psu-800 ring-psu-300" : "bg-white text-slate-700 ring-slate-300"
        }`}
      >
        <Icon name="filter" size={16} />
        Filters
        {active > 0 && <span className="tabular rounded-full bg-psu-700 px-1.5 text-[11px] font-bold text-white">{active}</span>}
      </button>
      {open && <div className="grid basis-full gap-2">{children}</div>}
    </>
  );
}
