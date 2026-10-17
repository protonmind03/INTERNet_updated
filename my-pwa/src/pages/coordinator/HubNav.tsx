import { Link } from "react-router-dom";
import { HUBS, tabPath, type HubKey } from "./hubConfig";
import TermSwitcher from "./TermSwitcher";

/**
 * A hub's tabs, as links: each tab has its own address, so it can be
 * bookmarked and the back button works. Profile settings draws them as a
 * list of sections down the left on a wide screen.
 */
export default function HubNav({ hub, tab }: { hub: HubKey; tab: string }) {
  const { title, kind, tabs } = HUBS[hub];
  const vertical = kind === "sections";
  return (
    <div className={vertical ? "mb-6 lg:mb-0" : "mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 print:hidden"}>
      <nav aria-label={`${title} sections`} className={vertical ? "print:hidden" : "-mb-px min-w-0 max-w-full overflow-x-auto"}>
        <ul className={vertical ? "flex gap-1 overflow-x-auto lg:flex-col" : "flex gap-1"}>
          {tabs.map((item) => {
            const current = item.id === tab;
            return (
              <li key={item.id} className="shrink-0">
                <Link
                  to={tabPath(hub, item.id)}
                  aria-current={current ? "page" : undefined}
                  className={
                    vertical
                      ? `flex min-h-11 items-center rounded-lg px-3 text-sm font-medium ${
                          current ? "bg-psu-50 text-psu-900 ring-1 ring-inset ring-psu-600/15" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        }`
                      : `flex min-h-11 items-center border-b-2 px-3 text-sm font-semibold ${
                          current ? "border-psu-600 text-psu-800" : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
                        }`
                  }
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {/* The term switcher drives the shared filter bar's term, for the student list. */}
      {hub === "students" && tab === "students" && (
        <div className="pb-2">
          <TermSwitcher />
        </div>
      )}
    </div>
  );
}
