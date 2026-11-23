import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorNotice,
  FilterChips,
  FormError,
  FormField,
  Modal,
  RowMenu,
  SearchField,
  SkeletonRows,
  StatusBadge,
} from "../../components/ui";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { saveCsv } from "../../lib/csv";
import { formatDate } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import FilterBar from "./FilterBar";
import { coordinatorRequest } from "./request";
import { useStudentFilters } from "./useStudentFilters";

/*
|--------------------------------------------------------------------------
| CLEARANCE BOARD (Phase 1.2)
|--------------------------------------------------------------------------
|
| Every active student with what deployment needs (backend
| services/deploymentClearance.ts): academic eligibility, each requirement
| needed before deployment, and a company. A ready student is cleared with
| one button; one who is not can be cleared anyway, with a reason. The
| deployment gate is switched here until an OJT Director account exists.
|
*/

type ItemState = "missing" | "pending" | "approved" | "rejected";
type Eligibility = "unchecked" | "eligible" | "deficient";
type Row = {
  student_id: string;
  name: string;
  program: string | null;
  company: string | null;
  eligibility_status: Eligibility;
  eligibility_note: string | null;
  cleared_for_deployment_at: string | null;
  clearance_override_reason: string | null;
  items: { name: string; state: ItemState }[];
  missing: string[];
  ready: boolean;
  cleared: boolean;
};
type Board = {
  gate_enabled: boolean;
  students: Row[];
  counts: { students: number; cleared: number; ready: number; not_ready: number; overrides: number };
};
type Show = "all" | "ready" | "not_ready" | "cleared";

const ITEM_TONE: Record<ItemState, "good" | "waiting" | "bad" | "neutral"> = {
  approved: "good",
  pending: "waiting",
  rejected: "bad",
  missing: "neutral",
};
const ITEM_WORD: Record<ItemState, string> = { approved: "approved", pending: "pending", rejected: "rejected", missing: "missing" };
const ELIGIBILITY_WORD: Record<Eligibility, string> = { unchecked: "Not checked", eligible: "Eligible", deficient: "Deficient" };
const ELIGIBILITY_TONE: Record<Eligibility, "good" | "bad" | "neutral"> = { unchecked: "neutral", eligible: "good", deficient: "bad" };

