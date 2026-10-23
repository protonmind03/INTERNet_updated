import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import Icon, { type IconName } from "./Icon";
import InfoTip from "./InfoTip";
import { TONE_SOLID, TONE_TILE, type Tone } from "./tones";
import { IconTile, Skeleton } from "./ui";

/*
|--------------------------------------------------------------------------
| THE DATA DISPLAY KIT (system pass)
|--------------------------------------------------------------------------
|
| How every portal shows a figure, a section or a summary, so the same
| kind of information always looks the same:
|
|   MetricCard     a figure with its subject (icon tile), its context line,
|                  an optional meter, an "i" and where to go next
|   SectionTitle   a section of a long page: icon tile, title, one line
|   SummaryTiles   counts that are also the page's filter (Active 12,
|                  No supervisor 3 …), one tile pressed at a time
|   CountTiles     the same look for counts that only inform
|   JumpNav        "On this page": the sections of a long page, with the
|                  one in view marked
|   Meter          a share as a bar, with its words beside it
|   Callout        one sentence the reader should not miss
|
| Colour follows ui.tsx's tones: status colours mean status and always come
| with words; the role's own colour is for plain subjects.
|
*/

/** A share as a bar. `value` is 0 to 1. The words that say the share stay beside it. */
export function Meter({ value, tone = "brand", label, className = "" }: { value: number; tone?: Tone; label: string; className?: string }) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <span
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      className={`block h-2 overflow-hidden rounded-full bg-slate-100 ${className}`}
    >
      <span className={`block h-full rounded-full ${TONE_SOLID[tone]}`} style={{ width: `${clamped * 100}%` }} />
    </span>
  );
}

type MetricCardProps = {
  icon: IconName;
  tone?: Tone;
  title: string;
  /** What is counted, behind an "i". */
  tip?: string;
  value: ReactNode;
  unit?: ReactNode;
  /** One line of context: of how many, since when, what it means. */
  line?: ReactNode;
  /** 0 to 1, drawn as a meter under the figure. */
  meter?: number;
  meterLabel?: string;
  to?: string;
  action?: string;
  loading?: boolean;
  /** Tints the whole card in its tone: for a figure that asks for action now. */
  emphasis?: boolean;
  headingLevel?: 2 | 3;
};

/** A figure, with what it is about, what it means and where to act on it. */
export function MetricCard({ icon, tone = "brand", title, tip, value, unit, line, meter, meterLabel, to, action, loading = false, emphasis = false, headingLevel = 3 }: MetricCardProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={`metric-card relative flex flex-col rounded-2xl p-4 ${emphasis ? `${TONE_TILE[tone]} ring-1 ring-inset ring-current/15` : "card-hairline"}`}>
      <span aria-hidden="true" className={`absolute inset-x-4 top-0 h-[3px] rounded-b-full ${TONE_SOLID[tone]}`} />
      <div className="flex items-start gap-3">
        <IconTile icon={icon} tone={tone} className={emphasis ? "bg-white/70" : ""} />
        <Heading className={`min-w-0 flex-1 pt-0.5 text-[13.5px] font-bold leading-snug ${emphasis ? "" : "text-slate-700"}`}>{title}</Heading>
        {tip && <InfoTip label={`About ${title.toLowerCase()}`} text={tip} />}
      </div>
      {loading ? (
        <>
          <Skeleton className="mt-3 h-8 w-24" />
          <Skeleton className="mt-2 h-3.5 w-36" />
        </>
      ) : (
        <>
          <p className="mt-3">
            <span className={`font-display tabular text-[30px] font-extrabold leading-none ${emphasis ? "" : "text-slate-900"}`}>{value}</span>
            {unit && <span className={`text-[14px] ${emphasis ? "" : "text-slate-600"}`}> {unit}</span>}
          </p>
          {meter !== undefined && <Meter value={meter} tone={tone} label={meterLabel ?? title} className="mt-2.5" />}
          {line && <p className={`mt-1.5 text-[13px] leading-snug ${emphasis ? "" : "text-slate-600"}`}>{line}</p>}
        </>
      )}
      {to && action && (
        <Link to={to} className={`mt-auto inline-flex min-h-11 items-center gap-1 pt-2 text-sm font-bold hover:underline ${emphasis ? "" : "text-psu-700"}`}>
          {action}
          <Icon name="arrow-right" size={15} />
        </Link>
      )}
    </div>
  );
}

