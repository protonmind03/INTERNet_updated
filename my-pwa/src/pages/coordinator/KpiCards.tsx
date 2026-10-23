import { useEffect, useState } from "react";
import { MetricCard } from "../../components/display";
import Icon, { type IconName } from "../../components/Icon";
import { Skeleton } from "../../components/ui";
import { coordinatorRequest } from "./request";

/*
|--------------------------------------------------------------------------
| KEY FIGURES
|--------------------------------------------------------------------------
|
| PSU redesign, Section 7: plain figures. Each card is the value, one line
| of what it was worked out from, and an "i" with exactly what is counted;
| "See the list" opens the list behind the figure. System pass: drawn as a
| MetricCard (components/display.tsx), with the figure's subject as an
| icon and a meter for a share. There are no targets, no
| comparison with an earlier week and no small charts, and nothing is
| coloured as a score.
|
| The names, definitions and the arithmetic are the server's
| (services/kpiDefinitions.ts and kpis.ts); nothing about them is repeated
| here.
|
*/

export type Kpi = {
  key: string;
  label: string;
  definition: string;
  unit: "percent" | "days" | "count";
  link: string;
  value: number | null;
  basis: string;
};

function show(value: number, unit: Kpi["unit"]): { figure: string; unit: string } {
  if (unit === "percent") return { figure: `${value}%`, unit: "" };
  if (unit === "days") return { figure: String(value), unit: value === 1 ? "day" : "days" };
  return { figure: String(value), unit: "" };
}

/** Each figure's subject, drawn as its icon. The tone is the role's own: a figure here is never coloured as a score. */
const KPI_ICON: Record<string, IconName> = {
  on_track: "trend-up",
  attendance_rate: "calendar",
  review_time: "hourglass",
  requirements_complete: "document",
  old_concerns: "flag",
  agreements_ending: "briefcase",
};

function KpiCard({ kpi }: { kpi: Kpi }) {
  const shown = kpi.value === null ? null : show(kpi.value, kpi.unit);
  return (
    <MetricCard
      icon={KPI_ICON[kpi.key] ?? "chart"}
      title={kpi.label}
      tip={kpi.definition}
      value={shown ? shown.figure : "–"}
      unit={shown?.unit}
      meter={kpi.unit === "percent" && kpi.value !== null ? kpi.value / 100 : undefined}
      meterLabel={kpi.label}
      line={kpi.value === null ? "Nothing to count yet" : kpi.basis}
      to={kpi.link}
      action="See the list"
    />
  );
}

/** The six cards, for all students or those the coordinator's filters leave ("term=3&program=7"). */
export default function KpiCards({ query }: { query: string }) {
  const [state, setState] = useState<{ query: string; kpis: Kpi[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    coordinatorRequest<{ kpis: Kpi[] }>(`/api/coordinator/kpis${query ? `?${query}` : ""}`)
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
      <h2 id="kpi-heading" className="sr-only">
        Key figures
      </h2>
      {failed && loading ? (
        <p className="card-hairline flex items-center gap-2 rounded-xl px-4 py-6 text-sm text-slate-600">
          <Icon name="info" size={16} />
          The key figures could not be worked out just now. The rest of the page is unaffected.
        </p>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((card) => (
            <Skeleton key={card} className="h-[204px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {state.kpis.map((kpi) => (
            <KpiCard key={kpi.key} kpi={kpi} />
          ))}
        </div>
      )}
    </section>
  );
}
