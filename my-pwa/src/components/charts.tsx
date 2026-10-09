import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

/*
|--------------------------------------------------------------------------
| CHARTS
|--------------------------------------------------------------------------
|
| The few chart shapes the coordinator's pages need, drawn the same way
| everywhere:
|
|  - one series is one colour (the brand blue) and needs no legend;
|  - marks are thin, with a rounded end and a square foot on the baseline;
|  - grid lines are faint and solid, and numbers sit in ordinary text ink;
|  - pointing at (or arrowing to) a mark shows its exact figure, and every
|    chart can also be read as a table.
|
*/

/** A round number at or above `value`, and the step between grid lines. */
function niceScale(value: number): { max: number; step: number } {
  if (value <= 0) return { max: 1, step: 1 };
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const fraction = value / magnitude;
  const step = (fraction <= 1 ? 0.25 : fraction <= 2 ? 0.5 : fraction <= 5 ? 1 : 2.5) * magnitude;
  return { max: Math.ceil(value / step) * step, step };
}

const trim = (value: number) => Number(value.toFixed(2)).toLocaleString("en-PH");

/*
|--------------------------------------------------------------------------
| COLUMN CHART
|--------------------------------------------------------------------------
*/

export type ColumnPoint = {
  key: string;
  /** Shown under the column when there is room, and in the tooltip. */
  label: string;
  /** A shorter label for under the column, when the full one would not fit. */
  axisLabel?: string;
  value: number;
  /** A second line for the tooltip, e.g. "3 logs from 2 students". */
  detail?: string;
  /** A fill for this column, when the columns are ordered steps of one scale. */
  color?: string;
};

