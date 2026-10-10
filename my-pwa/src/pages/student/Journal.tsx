import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  FormError,
  FormField,
  Modal,
  SkeletonRows,
  StatusBadge,
} from "../../components/ui";
import StudentLayout from "../../layouts/StudentLayout";
import { API_URL, withStudentAuth } from "../../lib/api";
import { formatDate, formatDateTime } from "../../lib/format";
import { savedFetch } from "../../lib/offlineStore";
import { useAccount } from "../../lib/session";
import { errorText, toast } from "../../lib/toast";
import { useDraft } from "../../lib/useDraft";

/*
|--------------------------------------------------------------------------
| WEEKLY JOURNAL
|--------------------------------------------------------------------------
|
| Once a week the student writes what they did and what they learned. The
| supervisor marks the entry reviewed, or returns it with a note; a
| returned entry can be edited and sent again. A reviewed entry is closed.
|
*/

type Journal = {
  id: number;
  week_start: string;
  activities: string;
  learnings: string;
  challenges: string | null;
  status: "Submitted" | "Reviewed" | "Returned";
  review_notes: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};

/** How many earlier weeks can still be written when one was missed. */
const WEEKS_BACK = 4;

/** "YYYY-MM-DD" a number of days from a date key. */
function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const weekLabel = (week: string) => `${formatDate(week)} to ${formatDate(shiftDate(week, 6))}`;

function standing(journal: Journal): { label: string; tone: "good" | "waiting" | "bad" } {
  if (journal.status === "Reviewed") return { label: "Reviewed", tone: "good" };
  if (journal.status === "Returned") return { label: "Returned to you", tone: "bad" };
  return { label: "Waiting for your supervisor", tone: "waiting" };
}

