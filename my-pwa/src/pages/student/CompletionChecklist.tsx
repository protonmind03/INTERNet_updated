import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/Icon";
import {
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  ErrorNotice,
  ProgressBar,
  SkeletonRows,
} from "../../components/ui";
import { API_URL, withStudentAuth } from "../../lib/api";
import { formatLongDate } from "../../lib/format";
import { savedFetch } from "../../lib/offlineStore";
import { useAccount } from "../../lib/session";
import { errorText, toast } from "../../lib/toast";

/*
|--------------------------------------------------------------------------
| COMPLETION
|--------------------------------------------------------------------------
|
| What is left before the OJT is done, as the server counts it. When every
| line is done the student may ask the coordinator, once, to review their
| record. The coordinator still decides.
|
| One card, shown on the Profile page and on the Completion page that
| older links still open.
|
*/

type Item = { key: string; done: boolean; detail: string };

/** What each line is called, and where the student goes to finish it. */
const LINES: Record<string, { title: string; to: string; go: string }> = {
  hours: { title: "Required hours", to: "/daily-log", go: "Go to attendance" },
  attendance: { title: "Attendance logs settled", to: "/daily-log", go: "Go to attendance" },
  documents: { title: "Required documents", to: "/documents", go: "Go to documents" },
  tasks: { title: "Tasks finished", to: "/task", go: "Go to tasks" },
  evaluation: { title: "Supervisor's evaluation", to: "/student/feedback", go: "See feedback" },
  feedback: { title: "Your feedback about the company", to: "/student/feedback", go: "Give feedback" },
};

export default function CompletionChecklist({ title = "Completion checklist" }: { title?: string }) {
  const student = useAccount("student");
  const studentId = student?.student_id;

  const [items, setItems] = useState<Item[]>([]);
  const [ready, setReady] = useState(false);
  const [requestedAt, setRequestedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [asking, setAsking] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) return;
    try {
      const response = await savedFetch(
        "student",
        "completion",
        `${API_URL}/api/students/${encodeURIComponent(studentId)}/completion`,
        withStudentAuth()
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not load your checklist.");
      setItems(data.items || []);
      setReady(Boolean(data.ready));
      setRequestedAt(data.requested_at || null);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load your checklist."));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    const refresh = () => {
      void load();
    };
    refresh();
    // A verified log or an approved document arrives as a live notification.
    window.addEventListener("internet-notification", refresh);
    return () => window.removeEventListener("internet-notification", refresh);
  }, [load]);

  const ask = async () => {
    if (!studentId) return;
    setAsking(true);
    try {
      const response = await fetch(
        `${API_URL}/api/students/${encodeURIComponent(studentId)}/completion/request`,
        withStudentAuth({ method: "POST" })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "The request could not be sent.");
      toast.success(data.message || "Your coordinator has been asked to review your record.");
      setConfirming(false);
    } catch (askError) {
      toast.error(errorText(askError, "The request could not be sent."));
      setConfirming(false);
    } finally {
      setAsking(false);
      // Also after a refusal: the checklist may have changed since it was shown.
      await load();
    }
  };

  const done = items.filter((item) => item.done).length;

  return (
    <>
      <div className="space-y-5">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <Card>
          <CardHeader
            title={title}
            description={
              loading || items.length === 0
                ? "What is left before your OJT is done."
                : `${done} of ${items.length} done`
            }
          />
          {!loading && items.length > 0 && (
            <div className="px-4 pt-3 sm:px-5">
              <ProgressBar
                value={(done / items.length) * 100}
                label={`${done} of ${items.length} checklist items done`}
              />
            </div>
          )}
          <div className="mt-3">
            {loading ? (
              <SkeletonRows rows={6} />
            ) : (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {items.map((item) => {
                  const line = LINES[item.key] ?? { title: item.key, to: "", go: "" };
                  return (
                    <li key={item.key} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                      {item.done ? (
                        <Icon name="check-circle" className="mt-0.5 shrink-0 text-emerald-600" />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="mt-1 h-[18px] w-[18px] shrink-0 rounded-full border-2 border-slate-300"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">
                          {line.title}
                          <span className="sr-only">{item.done ? ": done" : ": not done yet"}</span>
                        </p>
                        <p className="text-sm text-slate-600">{item.detail}</p>
                        {!item.done && line.to && (
                          <Link
                            to={line.to}
                            className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-psu-700 hover:underline"
                          >
                            {line.go}
                            <Icon name="chevron-right" size={14} />
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

        {!loading && items.length > 0 && (
          <div className="border-t border-slate-100 p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-slate-900">Completion review</h3>
            {requestedAt ? (
              <p className="mt-2 flex items-start gap-2 text-sm text-slate-700">
                <Icon name="check-circle" size={17} className="mt-0.5 shrink-0 text-emerald-600" />
                <span>
                  You asked for a completion review on {formatLongDate(requestedAt)}. Your OJT
                  coordinator will go through your record; you do not need to ask again.
                </span>
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm text-slate-600">
                  {ready
                    ? "Everything on your checklist is done. Ask your OJT coordinator to review your record. You can ask only once."
                    : "When everything above is done, you can ask your OJT coordinator to review your record."}
                </p>
                <Button
                  className="mt-3"
                  icon="check"
                  disabled={!ready}
                  onClick={() => setConfirming(true)}
                >
                  Request completion review
                </Button>
              </>
            )}
            <p className="mt-4 text-sm text-slate-600">
              For signing, print your{" "}
              <Link to="/time-record" className="font-semibold text-psu-700 hover:underline">
                time record
              </Link>
              .
            </p>
          </div>
        )}
        </Card>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Ask for a completion review?"
        message="Your OJT coordinator will be told that you have finished everything on your checklist. You can ask only once."
        confirmLabel="Send request"
        busy={asking}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void ask()}
      />
    </>
  );
}
