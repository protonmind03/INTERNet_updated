import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/Icon";
import InfoTip from "../../components/InfoTip";
import { Skeleton } from "../../components/ui";
import { coordinatorRequest } from "./request";

/*
|--------------------------------------------------------------------------
| KEY FIGURES
|--------------------------------------------------------------------------
|
| PSU redesign, Section 7: plain figures. Each card is the value, one line
| of what it was worked out from, and an "i" with exactly what is counted;
| the title opens the list behind the figure. There are no targets, no
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

function KpiCard({ kpi }: { kpi: Kpi }) {
  const shown = kpi.value === null ? null : show(kpi.value, kpi.unit);
  return (
    <div className="card-hairline flex flex-col rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <Link to={kpi.link} className="text-[13.5px] font-bold text-slate-800 underline-offset-2 hover:underline">
          {kpi.label}
        </Link>
        <InfoTip label={`About ${kpi.label}`} text={kpi.definition} />
      </div>
      <p className="mt-1.5">
        <span className="font-display tabular text-[30px] font-extrabold leading-none text-slate-900">{shown ? shown.figure : "–"}</span>
        {shown?.unit && <span className="text-[14px] text-slate-700"> {shown.unit}</span>}
      </p>
      <p className="mt-1 text-[13px] text-slate-600">{kpi.value === null ? "Nothing to count yet" : kpi.basis}</p>
    </div>
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
      <h2 id="kpi-heading" className="mb-3 text-[16px] font-bold text-slate-900">
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
            <Skeleton key={card} className="h-[118px] rounded-2xl" />
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
