import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/Icon";
import { Skeleton } from "../../components/ui";
import { coordinatorRequest } from "./request";

/*
|--------------------------------------------------------------------------
| KEY FIGURES
|--------------------------------------------------------------------------
|
| Six figures that say whether the programme is going well, each against a
| target. A card shows the value, the target, the last eight weeks as a
| small line, and how the value compares with four weeks earlier. A card
| takes a colour only when its target is missed, so a page of calm cards
| means nothing needs looking at. The "?" states exactly what is counted,
| and the title opens the list behind the figure.
|
| The names, definitions, targets and the arithmetic are the server's
| (services/kpiDefinitions.ts and kpis.ts); nothing about them is repeated
| here.
|
*/

export type Kpi = {
  key: string;
  label: string;
  definition: string;
  unit: "percent" | "days" | "count";
  target: number;
  direction: "atLeast" | "atMost";
  link: string;
  value: number | null;
  met: boolean | null;
  basis: string;
  previous: number | null;
  previous_label: string;
  series: { date: string; value: number | null }[];
};

function show(value: number, unit: Kpi["unit"]): string {
  if (unit === "percent") return `${value}%`;
  if (unit === "days") return `${value} ${value === 1 ? "day" : "days"}`;
  return String(value);
}

function targetText(kpi: Kpi): string {
  if (kpi.unit === "count" && kpi.target === 0) return "Target: none";
  return `Target: ${show(kpi.target, kpi.unit)} or ${kpi.direction === "atLeast" ? "more" : "less"}`;
}

/** "Up 3 points from 4 weeks earlier", or why there is nothing to compare. */
function changeText(kpi: Kpi): string {
  if (kpi.value === null) return "";
  if (kpi.previous === null) return `Nothing to compare with ${kpi.previous_label}`;
  const change = Math.round((kpi.value - kpi.previous) * 10) / 10;
  if (change === 0) return `Same as ${kpi.previous_label}`;
  const size = Math.abs(change);
  const amount =
    kpi.unit === "percent"
      ? `${size} ${size === 1 ? "point" : "points"}`
      : kpi.unit === "days"
        ? `${size} ${size === 1 ? "day" : "days"}`
        : String(size);
  return `${change > 0 ? "Up" : "Down"} ${amount} from ${kpi.previous_label}`;
}

/** The last eight weeks as a line. Weeks with nothing to count leave a gap. */
function Sparkline({ kpi, missed }: { kpi: Kpi; missed: boolean }) {
  const width = 120;
  const height = 36;
  const values = kpi.series.map((point) => point.value);
  const known = values.filter((value): value is number => value !== null);
  if (known.length < 2) return <div className="h-9" aria-hidden="true" />;
  // The target is kept in view, so the line reads against it.
  const low = Math.min(...known, kpi.target);
  const high = Math.max(...known, kpi.target);
  const span = high - low || 1;
  const x = (index: number) => 3 + (index / (values.length - 1)) * (width - 6);
  const y = (value: number) => 4 + (1 - (value - low) / span) * (height - 8);
  // One path per unbroken run of weeks.
  const runs: string[] = [];
  let run = "";
  values.forEach((value, index) => {
    if (value === null) {
      if (run) runs.push(run);
      run = "";
      return;
    }
    run += `${run ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`;
  });
  if (run) runs.push(run);
  const last = values.length - 1;
  const stroke = missed ? "#b91c1c" : "#1d36d3";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-9 w-[120px] shrink-0"
      aria-hidden="true"
      focusable="false"
    >
      <line
        x1="0"
        x2={width}
        y1={y(kpi.target)}
        y2={y(kpi.target)}
        stroke="#94a3b8"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      {runs.map((path) => (
        <path key={path} d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {values[last] !== null && <circle cx={x(last)} cy={y(values[last] as number)} r="3" fill={stroke} />}
    </svg>
  );
}

export function KpiCard({ kpi }: { kpi: Kpi }) {
  const [explained, setExplained] = useState(false);
  const noteId = useId();
  const missed = kpi.met === false;
  const history = kpi.series
    .map((point) => (point.value === null ? "nothing to count" : show(point.value, kpi.unit)))
    .join(", ");

  return (
    <div
      className={`relative flex flex-col rounded-xl border p-4 shadow-card ${
        missed ? "border-red-200 bg-red-50/60" : "border-slate-200/80 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-700">
          {/* The whole card opens the list; the "?" sits above this link. */}
          <Link to={kpi.link} className="after:absolute after:inset-0 after:rounded-xl hover:underline">
            {kpi.label}
          </Link>
        </h3>
        <button
          type="button"
          aria-expanded={explained}
          aria-controls={noteId}
          onClick={() => setExplained((open) => !open)}
          className="relative z-10 -mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-slate-600 hover:bg-slate-100"
        >
          <span aria-hidden="true">?</span>
          <span className="sr-only">What "{kpi.label}" counts</span>
        </button>
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <p className={`tabular text-3xl font-semibold tracking-tight ${missed ? "text-red-800" : "text-slate-900"}`}>
          {kpi.value === null ? "–" : show(kpi.value, kpi.unit)}
        </p>
        <Sparkline kpi={kpi} missed={missed} />
      </div>
      <p className="sr-only">
        The last eight weeks, oldest first: {history}.
      </p>

      <p className={`mt-1 text-xs font-medium ${missed ? "text-red-800" : "text-slate-600"}`}>
        {targetText(kpi)}
        {kpi.met === false && " · missed"}
        {kpi.met === true && " · met"}
      </p>
      <p className="mt-0.5 text-xs text-slate-600">
        {[kpi.basis, changeText(kpi)].filter(Boolean).join(" · ")}
      </p>

      <p
        id={noteId}
        hidden={!explained}
        className="relative z-10 mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs leading-relaxed text-slate-700"
      >
        {kpi.definition} The small chart is the last eight weeks; the dashed line is the target.
      </p>
    </div>
  );
}

/** The six cards, for all students or those the coordinator's filters leave ("term=3&program=7"). */
export default function KpiCards({ query }: { query: string }) {
  const [state, setState] = useState<{ query: string; kpis: Kpi[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    coordinatorRequest<{ kpis: Kpi[] }>(
      `/api/coordinator/kpis${query ? `?${query}` : ""}`
    )
      .then((data) => {
        if (!current) return;
        setState({ query, kpis: data.kpis || [] });
        setFailed(false);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [query]);

  const loading = !state || state.query !== query;

  return (
    <section aria-labelledby="kpi-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="kpi-heading" className="text-sm font-semibold text-slate-900">
          Key figures
        </h2>
        <p className="text-xs text-slate-600">Each against its target. A card is red only when the target is missed.</p>
      </div>
      {failed && loading ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600">
          The key figures could not be worked out just now. The rest of the page is unaffected.
        </p>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((card) => (
            <Skeleton key={card} className="h-[148px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {state.kpis.map((kpi) => (
            <KpiCard key={kpi.key} kpi={kpi} />
          ))}
        </div>
      )}
      {!loading && state.kpis.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-600">
          <Icon name="info" size={14} className="mt-0.5 shrink-0 text-slate-500" />
          Past weeks are worked out from today's schedules and end dates, which are not kept as they were.
        </p>
      )}
    </section>
  );
}
