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
| change1108: on a phone the header above already names the page, so inside
| a folder the label tab is left out there and the folder opens on its row
| of tabs; the label stays on pages that are not in a folder (Today).
|
| Phone pass (2026-11-12): under 768 px the folder is flat. Its rim and paper
| took about 30 px of a 390 px screen and one level of boxes from every card
| inside, so long text wrapped to two or three words a line. On a phone the
| page sits straight on the canvas, the parts are a slim row of tabs that
| stays under the header while the page scrolls, and a plain page's label is
| left out when it only repeats the header's title (Profile, Notifications).
| Tablets and computers keep the folder as it was.
|
*/

type Label = { icon: IconName; title: ReactNode; line?: ReactNode };

export default function StudentFolder({
  hub,
  tab,
  label,
  counts = {},
  actions,
  pageTitle,
  children,
}: {
  /** The header's title: a plain page's label that only repeats it is left out on a phone. */
  pageTitle?: string;
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
  const labelRepeatsTitle = typeof shown.title === "string" && shown.title === pageTitle;
  const labelOnPhone = tabs.length > 1 || labelRepeatsTitle ? "max-md:hidden" : "flex";

  return (
    <section className="student-folder md:rounded-[30px] md:bg-psu-100 md:p-2.5 md:shadow-raised md:ring-1 md:ring-inset md:ring-psu-600/10 print:bg-transparent print:p-0 print:shadow-none print:ring-0">
      <div className="md:flex md:items-end print:hidden">
        {/* The label tab: the folder's name, and what the open part is for. */}
        <div className={`relative z-[1] min-w-0 items-center gap-3 px-1 pb-3 md:flex md:max-w-[44%] md:flex-[0_1_auto] md:rounded-tl-[22px] md:rounded-tr-none md:bg-(--folder-paper) md:px-3 md:py-2.5 md:pr-1.5 ${labelOnPhone}`}>
          <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold-300 text-psu-950 shadow-[inset_0_-2px_0_rgb(0_0_0/0.08)]">
            <Icon name={shown.icon} size={20} />
          </span>
          <div className="min-w-0">
            <p className="font-folder truncate text-[17px] font-extrabold leading-tight text-slate-900 md:text-[20px]">{shown.title}</p>
            {shown.line && <p className="text-[13px] leading-snug text-slate-600 md:truncate md:text-[12.5px]">{shown.line}</p>}
          </div>
          {/* The tab's curve down to the rim. */}
          <svg aria-hidden="true" viewBox="0 0 67 100" preserveAspectRatio="none" className="absolute -right-[46px] top-0 hidden h-full w-[47px] md:block">
            <path d="M0 0 C 26 0, 22 100, 47 100 L 0 100 Z" className="fill-(--folder-paper)" />
          </svg>
        </div>

        {tabs.length > 1 && (
          <nav
            aria-label={`${hub?.label ?? ""} parts`}
            className="sticky top-[calc(var(--inb-top-inset,0px)+var(--phone-header-h,76px))] z-20 -mx-4 mb-3 flex gap-1 overflow-x-auto bg-(--role-surface)/95 px-4 py-2 shadow-[0_1px_0_var(--role-hairline)] backdrop-blur-sm md:static md:z-auto md:mx-0 md:mb-0 md:shadow-none md:backdrop-blur-none md:min-w-0 md:flex-1 md:items-center md:rounded-none md:bg-transparent md:pb-3 md:pl-[54px] md:pr-1 md:pt-1 [scrollbar-width:none]"
          >
            {/* On a phone the parts are one segmented bar, so they never look like the page's filter chips. */}
            <div className="flex min-w-max flex-1 gap-0.5 rounded-full bg-white p-1 ring-1 ring-inset ring-(--role-hairline) md:contents">
            {tabs.map((item) => {
              const on = item === tab;
              const count = counts[item.path.split("?")[0]] ?? 0;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  aria-current={on ? "page" : undefined}
                  aria-label={item.short ? `${item.label}${count > 0 ? `, ${count} waiting` : ""}` : undefined}
                  className={`relative flex h-9 min-w-[56px] flex-auto shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold transition-colors md:h-10 md:flex-none md:flex-row md:gap-[7px] md:rounded-full md:pl-[11px] md:pr-[13px] md:text-[13.5px] pointer-coarse:md:h-11 ${
                    on ? "bg-psu-800 text-white shadow-raised md:bg-white md:text-psu-900" : "text-slate-600 hover:text-slate-900 md:hover:bg-white/60"
                  }`}
                >
                  <Icon name={item.icon} size={16} className={`max-md:hidden ${on ? "text-psu-700" : "text-slate-500"}`} />
                  {item.short ? (
                    <>
                      <span className="max-w-full truncate md:hidden">{item.short}</span>
                      <span className="max-w-full truncate max-md:hidden">{item.label}</span>
                    </>
                  ) : (
                    <span className="max-w-full truncate">{item.label}</span>
                  )}
                  {count > 0 && (
                    <span className={`tabular inline-grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold ${on ? "bg-white text-psu-900 md:bg-psu-700 md:text-white" : "bg-psu-700 text-white"} md:static md:h-5 md:min-w-5 md:px-1.5 md:text-[11px]`}>
                      {count > 9 ? "9+" : count}
                      <span className="sr-only"> waiting</span>
                    </span>
                  )}
                </Link>
              );
            })}
            </div>
          </nav>
        )}
        {actions && <div className="flex flex-wrap items-center justify-end gap-2 pb-3 md:ml-auto md:bg-transparent md:px-1 md:pb-2.5">{actions}</div>}
      </div>

      {/* The open part, on the folder's paper. */}
      <div
        className="min-w-0 md:rounded-[0_22px_22px_22px] md:bg-(--folder-paper) md:px-3 md:py-5 lg:px-4 print:bg-white print:p-0"
      >
        {children}
      </div>
    </section>
  );
}
