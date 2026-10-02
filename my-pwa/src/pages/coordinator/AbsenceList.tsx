import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Pagination from "../../components/Pagination";
import { Card, CardHeader, EmptyState, SkeletonRows, StatusBadge } from "../../components/ui";
import { formatDayDate } from "../../lib/format";
import { errorText } from "../../lib/toast";
import { usePagination } from "../../lib/usePagination";
import { coordinatorRequest } from "./request";

type Absence = {
  id: number;
  student_id: string;
  student_name: string;
  company: string | null;
  supervisor_name: string | null;
  date: string;
  reason: string;
  status: "Pending" | "Excused" | "Unexcused";
  review_notes: string | null;
};

/** Every absence students have filed, for the coordinator's Monitoring page. */
export default function AbsenceList({ search }: { search: string }) {
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await coordinatorRequest<{ absences: Absence[] }>(
        "/api/coordinator/absences"
      );
      setAbsences(data.absences || []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load absences."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const visible = useMemo(() => {
    const text = search.trim().toLowerCase();
    if (!text) return absences;
    return absences.filter((item) =>
      [item.student_name, item.student_id, item.company, item.supervisor_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(text))
    );
  }, [absences, search]);
  const pager = usePagination(visible, 10);

  return (
    <Card>
      <CardHeader
        title="Absences"
        description="Filed by students and reviewed by their supervisors. You decide for a student who has none."
      />
      <div className="mt-3">
        {loading ? (
          <SkeletonRows rows={2} />
        ) : error ? (
          <p role="alert" className="px-5 pb-5 text-sm text-red-600">
            {error}
          </p>
        ) : visible.length === 0 ? (
          <EmptyState
            icon="calendar"
            title={absences.length === 0 ? "No absences filed" : "No absences match"}
          />
        ) : (
          <>
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {pager.pageItems.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-1.5 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      <Link
                        to={`/coordinator/students/${encodeURIComponent(item.student_id)}`}
                        className="hover:text-psu-700 hover:underline"
                      >
                        {item.student_name}
                      </Link>
                      <span className="font-normal text-slate-500">
                        {" "}
                        · {formatDayDate(item.date)}
                      </span>
                    </p>
                    <p className="text-sm text-slate-600">{item.reason}</p>
                    <p className="text-xs text-slate-500">
                      {item.company || "No company"} · Supervisor:{" "}
                      {item.supervisor_name || "unassigned"}
                      {item.review_notes && ` · Note: ${item.review_notes}`}
                    </p>
                    {item.status === "Pending" && !item.supervisor_name && (
                      <p className="text-xs font-medium text-amber-700">
                        No supervisor to review this. Open the student to decide it yourself.
                      </p>
                    )}
                  </div>
                  <StatusBadge
                    status={item.status === "Pending" ? "Awaiting supervisor" : item.status}
                    tone={
                      item.status === "Excused"
                        ? "good"
                        : item.status === "Unexcused"
                          ? "bad"
                          : "waiting"
                    }
                  />
                </li>
              ))}
            </ul>
            <Pagination state={pager} noun="absence" />
          </>
        )}
      </div>
    </Card>
  );
}
