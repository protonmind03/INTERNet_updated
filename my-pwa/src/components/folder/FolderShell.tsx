import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useScrollPane } from "../../lib/useScrollPane";
import Icon, { type IconName } from "../Icon";

/*
|--------------------------------------------------------------------------
| A FOLDER
|--------------------------------------------------------------------------
|
| Roadmap 3.6. The coordinator's student record is drawn as a folder: a
| label tab with whose it is, its sections as tabs along the rim, and the
| open one inside. This is that folder's markup and styles, copied (the
| record's own files are not imported or changed: they must stay as they
| are), for the student portal and whatever comes next.
|
| Differences from the record: the tabs are links (each is a page with its
| own address) marked aria-current, not ARIA tabs; and on a phone they are
| one row that scrolls sideways under the header (the shared scroll pane),
| so any number of tabs fits.
|
*/

export type FolderTab = {
  id: string;
  label: string;
  icon: IconName;
  to: string;
  count?: number;
  /** A dot on the tab: something there wants attention. */
  attention?: boolean;
};

export default function FolderShell({
  label,
  leading,
  tabs,
  current,
  tabsLabel,
  children,
  phoneTabs = true,
}: {
  /** False when the portal reaches its pages another way on a phone (the trainee's dock): the row is then for wider screens only. */
  phoneTabs?: boolean;
  /** Inside the label tab, after `leading`: a name and a line or two about it. */
  label: ReactNode;
  /** The label tab's mark: an avatar, a back link. */
  leading?: ReactNode;
  tabs: FolderTab[];
  /** The open tab's id, or null on a page that is not one of the tabs. */
  current: string | null;
  /** What the tab row is called, for a screen reader ("Sections"). */
  tabsLabel: string;
  children: ReactNode;
}) {
  const rimRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const pane = useScrollPane<HTMLElement>();

  // The rim: when the tabs do not fit beside the label, their icons go, then
  // they take a row of their own. Phones lay the rim out by CSS alone.
  useEffect(() => {
    const rim = rimRef.current;
    const nav = navRef.current;
    if (!rim || !nav) return;
    const fit = () => {
      rim.dataset.fit = "full";
      if (window.matchMedia("(max-width: 767px)").matches) return;
      if (nav.scrollWidth > nav.clientWidth + 1) rim.dataset.fit = "tight";
      if (nav.scrollWidth > nav.clientWidth + 1) rim.dataset.fit = "stacked";
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(rim);
    return () => observer.disconnect();
  }, [tabs.length]);

  // On a phone the row scrolls: the open tab is brought to its middle, so it is
  // never off to one side. Only the row moves, not the page.
  useEffect(() => {
    const nav = navRef.current;
    const on = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !on || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2;
  }, [current]);

  return (
    <section className="rounded-[30px] bg-psu-100 px-2 pb-2 shadow-raised ring-1 ring-inset ring-psu-600/10 md:px-2.5 md:pb-2.5 print:bg-transparent print:p-0 print:shadow-none print:ring-0">
      {/* The rim: the label tab, and the tabs. */}
      <div ref={rimRef} data-fit="full" className="group/rim max-md:contents md:flex md:items-end md:rounded-t-[30px] md:bg-psu-100 md:pt-2.5 data-[fit=stacked]:flex-wrap print:hidden">
        <div className="relative z-[1] mt-2 flex min-w-0 items-center gap-3 rounded-t-[18px] bg-slate-50 p-2.5 md:mt-0 md:max-w-[46%] md:flex-[0_1_auto] md:rounded-tr-none md:rounded-tl-[22px] md:pb-2 md:pl-2.5 md:pr-1.5 md:pt-2.5 group-data-[fit=tight]/rim:md:max-w-[40%] group-data-[fit=stacked]/rim:md:max-w-none group-data-[fit=stacked]/rim:md:basis-full group-data-[fit=stacked]/rim:md:rounded-t-[22px]">
          {leading}
          <div className="min-w-0 flex-1">{label}</div>
          <svg aria-hidden="true" viewBox="0 0 67 100" preserveAspectRatio="none" className="absolute -right-[66px] top-0 hidden h-full w-[67px] md:block group-data-[fit=stacked]/rim:hidden">
            <path d="M0 0 C 32 0, 34 100, 67 100 L 0 100 Z" className="fill-slate-50" />
          </svg>
        </div>

        <nav
          ref={(element) => {
            navRef.current = element;
            pane(element);
          }}
          aria-label={tabsLabel}
          data-axis="x"
          className={`${phoneTabs ? "" : "max-md:hidden "}inb-scroll-pane sticky top-0 z-20 flex gap-1 border-b border-slate-200 bg-slate-50 p-1.5 shadow-[0_8px_12px_-12px_rgb(15_30_110/0.35)] md:static md:min-w-0 md:flex-1 md:items-center md:gap-1 md:border-0 md:bg-transparent md:py-1 md:pb-3 md:pl-[76px] md:pr-2 md:shadow-none group-data-[fit=stacked]/rim:md:order-first group-data-[fit=stacked]/rim:md:basis-full group-data-[fit=stacked]/rim:md:pl-1`}
        >
          {tabs.map((tab) => {
            const on = tab.id === current;
            return (
              <Link
                key={tab.id}
                to={tab.to}
                aria-current={on ? "page" : undefined}
                className={`relative flex h-14 min-w-[4.75rem] shrink-0 flex-col items-center justify-center gap-[3px] rounded-xl px-2 text-[11px] font-medium tracking-tight transition-colors md:h-10 md:min-w-0 md:flex-none md:flex-row md:gap-[7px] md:rounded-full md:pl-[11px] md:pr-[13px] md:text-[13.5px] md:tracking-normal pointer-coarse:md:h-11 ${
                  on ? "bg-white font-semibold text-psu-900 shadow-raised" : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
                }`}
              >
                <Icon name={tab.icon} size={15} className={`${on ? "text-psu-700" : "text-slate-500"} group-data-[fit=tight]/rim:md:hidden`} />
                <span className="max-w-full truncate whitespace-nowrap">{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`tabular absolute left-[calc(50%+6px)] top-[3px] inline-grid h-[17px] min-w-[17px] place-items-center rounded-full px-1 text-[10px] font-bold md:static md:h-5 md:min-w-5 md:px-1.5 md:text-[11px] ${on ? "bg-psu-700 text-white" : "bg-psu-950/10 text-slate-600"}`}>
                    {tab.count}
                  </span>
                )}
                {tab.attention && (
                  <>
                    <span aria-hidden="true" className="absolute left-[calc(50%-16px)] top-1.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-psu-100 md:left-auto md:right-1.5" />
                    <span className="sr-only">, needs attention</span>
                  </>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="min-w-0 rounded-b-[18px] bg-slate-50 p-3 sm:p-4 md:rounded-[0_22px_22px_22px] md:p-6 print:bg-white print:p-0">
        {children}
      </div>
    </section>
  );
}