export function ColumnChart({
  points,
  label,
  format = trim,
  height = 180,
  axis = true,
  capLabels = "peak",
  wholeNumbers = false,
}: {
  points: ColumnPoint[];
  /** What the chart shows, for screen readers. */
  label: string;
  format?: (value: number) => string;
  /** Height of the plot in pixels, not counting the labels underneath. */
  height?: number;
  /** Draw the value scale and grid lines. */
  axis?: boolean;
  /** Print the value above the tallest column only, above all, or none. */
  capLabels?: "peak" | "all" | "none";
  /** The values are counts, so the scale only uses whole numbers. */
  wholeNumbers?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  const hintId = useId();

  const highest = Math.max(0, ...points.map((point) => point.value));
  let { max, step } = niceScale(highest);
  if (wholeNumbers && step < 1) {
    step = 1;
    max = Math.max(1, Math.ceil(highest));
  }
  const ticks: number[] = [];
  for (let tick = 0; tick <= max + step / 2; tick += step) ticks.push(tick);

  const peak = points.reduce(
    (best, point, index) => (point.value > points[best].value ? index : best),
    0
  );
  // Label about six columns along the bottom, always including both ends.
  const every = Math.max(1, Math.ceil(points.length / 6));
  // A regular label that would crowd the last one gives way to it.
  const last = points.length - 1;
  const showLabel = (index: number) =>
    points.length <= 8 ||
    index === last ||
    (index % every === 0 && last - index >= Math.max(2, every * 0.75));

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const move = event.key === "ArrowRight" ? 1 : -1;
    setActive((current) =>
      Math.max(0, Math.min(points.length - 1, (current ?? (move > 0 ? -1 : points.length)) + move))
    );
  };

  const shown = active !== null ? points[active] : null;

  return (
    <div>
      <div
        role="img"
        aria-label={label}
        aria-describedby={hintId}
        tabIndex={0}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        onMouseLeave={() => setActive(null)}
        className="relative flex rounded-md"
      >
        <p id={hintId} className="sr-only">
          Use the left and right arrow keys to read each value.
          {shown ? ` ${shown.label}: ${format(shown.value)}.` : ""}
        </p>

        {axis && (
          <div
            className="tabular relative mr-2 w-9 shrink-0 text-right text-[11px] text-slate-400"
            style={{ height }}
            aria-hidden="true"
          >
            {ticks.map((tick) => (
              <span
                key={tick}
                className="absolute right-0 -translate-y-1/2 leading-none"
                style={{ top: `${(1 - tick / max) * 100}%` }}
              >
                {format(tick)}
              </span>
            ))}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height }}>
            {/* Grid lines: faint, solid, behind the columns. */}
            {axis &&
              ticks.map((tick) => (
                <span
                  key={tick}
                  aria-hidden="true"
                  className={`absolute inset-x-0 h-px ${tick === 0 ? "bg-slate-300" : "bg-slate-100"}`}
                  style={{ top: `${(1 - tick / max) * 100}%` }}
                />
              ))}
            {!axis && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px bg-slate-300" />}

            <div className="absolute inset-0 flex items-end">
              {points.map((point, index) => {
                const isActive = index === active;
                const tall = (point.value / max) * 100;
                return (
                  <div
                    key={point.key}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => setActive(index)}
                    className="relative flex h-full min-w-0 flex-1 items-end justify-center px-px"
                  >
                    {isActive && (
                      <span aria-hidden="true" className="absolute inset-0 rounded-sm bg-psu-50" />
                    )}
                    {(capLabels === "all" || (capLabels === "peak" && index === peak)) &&
                      point.value > 0 &&
                      !isActive && (
                        <span
                          aria-hidden="true"
                          className="tabular pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-slate-700"
                          style={{ bottom: `calc(${tall}% + 4px)` }}
                        >
                          {format(point.value)}
                        </span>
                      )}
                    <span
                      className="relative w-full max-w-6 rounded-t transition-[height,filter] duration-500 ease-soft"
                      style={{
                        height: point.value > 0 ? `max(${tall}%, 3px)` : 0,
                        background: point.color ?? "var(--color-psu-600)",
                        filter: isActive ? "brightness(0.82)" : undefined,
                      }}
                    />
                  </div>
                );
              })}
            </div>

            {shown && active !== null && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-0 z-10 w-max max-w-48 -translate-y-full rounded-lg bg-psu-950 px-2.5 py-1.5 text-xs text-white shadow-raised"
                style={{
                  left: `${((active + 0.5) / points.length) * 100}%`,
                  transform: `translate(${
                    active < points.length * 0.2 ? "-15%" : active > points.length * 0.8 ? "-85%" : "-50%"
                  }, calc(-100% - 2px))`,
                }}
              >
                <span className="block font-semibold">{format(shown.value)}</span>
                <span className="block text-psu-200">{shown.label}</span>
                {shown.detail && <span className="block text-psu-200">{shown.detail}</span>}
              </div>
            )}
          </div>

          <div className="mt-1.5 flex" aria-hidden="true">
            {points.map((point, index) => (
              <span
                key={point.key}
                className={`min-w-0 flex-1 text-center text-[11px] leading-tight ${
                  index === active ? "font-semibold text-slate-900" : "text-slate-500"
                }`}
              >
                {/* Labels are wider than their slot, so they hang centred under
                    it; the two end labels stay inside the plot instead. */}
                <span
                  className={`relative inline-block whitespace-nowrap ${
                    points.length > 8 && index === 0
                      ? "left-0 float-left"
                      : points.length > 8 && index === last
                        ? "right-0 float-right"
                        : "left-1/2 -translate-x-1/2"
                  }`}
                >
                  {showLabel(index) || index === active ? (point.axisLabel ?? point.label) : ""}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| SHARE BAR
|--------------------------------------------------------------------------
|
| Parts of a whole on one bar, with the figures listed underneath so the
| colours never have to be read alone.
|
*/

export type ShareSegment = {
  label: string;
  value: number;
  /** A CSS colour for this part. */
  color: string;
  /** A short note after the count, e.g. "2 past due". */
  note?: string;
};

export function ShareBar({ segments, label }: { segments: ShareSegment[]; label: string }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const share = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);
  return (
    <div>
      <div
        role="img"
        aria-label={`${label}: ${segments
          .map((segment) => `${segment.label} ${segment.value}`)
          .join(", ")}`}
        className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-slate-100"
      >
        {segments
          .filter((segment) => segment.value > 0)
          .map((segment) => (
            <span
              key={segment.label}
              title={`${segment.label}: ${segment.value} (${share(segment.value)}%)`}
              className="h-full min-w-1.5 transition-[flex-grow] duration-500 ease-soft"
              style={{ flexGrow: segment.value, flexBasis: 0, background: segment.color }}
            />
          ))}
      </div>
      <ul className="mt-3.5 space-y-2">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-baseline gap-2.5 text-sm">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 translate-y-px rounded-sm"
              style={{ background: segment.color }}
            />
            <span className="min-w-0 flex-1 text-slate-700">
              {segment.label}
              {segment.note && <span className="text-slate-500"> · {segment.note}</span>}
            </span>
            <span className="tabular shrink-0 font-semibold text-slate-900">{segment.value}</span>
            <span className="tabular w-10 shrink-0 text-right text-slate-500">
              {share(segment.value)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| BAR LIST
|--------------------------------------------------------------------------
*/

export type BarRow = {
  label: string;
  value: number;
  /** Small text under the label. */
  note?: string;
  /** What to print at the end of the bar when it is not the plain value. */
  display?: ReactNode;
};

export function BarList({
  rows,
  max,
  format = trim,
}: {
  rows: BarRow[];
  /** The value a full-width bar stands for. Defaults to the largest row. */
  max?: number;
  format?: (value: number) => string;
}) {
  const scale = max ?? Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul className="space-y-3.5">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-700">{row.label}</span>
            <span className="tabular shrink-0 font-semibold text-slate-900">
              {row.display ?? format(row.value)}
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full rounded-r-full bg-slate-100">
            <div
              className="h-full rounded-r-full bg-psu-600 transition-[width] duration-500 ease-soft"
              style={{ width: `${Math.max(0, Math.min(100, (row.value / scale) * 100))}%` }}
            />
          </div>
          {row.note && <p className="mt-1 text-xs text-slate-500">{row.note}</p>}
        </li>
      ))}
    </ul>
  );
}

/*
|--------------------------------------------------------------------------
| TABLE VIEW
|--------------------------------------------------------------------------
*/

/** The same figures as a chart, as a table that can be opened underneath it. */
export function ChartTable({
  head,
  rows,
}: {
  head: string[];
  rows: (string | number)[][];
}) {
  return (
    <details className="mt-3 text-sm print:hidden">
      <summary className="cursor-pointer text-xs font-semibold text-psu-700 hover:underline">
        View as a table
      </summary>
      <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="table-head border-b border-slate-100 text-slate-500">
              {head.map((cell, index) => (
                <th
                  key={cell}
                  scope="col"
                  className={`px-3 py-2 font-medium ${index > 0 ? "text-right" : ""}`}
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, index) => (
                  <td
                    key={index}
                    className={`px-3 py-1.5 ${
                      index > 0 ? "tabular text-right text-slate-700" : "text-slate-900"
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** "+12% vs the previous 14 days", coloured by direction, for a stat tile. */
export function Change({
  current,
  previous,
  versus,
}: {
  current: number;
  previous: number;
  /** What the figure is compared with, e.g. "the previous 14 days". */
  versus: string;
}) {
  if (previous <= 0) {
    return <>{current > 0 ? `Nothing in ${versus}` : `None in ${versus} either`}</>;
  }
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return <>Level with {versus}</>;
  return (
    <>
      <span className={`font-semibold ${change > 0 ? "text-emerald-700" : "text-red-700"}`}>
        {change > 0 ? "▲" : "▼"} {Math.abs(change)}%
      </span>{" "}
      vs {versus}
    </>
  );
}
