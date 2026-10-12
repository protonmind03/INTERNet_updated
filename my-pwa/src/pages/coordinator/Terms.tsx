import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorNotice,
  FormError,
  FormField,
  Modal,
  RowMenu,
  SkeletonRows,
  StatusBadge,
  type RowMenuItem,
} from "../../components/ui";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { formatDate, localDateKey } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";
import TermSetup from "./TermSetup";

/*
|--------------------------------------------------------------------------
| TERMS
|--------------------------------------------------------------------------
|
| One row per batch of interns. Closing a term deactivates its students
| together and keeps every record; reopening it reactivates those same
| students. Nothing here deletes anything.
|
*/

type Term = {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  closed_at: string | null;
  students: number;
  active_students: number;
  deactivated_on_close: number;
};

/** Days after its start for which a term still shows its setup checklist. */
const SETUP_SHOWN_FOR_DAYS = 30;

/** True for a term that has not started, or started within the last month, and is not closed. */
function settingUp(term: Term): boolean {
  if (term.is_closed) return false;
  const limit = new Date();
  limit.setDate(limit.getDate() - SETUP_SHOWN_FOR_DAYS);
  return term.start_date >= localDateKey(limit);
}

function standing(term: Term): { label: string; tone: "good" | "waiting" | "neutral" | "info" } {
  if (term.is_closed) return { label: "Closed", tone: "neutral" };
  const today = localDateKey(new Date());
  if (today < term.start_date) return { label: "Not started", tone: "info" };
  if (today > term.end_date) return { label: "Ended, not closed", tone: "waiting" };
  return { label: "Running", tone: "good" };
}