export default function CoordinatorClearance() {
  const studentFilters = useStudentFilters();
  const chosen = studentFilters.query;
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState<Row | null>(null);
  const [overriding, setOverriding] = useState<Row | null>(null);
  const [gateChange, setGateChange] = useState(false);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      setBoard(await coordinatorRequest<Board>(`/api/coordinator/clearance${chosen ? `?${chosen}` : ""}`));
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the clearance board. Check your connection and try again."));
    }
  }, [chosen]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const rows = useMemo(() => {
    const text = search.trim().toLowerCase();
    return (board?.students ?? []).filter((row) => {
      if (show === "ready" && !(row.ready && !row.cleared)) return false;
      if (show === "not_ready" && (row.ready || row.cleared)) return false;
      if (show === "cleared" && !row.cleared) return false;
      return !text || `${row.name} ${row.student_id} ${row.program ?? ""} ${row.company ?? ""}`.toLowerCase().includes(text);
    });
  }, [board, show, search]);
  const selectable = rows.filter((row) => row.ready && !row.cleared);

  const clear = async (row: Row, overrideReason?: string) => {
    setBusy(row.student_id);
    try {
      const data = await coordinatorRequest<{ message: string }>(
        `/api/coordinator/students/${encodeURIComponent(row.student_id)}/clearance`,
        { method: "POST", body: overrideReason ? { override_reason: overrideReason } : {} }
      );
      toast.success(data.message);
      setOverriding(null);
      await load();
      return true;
    } catch (clearError) {
      toast.error(errorText(clearError, `${row.name} could not be cleared. Try again.`));
      return false;
    } finally {
      setBusy("");
    }
  };

  const takeBack = async (row: Row) => {
    setBusy(row.student_id);
    try {
      const data = await coordinatorRequest<{ message: string }>(
        `/api/coordinator/students/${encodeURIComponent(row.student_id)}/clearance`,
        { method: "DELETE" }
      );
      toast.success(`${data.message} ${row.name} cannot time in while the gate is on.`);
      await load();
    } catch (takeError) {
      toast.error(errorText(takeError, "The clearance could not be taken back. Try again."));
    } finally {
      setBusy("");
    }
  };

  const clearSelected = async () => {
    setBusy("bulk");
    try {
      const data = await coordinatorRequest<{ message: string }>("/api/coordinator/clearance/bulk", {
        method: "POST",
        body: { student_ids: [...selected] },
      });
      toast.success(data.message);
      setSelected(new Set());
      await load();
    } catch (bulkError) {
      toast.error(errorText(bulkError, "The students could not be cleared. Try again."));
    } finally {
      setBusy("");
    }
  };

  const switchGate = async () => {
    if (!board) return;
    const next = !board.gate_enabled;
    try {
      await coordinatorRequest("/api/coordinator/ojt-settings/deployment_gate_enabled", { method: "PUT", body: { value: next } });
      toast.success(next ? "Deployment gate turned on." : "Deployment gate turned off.");
      setGateChange(false);
      await load();
    } catch (gateError) {
      toast.error(errorText(gateError, "The gate could not be changed. Try again."));
    }
  };

  const exportCsv = () => {
    if (!board) return;
    const names = [...new Set(board.students.flatMap((row) => row.items.map((item) => item.name)))];
    saveCsv(
      [
        ["Student ID", "Name", "Program", "Company", "Eligibility", ...names, "Ready", "Cleared on", "Override reason"],
        ...rows.map((row) => [
          row.student_id,
          row.name,
          row.program ?? "",
          row.company ?? "",
          ELIGIBILITY_WORD[row.eligibility_status],
          ...names.map((name) => {
            const item = row.items.find((entry) => entry.name === name);
            return item ? ITEM_WORD[item.state] : "not asked";
          }),
          row.ready ? "yes" : "no",
          row.cleared_for_deployment_at ? formatDate(row.cleared_for_deployment_at) : "",
          row.clearance_override_reason ?? "",
        ]),
      ],
      "clearance-board.csv"
    );
  };

  const counts = board?.counts;
  return (
    <CoordinatorLayout
      title="Clearance"
      actions={
        <Button variant="secondary" icon="download" onClick={exportCsv} disabled={!board || rows.length === 0}>
          Export CSV
        </Button>
      }
    >
      {board && (
        <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
          <p className="min-w-0 flex-1 text-sm text-slate-800">
            <span className="font-semibold">Deployment gate: {board.gate_enabled ? "on" : "off"}.</span>{" "}
            {board.gate_enabled ? "Students who are not cleared cannot time in." : "Every student can time in, cleared or not."}{" "}
            Ready means eligible, every requirement needed before deployment approved, and a company assigned.
          </p>
          <Button variant="secondary" onClick={() => setGateChange(true)}>
            {board.gate_enabled ? "Turn the gate off" : "Turn the gate on"}
          </Button>
        </Card>
      )}

      <FilterBar state={studentFilters} />

      {error && (
        <div className="my-4">
          <ErrorNotice message={error} onRetry={() => void load()} />
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <FilterChips<Show>
          label="Which students"
          value={show}
          onChange={setShow}
          options={[
            { value: "all", label: "All", count: counts?.students },
            { value: "ready", label: "Ready", count: counts?.ready },
            { value: "not_ready", label: "Not ready", count: counts?.not_ready },
            { value: "cleared", label: "Cleared", count: counts?.cleared },
          ]}
        />
        <div className="sm:ml-auto sm:w-64">
          <SearchField value={search} onChange={setSearch} label="Search students" placeholder="Name, ID, company" />
        </div>
      </div>

      {selectable.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-11 items-center gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-400 text-psu-700"
              checked={selectable.every((row) => selected.has(row.student_id))}
              onChange={(event) =>
                setSelected(event.target.checked ? new Set(selectable.map((row) => row.student_id)) : new Set())
              }
            />
            Select every ready student ({selectable.length})
          </label>
          {selected.size > 0 && (
            <Button busy={busy === "bulk"} onClick={() => void clearSelected()}>
              {`Clear ${selected.size} for deployment`}
            </Button>
          )}
        </div>
      )}

      <Card className="mt-3">
        {!board && !error ? (
          <div className="p-4">
            <SkeletonRows rows={5} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="users"
            title={board?.students.length ? "No student matches" : "No active students yet"}
            description={
              board?.students.length ? "Change the filters or the search." : "Register students on the Students page to clear them here."
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => (
              <li key={row.student_id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start">
                <div className="flex min-w-0 items-start gap-3 lg:w-64 lg:shrink-0">
                  {row.ready && !row.cleared ? (
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.name}`}
                      className="mt-1 h-4 w-4 rounded border-slate-400 text-psu-700"
                      checked={selected.has(row.student_id)}
                      onChange={() =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (next.has(row.student_id)) next.delete(row.student_id);
                          else next.add(row.student_id);
                          return next;
                        })
                      }
                    />
                  ) : (
                    <span className="w-4 shrink-0" aria-hidden="true" />
                  )}
                  <div className="min-w-0">
                    <Link
                      to={`/coordinator/students/${encodeURIComponent(row.student_id)}`}
                      className="font-semibold text-slate-900 hover:underline"
                    >
                      {row.name}
                    </Link>
                    <p className="text-xs text-slate-600">
                      {row.student_id}
                      {row.program ? ` · ${row.program}` : ""}
                    </p>
                    <p className="text-xs text-slate-600">{row.company || "No company assigned"}</p>
                  </div>
                </div>

                <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setChecking(row)}
                    className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
                    aria-label={`Eligibility of ${row.name}: ${ELIGIBILITY_WORD[row.eligibility_status]}. Change it.`}
                  >
                    <StatusBadge status={`Eligibility: ${ELIGIBILITY_WORD[row.eligibility_status]}`} tone={ELIGIBILITY_TONE[row.eligibility_status]} />
                  </button>
                  {row.items.map((item) => (
                    <StatusBadge key={item.name} status={`${item.name}: ${ITEM_WORD[item.state]}`} tone={ITEM_TONE[item.state]} />
                  ))}
                </div>

                <div className="flex shrink-0 items-center gap-2 lg:w-56 lg:justify-end">
                  {row.cleared ? (
                    <>
                      <StatusBadge
                        status={row.clearance_override_reason ? "Cleared anyway" : "Cleared"}
                        tone={row.clearance_override_reason ? "waiting" : "good"}
                      />
                      <RowMenu
                        label={`More for ${row.name}`}
                        items={[{ label: "Take the clearance back", icon: "close", tone: "danger", onSelect: () => void takeBack(row) }]}
                      />
                    </>
                  ) : row.ready ? (
                    <Button size="sm" busy={busy === row.student_id} onClick={() => void clear(row)}>
                      Clear for deployment
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => setOverriding(row)}>
                      Clear anyway
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {checking && <EligibilityDialog key={checking.student_id} row={checking} onClose={() => setChecking(null)} onSaved={() => { setChecking(null); void load(); }} />}
      {overriding && (
        <OverrideDialog
          key={overriding.student_id}
          row={overriding}
          busy={busy === overriding.student_id}
          onClose={() => setOverriding(null)}
          onClear={(reason) => clear(overriding, reason)}
        />
      )}
      <ConfirmDialog
        open={gateChange}
        title={board?.gate_enabled ? "Turn the deployment gate off?" : "Turn the deployment gate on?"}
        message={
          board?.gate_enabled
            ? "Every student will be able to time in again, cleared or not."
            : `Students who are not cleared will not be able to time in, offline or recorded by their supervisor. ${counts ? `${counts.cleared} of ${counts.students} are cleared now.` : ""}`
        }
        confirmLabel={board?.gate_enabled ? "Turn the gate off" : "Turn the gate on"}
        onConfirm={() => void switchGate()}
        onCancel={() => setGateChange(false)}
      />
    </CoordinatorLayout>
  );
}

function EligibilityDialog({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState<Eligibility>(row.eligibility_status);
  const [note, setNote] = useState(row.eligibility_note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (status === "deficient" && !note.trim()) return setError("Say what is missing, such as a failed or incomplete subject.");
    setSaving(true);
    setError("");
    try {
      await coordinatorRequest(`/api/coordinator/students/${encodeURIComponent(row.student_id)}/eligibility`, {
        method: "PUT",
        body: { status, note: note.trim() || null },
      });
      toast.success(`${row.name}: ${ELIGIBILITY_WORD[status].toLowerCase()}.`);
      onSaved();
    } catch (saveError) {
      setError(errorText(saveError, "The eligibility could not be saved. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title={`Academic eligibility: ${row.name}`}
      description="From the student's portal record: failed or missing subjects."
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="eligibility-form" busy={saving} failed={Boolean(error)}>
            {saving ? "Saving" : "Save"}
          </Button>
        </>
      }
    >
      <form id="eligibility-form" onSubmit={save} className="space-y-4" noValidate>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-900">Result</legend>
          {(["eligible", "deficient", "unchecked"] as Eligibility[]).map((value) => (
            <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 hover:bg-slate-50">
              <input type="radio" name="eligibility" checked={status === value} onChange={() => setStatus(value)} className="h-4 w-4 border-slate-400 text-psu-700" />
              <span className="text-sm text-slate-900">{ELIGIBILITY_WORD[value]}</span>
            </label>
          ))}
        </fieldset>
        <FormField label="What the check found" htmlFor="eligibility-note" optional={status !== "deficient"}>
          <textarea id="eligibility-note" rows={3} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} className="field" />
        </FormField>
        <FormError message={error} />
      </form>
    </Modal>
  );
}

function OverrideDialog({
  row,
  busy,
  onClose,
  onClear,
}: {
  row: Row;
  busy: boolean;
  onClose: () => void;
  onClear: (reason: string) => Promise<boolean>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (reason.trim().length < 10) return setError("Give a reason of at least 10 characters. It is kept in the audit log.");
    setError("");
    await onClear(reason.trim());
  };

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={`Clear ${row.name} anyway?`}
      description={`Not ready: ${row.missing.join(", ")}.`}
      locked={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="override-form" busy={busy} failed={Boolean(error)}>
            Clear anyway
          </Button>
        </>
      }
    >
      <form id="override-form" onSubmit={submit} className="space-y-3" noValidate>
        <FormField label="Why clear them now?" htmlFor="override-reason" hint="At least 10 characters. The OJT office can read it.">
          <textarea id="override-reason" rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className="field" />
        </FormField>
        <FormError message={error} />
      </form>
    </Modal>
  );
}