export default function WeeklyJournal() {
  const student = useAccount("student");
  const studentId = student?.student_id;

  const [journals, setJournals] = useState<Journal[]>([]);
  const [thisWeek, setThisWeek] = useState("");
  const [limits, setLimits] = useState({ min: 30, max: 3000 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  /** The week being written or edited. */
  const [writing, setWriting] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!studentId) return;
    try {
      const response = await savedFetch(
        "student",
        "journals",
        `${API_URL}/api/journals/student/${encodeURIComponent(studentId)}`,
        withStudentAuth()
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not load your journal.");
      setJournals(data.journals || []);
      setThisWeek(data.current_week_start || "");
      if (data.limits) setLimits(data.limits);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load your journal."));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    const refresh = () => {
      void load();
    };
    refresh();
    // A review arrives as a live notification.
    window.addEventListener("internet-notification", refresh);
    return () => window.removeEventListener("internet-notification", refresh);
  }, [load]);

  const byWeek = useMemo(() => new Map(journals.map((item) => [item.week_start, item])), [journals]);
  const current = byWeek.get(thisWeek);
  // Recent weeks with nothing written, which can still be filled in.
  const missed = useMemo(
    () =>
      thisWeek
        ? Array.from({ length: WEEKS_BACK }, (_, index) => shiftDate(thisWeek, -7 * (index + 1))).filter(
            (week) => !byWeek.has(week)
          )
        : [],
    [thisWeek, byWeek]
  );
  const earlier = journals.filter((item) => item.week_start !== thisWeek);

  return (
    <StudentLayout
      title="Weekly journal"
      subtitle="Once a week, write what you did and what you learned. Your supervisor reviews it."
    >
      <div className="space-y-5">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <Card>
          <CardHeader
            title="This week"
            description={thisWeek ? weekLabel(thisWeek) : undefined}
            action={
              !loading && thisWeek && !current ? (
                <Button size="sm" icon="edit" onClick={() => setWriting(thisWeek)}>
                  Write
                </Button>
              ) : undefined
            }
          />
          <div className="mt-3">
            {loading ? (
              <SkeletonRows rows={2} />
            ) : current ? (
              <div className="border-t border-slate-100 px-4 py-4 sm:px-5">
                <Entry journal={current} onEdit={() => setWriting(current.week_start)} />
              </div>
            ) : (
              <EmptyState
                icon="note"
                title="Nothing written for this week yet"
                description="You can write it any day this week, and change it until your supervisor has reviewed it."
              />
            )}
          </div>
        </Card>

        {!loading && (earlier.length > 0 || missed.length > 0) && (
          <Card>
            <CardHeader title="Earlier weeks" />
            <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
              {[...missed.map((week) => ({ week, journal: undefined as Journal | undefined })),
                ...earlier.map((journal) => ({ week: journal.week_start, journal }))]
                .sort((a, b) => (a.week < b.week ? 1 : -1))
                .map(({ week, journal }) => (
                  <li key={week} className="px-4 py-4 sm:px-5">
                    {journal ? (
                      <Entry journal={journal} showWeek onEdit={() => setWriting(week)} />
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{weekLabel(week)}</p>
                          <p className="text-sm text-slate-500">No journal written.</p>
                        </div>
                        <Button variant="secondary" size="sm" icon="edit" onClick={() => setWriting(week)}>
                          Write
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
            </ul>
          </Card>
        )}
      </div>

      {writing && studentId && (
        <JournalDialog
          key={writing}
          studentId={studentId}
          week={writing}
          journal={byWeek.get(writing) ?? null}
          limits={limits}
          onClose={() => setWriting(null)}
          onSaved={() => {
            setWriting(null);
            void load();
          }}
        />
      )}
    </StudentLayout>
  );
}

function Entry({
  journal,
  showWeek = false,
  onEdit,
}: {
  journal: Journal;
  showWeek?: boolean;
  onEdit: () => void;
}) {
  const state = standing(journal);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div>
          {showWeek && (
            <p className="text-sm font-semibold text-slate-900">{weekLabel(journal.week_start)}</p>
          )}
          <p className="text-xs text-slate-500">Sent {formatDateTime(journal.submitted_at)}</p>
        </div>
        <StatusBadge status={state.label} tone={state.tone} />
      </div>

      {journal.review_notes && (
        <p
          className={`rounded-lg px-3 py-2.5 text-sm ${
            journal.status === "Returned"
              ? "bg-amber-50 text-amber-950 ring-1 ring-inset ring-amber-600/20"
              : "bg-slate-100 text-slate-700"
          }`}
        >
          <span className="font-semibold">
            {journal.status === "Submitted" ? "Your supervisor asked earlier:" : "Your supervisor:"}
          </span>{" "}
          {journal.review_notes}
        </p>
      )}

      <Part label="What I did">{journal.activities}</Part>
      <Part label="What I learned">{journal.learnings}</Part>
      {journal.challenges && <Part label="Difficulties I met">{journal.challenges}</Part>}

      {journal.status !== "Reviewed" && (
        <Button variant="secondary" size="sm" icon="edit" onClick={onEdit}>
          {journal.status === "Returned" ? "Edit and send again" : "Edit"}
        </Button>
      )}
    </div>
  );
}

function Part({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 whitespace-pre-line break-words text-sm text-slate-800">{children}</p>
    </div>
  );
}

function JournalDialog({
  studentId,
  week,
  journal,
  limits,
  onClose,
  onSaved,
}: {
  studentId: string;
  week: string;
  journal: Journal | null;
  limits: { min: number; max: number };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [activities, setActivities] = useState(journal?.activities || "");
  const [learnings, setLearnings] = useState(journal?.learnings || "");
  const [challenges, setChallenges] = useState(journal?.challenges || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // A new entry is kept as it is typed; an edit starts from what was sent.
  const draft = journal ? null : week;
  const clearActivities = useDraft("student", draft && `journal-did:${draft}`, activities, setActivities);
  const clearLearnings = useDraft("student", draft && `journal-learned:${draft}`, learnings, setLearnings);
  const clearChallenges = useDraft("student", draft && `journal-hard:${draft}`, challenges, setChallenges);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (activities.trim().length < limits.min) {
      return setError(`Say a little more about what you did (at least ${limits.min} characters).`);
    }
    if (learnings.trim().length < limits.min) {
      return setError(`Say a little more about what you learned (at least ${limits.min} characters).`);
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `${API_URL}/api/journals/student/${encodeURIComponent(studentId)}/${week}`,
        withStudentAuth({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activities, learnings, challenges }),
        })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "The journal could not be saved.");
      clearActivities();
      clearLearnings();
      clearChallenges();
      toast.success(
        journal?.status === "Returned"
          ? "Journal sent to your supervisor again."
          : journal
            ? "Journal updated."
            : "Journal sent to your supervisor."
      );
      onSaved();
    } catch (saveError) {
      setError(errorText(saveError, "The journal could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const field = (
    id: string,
    label: string,
    hint: string,
    value: string,
    onChange: (text: string) => void,
    required: boolean
  ) => (
    <FormField label={label} htmlFor={id} hint={hint}>
      <textarea
        id={id}
        rows={4}
        required={required}
        maxLength={limits.max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field resize-none"
      />
    </FormField>
  );

  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title={journal ? "Edit journal" : "Write journal"}
      description={`Week of ${weekLabel(week)}`}
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="journal-form" busy={saving} failed={Boolean(error)}>
            {saving ? "Sending" : journal?.status === "Returned" ? "Send again" : journal ? "Save changes" : "Send to supervisor"}
          </Button>
        </>
      }
    >
      <form id="journal-form" onSubmit={submit} className="space-y-4">
        {journal?.status === "Returned" && journal.review_notes && (
          <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-950 ring-1 ring-inset ring-amber-600/20">
            <span className="font-semibold">Your supervisor:</span> {journal.review_notes}
          </p>
        )}
        {field(
          "journal-activities",
          "What I did this week",
          "The tasks you worked on and what you finished.",
          activities,
          setActivities,
          true
        )}
        {field(
          "journal-learnings",
          "What I learned",
          "A skill, a tool, or how the company does something.",
          learnings,
          setLearnings,
          true
        )}
        {field(
          "journal-challenges",
          "Difficulties I met (optional)",
          "Anything that slowed you down, and how you dealt with it.",
          challenges,
          setChallenges,
          false
        )}
        <FormError message={error} />
      </form>
    </Modal>
  );
}
