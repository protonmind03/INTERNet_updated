import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import Icon, { type IconName } from "../../components/Icon";
import type { Hub, HubTab } from "./hubs";

/*
|--------------------------------------------------------------------------
| THE TRAINEE'S FOLDER (revisions, November 2026)
|--------------------------------------------------------------------------
|
| The coordinator's student record is drawn as a folder; the trainee's
| pages are now drawn the same way, in the trainee's own colours (the psu-*
| scale is amber in this portal, brand/brand.css). The folder's name sits
| on its label tab with one line about the open part; on a tablet or
| computer the parts are tabs along the rim beside it, on a phone a row of
| icons with their names under the label. Pages that are not in a folder
| (Today, Profile) get the folder without tabs, so every page has the same
| frame.
|
| The tabs are links: each part keeps its own address (pages/student/hubs.ts).
|
*/

type Label = { icon: IconName; title: ReactNode; line?: ReactNode };

export default function StudentFolder({
  hub,
  tab,
  label,
  counts = {},
  actions,
  children,
}: {
  /** The page's own buttons (Mark all as read), at the end of the folder's rim. */
  actions?: ReactNode;
  /** The folder this page is in; none for a page drawn in a plain folder. */
  hub?: Hub;
  tab?: HubTab | null;
  /** What the label tab says when the page is not in a folder, or to replace the folder's own words. */
  label?: Label;
  /** Waiting items per address, shown on the tabs. */
  counts?: Record<string, number | undefined>;
  children: ReactNode;
}) {
  const shown: Label = label ?? { icon: hub?.icon ?? "folder", title: hub?.label ?? "", line: tab?.blurb };
  const tabs = hub?.tabs ?? [];

  return (
    <section className="student-folder rounded-[26px] bg-psu-100 p-1.5 shadow-raised ring-1 ring-inset ring-psu-600/10 md:rounded-[30px] md:p-2.5 print:bg-transparent print:p-0 print:shadow-none print:ring-0">
      <div className="md:flex md:items-end print:hidden">
        {/* The label tab: the folder's name, and what the open part is for. */}
        <div className="relative z-[1] flex min-w-0 items-center gap-3 rounded-t-[20px] bg-(--folder-paper) px-3 py-2.5 md:max-w-[44%] md:flex-[0_1_auto] md:rounded-tl-[22px] md:rounded-tr-none md:pr-1.5">
          <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold-300 text-psu-950 shadow-[inset_0_-2px_0_rgb(0_0_0/0.08)]">
            <Icon name={shown.icon} size={20} />
          </span>
          <div className="min-w-0">
            <p className="font-folder truncate text-[17px] font-extrabold leading-tight text-slate-900 md:text-[20px]">{shown.title}</p>
            {shown.line && <p className="truncate text-[12.5px] text-slate-600">{shown.line}</p>}
          </div>
          {/* The tab's curve down to the rim. */}
          <svg aria-hidden="true" viewBox="0 0 67 100" preserveAspectRatio="none" className="absolute -right-[46px] top-0 hidden h-full w-[47px] md:block">
            <path d="M0 0 C 26 0, 22 100, 47 100 L 0 100 Z" className="fill-(--folder-paper)" />
          </svg>
        </div>

        {tabs.length > 1 && (
          <nav
            aria-label={`${hub?.label ?? ""} parts`}
            className="flex gap-1 overflow-x-auto bg-(--folder-paper) px-1.5 pb-1.5 pt-0.5 md:min-w-0 md:flex-1 md:items-center md:bg-transparent md:pb-3 md:pl-[54px] md:pr-1 md:pt-1 [scrollbar-width:none]"
          >
            {tabs.map((item) => {
              const on = item === tab;
              const count = counts[item.path.split("?")[0]] ?? 0;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  aria-current={on ? "page" : undefined}
                  aria-label={item.short ? `${item.label}${count > 0 ? `, ${count} waiting` : ""}` : undefined}
                  className={`relative flex h-14 min-w-[64px] flex-1 shrink-0 flex-col items-center justify-center gap-[3px] rounded-xl px-1.5 text-[11.5px] font-semibold transition-colors md:h-10 md:flex-none md:flex-row md:gap-[7px] md:rounded-full md:pl-[11px] md:pr-[13px] md:text-[13.5px] pointer-coarse:md:h-11 ${
                    on ? "bg-white text-psu-900 shadow-raised" : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
                  }`}
                >
                  <Icon name={item.icon} size={16} className={on ? "text-psu-700" : "text-slate-500"} />
                  {item.short ? (
                    <>
                      <span className="max-w-full truncate md:hidden">{item.short}</span>
                      <span className="max-w-full truncate max-md:hidden">{item.label}</span>
                    </>
                  ) : (
                    <span className="max-w-full truncate">{item.label}</span>
                  )}
                  {count > 0 && (
                    <span className="tabular absolute right-1 top-1 inline-grid h-[17px] min-w-[17px] place-items-center rounded-full bg-psu-700 px-1 text-[10px] font-bold text-white md:static md:h-5 md:min-w-5 md:px-1.5 md:text-[11px]">
                      {count > 9 ? "9+" : count}
                      <span className="sr-only"> waiting</span>
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        )}
        {actions && <div className="flex flex-wrap items-center justify-end gap-2 bg-(--folder-paper) px-2.5 pb-2 md:ml-auto md:bg-transparent md:px-1 md:pb-2.5">{actions}</div>}
      </div>

      {/* The open part, on the folder's paper. */}
      <div
        className="min-w-0 rounded-b-[20px] bg-(--folder-paper) p-2.5 sm:p-4 md:rounded-[0_22px_22px_22px] md:px-3 md:py-5 lg:px-4 print:bg-white print:p-0"
      >
        {children}
      </div>
    </section>
  );
}
