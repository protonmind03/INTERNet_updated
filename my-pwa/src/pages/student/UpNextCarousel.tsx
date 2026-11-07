import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Icon, { type IconName } from "../../components/Icon";
import { Skeleton } from "../../components/ui";
import { daysUntil } from "../../lib/format";
import { formatPhDay } from "../../lib/phTime";

/*
|--------------------------------------------------------------------------
| UP NEXT (Today, revisions November 2026)
|--------------------------------------------------------------------------
|
| What is coming, as cards to swipe through instead of a list with "See
| all": tasks and documents falling due, this week's report, days with no
| OJT (holidays) and the day the hours are expected to be done. Each card
| leads with its date as a large calendar leaf, says what kind of thing it
| is in its own colour and words, how far off it is, and where to go.
|
| A row that snaps card by card, with the next card peeking in so it reads
| as swipeable; dots below (and arrows on a wide screen) move one card at a
| time. Nothing moves by itself.
|
*/

export type UpNextKind = "task" | "document" | "report" | "holiday" | "finish";

export type UpNextItem = {
  key: string;
  kind: UpNextKind;
  /** YYYY-MM-DD in the Philippines. */
  date: string;
  title: string;
  detail?: string;
  to: string;
  action: string;
};

const KIND: Record<UpNextKind, { label: string; icon: IconName; tone: string; leaf: string }> = {
  task: { label: "Task due", icon: "tasks", tone: "text-psu-800 bg-psu-100", leaf: "bg-psu-700" },
  document: { label: "Document due", icon: "document", tone: "text-sky-900 bg-sky-100", leaf: "bg-sky-700" },
  report: { label: "Report", icon: "note", tone: "text-emerald-900 bg-emerald-100", leaf: "bg-emerald-700" },
  holiday: { label: "No OJT", icon: "calendar", tone: "text-rose-900 bg-rose-100", leaf: "bg-rose-700" },
  finish: { label: "Hours done", icon: "flag", tone: "text-amber-900 bg-gold-200", leaf: "bg-gold-600" },
};

function countdown(date: string): string {
  const days = daysUntil(date);
  if (days === null) return "";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `In ${days} days`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? "In a week" : `In ${weeks} weeks`;
}

export default function UpNextCarousel({ items, loading }: { items: UpNextItem[]; loading: boolean }) {
  const row = useRef<HTMLUListElement | null>(null);
  const [current, setCurrent] = useState(0);

  // Which card is in view, as the row is swiped.
  useEffect(() => {
    const list = row.current;
    if (!list) return;
    const cards = [...list.children] as HTMLElement[];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) setCurrent(cards.indexOf(entry.target as HTMLElement));
        }
      },
      { root: list, threshold: [0.6] }
    );
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [items]);

  const go = (index: number) => {
    const list = row.current;
    const card = list?.children[index] as HTMLElement | undefined;
    if (!list || !card) return;
    list.scrollTo({ left: card.offsetLeft - list.offsetLeft, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <section aria-labelledby="up-next-title" aria-roledescription="carousel" className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="up-next-title" className="text-[16px] font-extrabold text-slate-900">
          Up next
        </h2>
        {items.length > 1 && (
          <div className="hidden items-center gap-1 md:flex">
            <button type="button" onClick={() => go(Math.max(0, current - 1))} disabled={current === 0} aria-label="Previous" className="grid h-9 w-9 place-items-center rounded-full bg-white text-slate-700 ring-1 ring-(--role-hairline) hover:bg-psu-50 disabled:opacity-40">
              <Icon name="chevron-left" size={17} />
            </button>
            <button type="button" onClick={() => go(Math.min(items.length - 1, current + 1))} disabled={current >= items.length - 1} aria-label="Next" className="grid h-9 w-9 place-items-center rounded-full bg-white text-slate-700 ring-1 ring-(--role-hairline) hover:bg-psu-50 disabled:opacity-40">
              <Icon name="chevron-right" size={17} />
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-[148px] w-full rounded-2xl" />
      ) : items.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-5 text-[14px] text-slate-600 ring-1 ring-inset ring-(--role-hairline)">Nothing coming up in the next weeks.</p>
      ) : (
        <>
          <ul ref={row} className="up-next-row -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {items.map((item, index) => {
              const kind = KIND[item.kind];
              return (
                <li
                  key={item.key}
                  aria-roledescription="slide"
                  aria-label={`${index + 1} of ${items.length}`}
                  className={`w-[82%] shrink-0 snap-start sm:w-[62%] ${items.length === 1 ? "w-full sm:w-full" : ""} lg:w-[86%]`}
                >
                  <Link
                    to={item.to}
                    className="up-next-card group flex h-full min-h-[148px] gap-3.5 rounded-2xl bg-white p-3.5 ring-1 ring-inset ring-(--role-hairline) transition-shadow hover:shadow-raised"
                  >
                    {/* The date, as a calendar leaf. */}
                    <span aria-hidden="true" className="flex w-[64px] shrink-0 flex-col overflow-hidden rounded-xl bg-slate-50 text-center ring-1 ring-inset ring-slate-200">
                      <span className={`py-1 text-[11px] font-bold uppercase tracking-wider text-white ${kind.leaf}`}>{formatPhDay(item.date, { month: "short" })}</span>
                      <span className="font-display tabular flex flex-1 items-center justify-center text-[30px] font-extrabold leading-none text-slate-900">{formatPhDay(item.date, { day: "numeric" })}</span>
                      <span className="pb-1.5 text-[11px] font-semibold text-slate-500">{formatPhDay(item.date, { weekday: "short" })}</span>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center justify-between gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold ${kind.tone}`}>
                          <Icon name={kind.icon} size={12} />
                          {kind.label}
                        </span>
                        <span className="tabular shrink-0 text-[12.5px] font-bold text-slate-700">{countdown(item.date)}</span>
                      </span>
                      <span className="mt-1.5 line-clamp-2 text-[15.5px] font-bold leading-snug text-slate-900">{item.title}</span>
                      {item.detail && <span className="mt-0.5 line-clamp-1 text-[13px] text-slate-600">{item.detail}</span>}
                      <span className="mt-auto inline-flex items-center gap-1 pt-2 text-[13.5px] font-bold text-psu-700 group-hover:underline">
                        {item.action}
                        <Icon name="arrow-right" size={14} />
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {items.length > 1 && (
            <div className="mt-2 flex justify-center gap-1.5" role="group" aria-label="Choose a card">
              {items.map((item, index) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => go(index)}
                  aria-label={`Card ${index + 1}: ${item.title}`}
                  aria-current={index === current ? "true" : undefined}
                  className="grid h-6 min-w-6 place-items-center"
                >
                  <span className={`block h-2 rounded-full transition-all ${index === current ? "w-5 bg-psu-700" : "w-2 bg-psu-200"}`} />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
