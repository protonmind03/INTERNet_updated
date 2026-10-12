import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/Icon";
import { Skeleton } from "../../components/ui";
import { coordinatorRequest } from "./request";

/*
| What a term still needs before it runs, for a term that has not started
| or has just started. Each line is counted by the server from records
| (services/termSetup.ts): nothing here is ticked by hand, so a line reads
| "Done" only when it is.
*/

type Line = { key: string; label: string; done: boolean; detail: string; link: string };

export default function TermSetup({
  termId,
  termName,
  startsOpen,
}: {
  termId: number;
  termName: string;
  /** Open to begin with: for the one term being set up now, so several upcoming terms do not fill the page. */
  startsOpen: boolean;
}) {
  const [state, setState] = useState<{ lines: Line[]; done: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    coordinatorRequest<{ lines: Line[]; done: number }>(`/api/coordinator/terms/${termId}/setup`)
      .then((data) => {
        if (current) setState({ lines: data.lines || [], done: data.done || 0 });
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [termId]);

  if (failed) return <p className="mt-3 text-sm text-slate-600">The setup checklist could not be loaded.</p>;
  if (!state) return <Skeleton className="mt-3 h-24 w-full rounded-lg" />;
  const all = state.done === state.lines.length;

  return (
    <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50" open={startsOpen && !all}>
      <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold text-slate-900">
        Setup for {termName}: {state.done} of {state.lines.length} done
      </summary>
      <ul className="divide-y divide-slate-200 border-t border-slate-200">
        {state.lines.map((line) => (
          <li key={line.key} className="flex items-start gap-2.5 px-3 py-2.5">
            <Icon
              name={line.done ? "check-circle" : "alert"}
              size={18}
              className={`mt-0.5 shrink-0 ${line.done ? "text-emerald-700" : "text-amber-700"}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900">
                {line.label}
                <span className={`ml-2 text-xs font-semibold ${line.done ? "text-emerald-800" : "text-amber-800"}`}>
                  {line.done ? "Done" : "Not done"}
                </span>
              </p>
              <p className="break-words text-sm text-slate-600">{line.detail}</p>
            </div>
            <Link
              to={line.link}
              className="shrink-0 self-center rounded-md px-2 py-1.5 text-sm font-semibold text-psu-700 hover:bg-white hover:underline"
            >
              Open<span className="sr-only">: {line.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