export default function CoordinatorTerms() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [unassigned, setUnassigned] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Term | "new" | null>(null);
  const [closing, setClosing] = useState<Term | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await coordinatorRequest<{ terms: Term[]; unassigned_active_students: number }>(
        "/api/coordinator/terms"
      );
      setTerms(data.terms || []);
      setUnassigned(data.unassigned_active_students || 0);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the terms."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const act = async (path: string, body: unknown, fallback: string) => {
    setBusy(true);
    try {
      const data = await coordinatorRequest<{ message: string }>(path, { method: "POST", body });
      toast.success(data.message);
      await load();
      return true;
    } catch (actError) {
      toast.error(errorText(actError, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Of the terms still being set up, the one that starts soonest: its checklist is the one shown open.
  const nextUp = terms.filter(settingUp).sort((a, b) => a.start_date.localeCompare(b.start_date))[0];

  const menuFor = (term: Term): RowMenuItem[] => {
    const items: RowMenuItem[] = [{ label: "Edit", icon: "edit", onSelect: () => setEditing(term) }];
    if (!term.is_closed && unassigned > 0) {
      items.push({
        label: `Add the ${unassigned} student${unassigned === 1 ? "" : "s"} with no term`,
        icon: "users",
        onSelect: () =>
          void act(
            `/api/coordinator/terms/${term.id}/students`,
            { unassigned: true },
            "The students could not be added."
          ),
      });
    }
    items.push(
      term.is_closed
        ? {
            label: "Reopen term",
            icon: "refresh",
            tone: "good",
            onSelect: () =>
              void act(`/api/coordinator/terms/${term.id}/reopen`, {}, "The term could not be reopened."),
          }
        : { label: "Close term", icon: "lock", tone: "danger", onSelect: () => setClosing(term) }
    );
    return items;
  };

  return (
    <CoordinatorLayout
      title="Terms"
      subtitle="Group each batch of interns by term, and close a term when it is over."
      actions={
        <Button icon="plus" onClick={() => setEditing("new")}>
          Add term
        </Button>
      }
    >
      <div className="space-y-6">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        {!loading && unassigned > 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {unassigned} active student{unassigned === 1 ? " has" : "s have"} no term. Use a term's
            menu to add them, or{" "}
            <Link to="/coordinator/students?term=none" className="font-semibold underline">
              see who they are
            </Link>
            .
          </p>
        )}

        <Card>
          {loading ? (
            <SkeletonRows rows={3} />
          ) : terms.length === 0 ? (
            <EmptyState
              icon="calendar"
              title="No terms yet"
              description="Add the current term. Students registered while it runs join it by themselves."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {terms.map((term) => (
                <li key={term.id} className="flex items-start justify-between gap-3 px-4 py-4 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                      {term.name}
                      <StatusBadge status={standing(term).label} tone={standing(term).tone} />
                    </p>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {formatDate(term.start_date)} to {formatDate(term.end_date)}
                    </p>
                    <p className="tabular mt-1 text-xs text-slate-500">
                      <Link
                        to={`/coordinator/students?term=${term.id}`}
                        className="font-medium text-psu-700 hover:underline"
                      >
                        {term.students} student{term.students === 1 ? "" : "s"}
                      </Link>
                      {" · "}
                      {term.active_students} active
                      {term.is_closed && term.closed_at
                        ? ` · closed ${formatDate(term.closed_at)}`
                        : ""}
                    </p>
                    {settingUp(term) && (
                      <TermSetup termId={term.id} termName={term.name} startsOpen={term.id === nextUp?.id} />
                    )}
                  </div>
                  <RowMenu label={`Actions for ${term.name}`} items={menuFor(term)} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {editing && (
        <TermDialog
          term={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      <ConfirmDialog
        open={closing !== null}
        title={closing ? `Close ${closing.name}?` : ""}
        message={
          closing
            ? `Its ${closing.active_students} active student${
                closing.active_students === 1 ? "" : "s"
              } will be deactivated and can no longer sign in. Every attendance log, task and document is kept, and you can reopen the term to undo this.`
            : ""
        }
        confirmLabel="Close term"
        tone="danger"
        busy={busy}
        onCancel={() => setClosing(null)}
        onConfirm={async () => {
          if (!closing) return;
          const done = await act(
            `/api/coordinator/terms/${closing.id}/close`,
            {},
            "The term could not be closed."
          );
          if (done) setClosing(null);
        }}
      />
    </CoordinatorLayout>
  );
}

function TermDialog({
  term,
  onClose,
  onSaved,
}: {
  term: Term | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(term?.name || "");
  const [start, setStart] = useState(term?.start_date || "");
  const [end, setEnd] = useState(term?.end_date || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) return setError("Give the term a name.");
    if (!start || !end) return setError("Choose when the term starts and ends.");
    if (end < start) return setError("The term cannot end before it starts.");
    setSaving(true);
    setError("");
    try {
      const data = await coordinatorRequest<{ message: string }>(
        term ? `/api/coordinator/terms/${term.id}` : "/api/coordinator/terms",
        { method: term ? "PUT" : "POST", body: { name, start_date: start, end_date: end } }
      );
      toast.success(data.message);
      onSaved();
    } catch (saveError) {
      setError(errorText(saveError, "The term could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title={term ? "Edit term" : "Add term"}
      description={
        term ? undefined : "For example, 2nd Semester 2026-2027, with the dates the OJT runs."
      }
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="term-form" busy={saving} failed={Boolean(error)}>
            {saving ? "Saving" : term ? "Save changes" : "Add term"}
          </Button>
        </>
      }
    >
      <form id="term-form" onSubmit={submit} className="space-y-4">
        <FormField label="Term name" htmlFor="term-name">
          <input
            id="term-name"
            type="text"
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="field"
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Starts" htmlFor="term-start">
            <input
              id="term-start"
              type="date"
              required
              value={start}
              onChange={(event) => setStart(event.target.value)}
              className="field"
            />
          </FormField>
          <FormField label="Ends" htmlFor="term-end">
            <input
              id="term-end"
              type="date"
              required
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              className="field"
            />
          </FormField>
        </div>
        <FormError message={error} />
      </form>
    </Modal>
  );
}
