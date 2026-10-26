import Icon from "../../components/Icon";
import { Avatar } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { sameId } from "../../lib/ids";
import type { DocumentEntry, Intern } from "./useSupervisorWork";

/*
|--------------------------------------------------------------------------
| REQUIREMENTS AT A GLANCE (Documents; sv10-26)
|--------------------------------------------------------------------------
|
| Interns down, each requirement across: approved, waiting for review,
| rejected or not uploaded, so what is missing shows without reading every
| file. A file sent more than twice by one intern (a weekly accomplishment
| report) is a recurring one: it gets one column with how many are
| approved and waiting. A cell waiting for review opens the review; the
| others download the latest file.
|
*/

type Cell = { latest: DocumentEntry | null; approved: number; pending: number; rejected: number };

const MARK = {
  Approved: { cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: "check" as const, word: "Approved" },
  Pending: { cls: "bg-amber-50 text-amber-800 ring-amber-300", icon: "inbox" as const, word: "To review" },
  Rejected: { cls: "bg-red-50 text-red-700 ring-red-200", icon: "close" as const, word: "Rejected" },
};

export default function RequirementGrid({
  documents,
  interns,
  onReview,
  onDownload,
}: {
  documents: DocumentEntry[];
  interns: Intern[];
  onReview: (id: number) => void;
  onDownload: (item: DocumentEntry) => void;
}) {
  // Which types recur: sent more than twice by one intern.
  const perIntern = new Map<string, number>();
  for (const item of documents) perIntern.set(`${item.student_id}|${item.doc_type}`, (perIntern.get(`${item.student_id}|${item.doc_type}`) ?? 0) + 1);
  const recurring = new Set([...perIntern.entries()].filter(([, count]) => count > 2).map(([key]) => key.split("|").slice(1).join("|")));
  const types = [...new Set(documents.map((item) => item.doc_type))].sort((a, b) => Number(recurring.has(a)) - Number(recurring.has(b)) || a.localeCompare(b));
  if (types.length === 0 || interns.length === 0) return null;

  const cellOf = (studentId: string, type: string): Cell => {
    const mine = documents
      .filter((item) => sameId(item.student_id, studentId) && item.doc_type === type)
      .sort((a, b) => String(b.uploaded_at).localeCompare(String(a.uploaded_at)));
    return {
      latest: mine.find((item) => item.status === "Pending") ?? mine[0] ?? null,
      approved: mine.filter((item) => item.status === "Approved").length,
      pending: mine.filter((item) => item.status === "Pending").length,
      rejected: mine.filter((item) => item.status === "Rejected").length,
    };
  };
  const complete = (studentId: string) => types.filter((type) => !recurring.has(type) && cellOf(studentId, type).approved > 0).length;
  const required = types.filter((type) => !recurring.has(type)).length;

  return (
    <section aria-labelledby="req-grid-title" className="overflow-hidden rounded-2xl bg-white ring-1 ring-inset ring-(--role-hairline)">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
        <h2 id="req-grid-title" className="text-[15px] font-bold text-slate-900">
          Requirements at a glance
        </h2>
        <ul className="ml-auto flex flex-wrap gap-3 text-[12px] text-slate-600" aria-label="Key">
          {(Object.keys(MARK) as (keyof typeof MARK)[]).map((key) => (
            <li key={key} className="inline-flex items-center gap-1.5">
              <span className={`grid h-4 w-4 place-items-center rounded ring-1 ring-inset ${MARK[key].cls}`} aria-hidden="true">
                <Icon name={MARK[key].icon} size={10} />
              </span>
              {MARK[key].word}
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5">
            <span className="h-4 w-4 rounded border border-dashed border-slate-300" aria-hidden="true" />
            Not uploaded
          </li>
        </ul>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-[11.5px] text-slate-500">
              <th scope="col" className="sticky left-0 z-[1] bg-white px-4 py-2 text-left font-medium">
                Intern
              </th>
              {types.map((type) => (
                <th key={type} scope="col" className="px-1.5 py-2 text-center font-medium">
                  <span className="mx-auto block max-w-24 leading-tight">{recurring.has(type) ? `${type}s` : type}</span>
                </th>
              ))}
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Complete
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {interns.map((intern) => {
              const done = complete(intern.student_id);
              return (
                <tr key={intern.student_id}>
                  <th scope="row" className="sticky left-0 z-[1] bg-white px-4 py-2 text-left font-semibold text-slate-900">
                    <span className="flex items-center gap-2.5">
                      <Avatar name={intern.name} size="sm" />
                      <span className="max-w-40 truncate">{intern.name}</span>
                    </span>
                  </th>
                  {types.map((type) => {
                    const cell = cellOf(intern.student_id, type);
                    const label = `${intern.name}, ${type}`;
                    if (recurring.has(type)) {
                      return (
                        <td key={type} className="px-1.5 py-2 text-center">
                          {cell.latest ? (
                            <button
                              type="button"
                              onClick={() => (cell.pending > 0 && cell.latest ? onReview(cell.latest.id) : cell.latest && onDownload(cell.latest))}
                              className={`req-cell w-auto px-2 ring-1 ring-inset ${cell.pending > 0 ? MARK.Pending.cls : MARK.Approved.cls}`}
                              aria-label={`${label}: ${cell.approved} approved, ${cell.pending} to review`}
                            >
                              <span className="tabular text-[12px] font-bold">
                                {cell.approved}
                                <Icon name="check" size={10} className="mx-0.5 inline" />
                                {cell.pending > 0 && <span className="ml-1">· {cell.pending} new</span>}
                              </span>
                            </button>
                          ) : (
                            <span className="req-cell mx-auto border border-dashed border-slate-300" aria-label={`${label}: none uploaded`} />
                          )}
                        </td>
                      );
                    }
                    const status = cell.pending > 0 ? "Pending" : cell.approved > 0 ? "Approved" : cell.rejected > 0 ? "Rejected" : null;
                    return (
                      <td key={type} className="px-1.5 py-2 text-center">
                        {status && cell.latest ? (
                          <button
                            type="button"
                            onClick={() => (status === "Pending" ? onReview(cell.latest!.id) : onDownload(cell.latest!))}
                            title={`${MARK[status].word} · ${formatDate(cell.latest.uploaded_at)}`}
                            className={`req-cell mx-auto ring-1 ring-inset ${MARK[status].cls}`}
                            aria-label={`${label}: ${MARK[status].word}${status === "Pending" ? ", review it" : ", download it"}`}
                          >
                            <Icon name={MARK[status].icon} size={14} />
                          </button>
                        ) : (
                          <span className="req-cell mx-auto border border-dashed border-slate-300" aria-label={`${label}: not uploaded`} />
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2 text-right">
                    <span className={`tabular text-[13px] font-bold ${done === required ? "text-emerald-700" : "text-slate-700"}`}>
                      {done}/{required}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
