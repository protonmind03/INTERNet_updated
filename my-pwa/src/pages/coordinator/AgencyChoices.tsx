import { useCallback, useEffect, useState } from "react";
import { Button, Card, CardHeader, ConfirmDialog, ErrorNotice, FormError, FormField, SkeletonRows, StatusBadge } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";

/*
| Phase 2.2: students rank agencies while a term's choice window is open;
| here the coordinator opens the window, sees demand against slots, and
| assigns. Assigning checks the slots and approval like any placement, and
| the student is told.
*/

type Term = { id: number; name: string; is_closed: boolean };
type WindowState = "none" | "not_yet" | "open" | "closed";
type Board = {
  term: { id: number; name: string; window: { opens_at: string | null; closes_at: string | null; state: WindowState } };
  companies: { id: number; name: string; slots: number | null; placed: number; first_choice: number; any_choice: number }[];
  students: { student_id: string; name: string; program: string | null; company: string | null; company_id: number | null; choices: { rank: number; company_id: number; name: string }[] }[];
  unassigned: number;
};

const STATE_WORDS: Record<WindowState, string> = {
  none: "No choice window",
  not_yet: "Opens later",
  open: "Open",
  closed: "Closed",
};

/** An ISO time as a datetime-local value, in this device's time. */
const localValue = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function AgencyChoices({ onAssigned }: { onAssigned: () => void }) {
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [termId, setTermId] = useState("");
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ opens: string; closes: string } | null>(null);
  const [assigning, setAssigning] = useState<{ student: Board["students"][number]; company: { id: number; name: string } } | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void coordinatorRequest<{ terms: Term[] }>("/api/coordinator/terms")
      .then((data) => {
        const open = data.terms.filter((term) => !term.is_closed);
        setTerms(open);
        if (open[0]) setTermId(String(open[0].id));
      })
      .catch(() => setTerms([]));
  }, []);

  const load = useCallback(async () => {
    if (!termId) return;
    try {
      setBoard(await coordinatorRequest<Board>(`/api/coordinator/company-choices?term_id=${encodeURIComponent(termId)}`));
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "The choices could not be loaded."));
    }
  }, [termId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  if (terms === null || terms.length === 0) return null;

  const saveWindow = async (value: { opens: string; closes: string } | null) => {
    setBusy(true);
    setDialogError("");
    try {
      const data = await coordinatorRequest<{ message: string }>(`/api/coordinator/terms/${termId}/choice-window`, {
        method: "PUT",
        body: value ? { opens_at: new Date(value.opens).toISOString(), closes_at: new Date(value.closes).toISOString() } : { opens_at: null, closes_at: null },
      });
      toast.success(data.message);
      setEditing(null);
      await load();
    } catch (saveError) {
      setDialogError(errorText(saveError, "The window could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  const assign = async () => {
    if (!assigning) return;
    setBusy(true);
    setDialogError("");
    try {
      const data = await coordinatorRequest<{ message: string }>(`/api/coordinator/students/${encodeURIComponent(assigning.student.student_id)}/assign-company`, {
        method: "POST",
        body: { company_id: assigning.company.id },
      });
      toast.success(data.message);
      setAssigning(null);
      await load();
      onAssigned();
    } catch (assignError) {
      setDialogError(errorText(assignError, "The student could not be assigned."));
    } finally {
      setBusy(false);
    }
  };

  const span = board?.term.window;
  const waiting = (board?.students ?? []).filter((student) => student.company_id === null);
  const placedCount = (board?.students.length ?? 0) - waiting.length;

  return (
    <Card>
      <CardHeader icon="building" title="Agency choices" description="Students rank up to three agencies while the window is open. You assign them." />
      <div className="space-y-4 px-4 pb-5 pt-3 sm:px-5">
        <div className="flex flex-wrap items-end gap-3">
          <FormField label="Term" htmlFor="choice-term">
            <select id="choice-term" className="field min-h-11" value={termId} onChange={(event) => setTermId(event.target.value)}>
              {terms.map((term) => (
                <option key={term.id} value={term.id}>{term.name}</option>
              ))}
            </select>
          </FormField>
          {span && (
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <StatusBadge status={STATE_WORDS[span.state]} tone={span.state === "open" ? "good" : "neutral"} />
              {span.opens_at && (
                <span className="text-sm text-slate-600">
                  {formatDateTime(span.opens_at)} to {formatDateTime(span.closes_at)}
                </span>
              )}
            </div>
          )}
        </div>
        {span && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditing({ opens: localValue(span.opens_at), closes: localValue(span.closes_at) })}>
              {span.state === "none" ? "Open a choice window" : "Change the window"}
            </Button>
            {span.state !== "none" && (
              <Button variant="secondary" disabled={busy} onClick={() => void saveWindow(null)}>
                Remove the window
              </Button>
            )}
          </div>
        )}

        {error ? (
          <ErrorNotice message={error} onRetry={() => void load()} />
        ) : board === null ? (
          <SkeletonRows rows={2} />
        ) : (
          <>
            {board.companies.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Demand against slots</h3>
                <ul className="mt-2 divide-y divide-slate-100 text-sm">
                  {board.companies.map((company) => {
                    const over = company.slots !== null && company.first_choice > company.slots - company.placed;
                    return (
                      <li key={company.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span className="min-w-0 font-medium text-slate-900">{company.name}</span>
                        <span className="flex flex-wrap items-center gap-2 text-slate-600">
                          {company.first_choice} first, {company.any_choice} in all,{" "}
                          {company.slots === null ? `${company.placed} placed, no slot limit` : `${company.placed} of ${company.slots} slots filled`}
                          {over && <StatusBadge status="More first choices than slots" tone="waiting" />}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Waiting for an agency ({waiting.length}){placedCount > 0 ? `, ${placedCount} assigned` : ""}
              </h3>
              {waiting.length === 0 ? (
                <p className="mt-1 text-sm text-slate-600">Every student in this term has an agency.</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100">
                  {waiting.map((student) => (
                    <li key={student.student_id} className="py-3">
                      <p className="text-sm font-medium text-slate-900">
                        {student.name} <span className="font-normal text-slate-500">{student.student_id}{student.program ? `, ${student.program}` : ""}</span>
                      </p>
                      {student.choices.length === 0 ? (
                        <p className="mt-0.5 text-sm text-slate-600">No choices yet.</p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {student.choices.map((choice) => (
                            <Button key={choice.rank} variant="secondary" onClick={() => setAssigning({ student, company: { id: choice.company_id, name: choice.name } })}>
                              {choice.rank}. {choice.name}
                              <span className="sr-only">: assign {student.name} here</span>
                            </Button>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={editing !== null}
        title="Choice window"
        message="Students in this term can rank agencies between these times."
        confirmLabel="Save the window"
        busy={busy}
        onConfirm={() => {
          if (!editing?.opens || !editing.closes) {
            setDialogError("Give when the window opens and when it closes.");
            return;
          }
          void saveWindow(editing);
        }}
        onCancel={() => {
          setEditing(null);
          setDialogError("");
        }}
      >
        {editing && (
          <div className="space-y-3">
            <FormField label="Opens" htmlFor="choice-opens">
              <input id="choice-opens" type="datetime-local" className="field min-h-11" value={editing.opens} onChange={(event) => setEditing({ ...editing, opens: event.target.value })} />
            </FormField>
            <FormField label="Closes" htmlFor="choice-closes">
              <input id="choice-closes" type="datetime-local" className="field min-h-11" value={editing.closes} onChange={(event) => setEditing({ ...editing, closes: event.target.value })} />
            </FormField>
            <FormError message={dialogError} />
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={assigning !== null}
        title={assigning ? `Assign ${assigning.student.name} to ${assigning.company.name}?` : ""}
        message="The slots are checked, and the student is told."
        confirmLabel="Assign"
        busy={busy}
        onConfirm={() => void assign()}
        onCancel={() => {
          setAssigning(null);
          setDialogError("");
        }}
      >
        <FormError message={dialogError} />
      </ConfirmDialog>
    </Card>
  );
}