/** A section of a long page: an icon tile, the title, a line, and actions. */
export function SectionTitle({ id, icon, tone = "brand", title, description, action }: { id?: string; icon: IconName; tone?: Tone; title: string; description?: string; action?: ReactNode }) {
  return (
    <div id={id} className="flex scroll-mt-24 flex-wrap items-center gap-3">
      <IconTile icon={icon} tone={tone} />
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-[19px] font-extrabold leading-tight text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-[13.5px] text-slate-600">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export type SummaryTile<T extends string> = { value: T; label: string; count: number | null; icon: IconName; tone: Tone };

/**
 * Counts that are also the filter: each tile is a choice, its number says
 * how many it would show. One is pressed; "All" is usually the first.
 */
export function SummaryTiles<T extends string>({ label, tiles, value, onChange }: { label: string; tiles: SummaryTile<T>[]; value: T; onChange: (value: T) => void }) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
      {tiles.map((tile) => {
        const on = tile.value === value;
        return (
          <button
            key={tile.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(tile.value)}
            className={`summary-tile flex min-h-[4.5rem] items-center gap-3 rounded-xl border-[1.5px] px-3.5 py-2.5 text-left transition-colors ${
              on ? "border-psu-600 bg-psu-50" : "border-(--role-hairline) bg-white hover:bg-slate-50"
            }`}
          >
            <IconTile icon={tile.icon} tone={tile.tone} size="sm" />
            <span className="min-w-0">
              <span className="font-display tabular block text-[22px] font-extrabold leading-none text-slate-900">{tile.count ?? "–"}</span>
              <span className="mt-1 block truncate text-[13px] font-semibold text-slate-700">{tile.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Counts that only inform (the same look as SummaryTiles, without the choosing). */
export function CountTiles({ label, tiles }: { label: string; tiles: { label: string; count: number | null; icon: IconName; tone: Tone }[] }) {
  return (
    <dl aria-label={label} className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]">
      {tiles.map((tile) => (
        <div key={tile.label} className="card-hairline flex min-h-[4.5rem] items-center gap-3 rounded-xl px-3.5 py-2.5">
          <IconTile icon={tile.icon} tone={tile.tone} size="sm" />
          <div className="min-w-0">
            <dd className="font-display tabular text-[22px] font-extrabold leading-none text-slate-900">{tile.count ?? "–"}</dd>
            <dt className="mt-1 truncate text-[13px] font-semibold text-slate-700">{tile.label}</dt>
          </div>
        </div>
      ))}
    </dl>
  );
}

/** "On this page": the sections of a long page, the one in view marked. */
export function JumpNav({ sections }: { sections: { id: string; label: string; icon: IconName }[] }) {
  const [current, setCurrent] = useState(sections[0]?.id ?? "");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setCurrent(visible.target.id);
      },
      { rootMargin: "-80px 0px -60% 0px" }
    );
    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [sections]);
  return (
    <nav aria-label="On this page" className="jump-nav sticky top-[calc(var(--inb-top-inset)+0.5rem)] z-10 -mx-1 overflow-x-auto rounded-2xl bg-white/90 p-1.5 shadow-[0_0_0_1px_var(--role-hairline)] backdrop-blur print:hidden">
      <ul className="flex min-w-max gap-1">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              aria-current={current === section.id ? "location" : undefined}
              onClick={() => setCurrent(section.id)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-[13.5px] font-semibold ${
                current === section.id ? "bg-psu-600 text-white" : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <Icon name={section.icon} size={16} />
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** One sentence the reader should not miss, with an icon in its tone. */
export function Callout({ icon, tone = "info", children }: { icon: IconName; tone?: Tone; children: ReactNode }) {
  return (
    <p className={`flex items-start gap-3 rounded-xl px-4 py-3 text-[14px] leading-relaxed ${TONE_TILE[tone]}`}>
      <Icon name={icon} size={18} className="mt-0.5 shrink-0" />
      <span className="text-slate-800">{children}</span>
    </p>
  );
}
