import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  ConfirmDialog,
  ErrorNotice,
  FormError,
  FormField,
  SkeletonRows,
} from "../../components/ui";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";

type Account = { id: string; name: string; detail: string };

type StudentRow = { student_id: string; name: string; email: string };
type SupervisorRow = { supervisor_id: string; name: string; email: string };

function plural(total: number, noun: string): string {
  return `${total} ${noun}${total === 1 ? "" : "s"}`;
}

/** A checklist of accounts with one box that selects or clears them all. */
function AccountPicker({
  label,
  accounts,
  picked,
  onChange,
}: {
  label: string;
  accounts: Account[];
  picked: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const allRef = useRef<HTMLInputElement>(null);
  const all = accounts.length > 0 && picked.size === accounts.length;

  useEffect(() => {
    if (allRef.current) {
      allRef.current.indeterminate = picked.size > 0 && !all;
    }
  }, [picked, all]);

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  return (
    <div className="min-w-0">
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          ref={allRef}
          type="checkbox"
          checked={all}
          disabled={accounts.length === 0}
          onChange={() => onChange(all ? new Set() : new Set(accounts.map((account) => account.id)))}
          className="h-4 w-4 rounded border-slate-300 accent-red-600"
        />
        All {label} ({accounts.length})
      </label>
      <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200">
        {accounts.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-500">No {label} accounts.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {accounts.map((account) => (
              <li key={account.id}>
                <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={picked.has(account.id)}
                    onChange={() => toggle(account.id)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-red-600"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-900">{account.name}</span>
                    <span className="block truncate text-xs text-slate-500">{account.detail}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * The "Delete test accounts" card on the coordinator's profile. A trial-phase
 * tool for clearing accounts between test runs; remove it, and the
 * /api/coordinator/accounts/wipe route, before real use.
 */
export default function AccountWipe() {
  const [students, setStudents] = useState<Account[]>([]);
  const [supervisors, setSupervisors] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [pickedStudents, setPickedStudents] = useState<Set<string>>(new Set());
  const [pickedSupervisors, setPickedSupervisors] = useState<Set<string>>(new Set());

  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [studentData, supervisorData] = await Promise.all([
        coordinatorRequest<{ students: StudentRow[] }>("/api/coordinator/students"),
        coordinatorRequest<{ supervisors: SupervisorRow[] }>("/api/coordinator/supervisors"),
      ]);
      setStudents(
        studentData.students.map((row) => ({
          id: row.student_id,
          name: row.name,
          detail: `${row.student_id} · ${row.email}`,
        }))
      );
      setSupervisors(
        supervisorData.supervisors.map((row) => ({
          id: row.supervisor_id,
          name: row.name,
          detail: `${row.supervisor_id} · ${row.email}`,
        }))
      );
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the accounts."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const total = pickedStudents.size + pickedSupervisors.size;
  const selection = [
    pickedStudents.size > 0 ? plural(pickedStudents.size, "student") : "",
    pickedSupervisors.size > 0 ? plural(pickedSupervisors.size, "supervisor") : "",
  ]
    .filter(Boolean)
    .join(" and ");

  const closeConfirm = () => {
    setConfirming(false);
    setPassword("");
    setFormError("");
  };

  const wipe = async () => {
    if (!password) return setFormError("Enter your password to confirm.");
    setDeleting(true);
    setFormError("");
    try {
      const data = await coordinatorRequest<{ message: string }>("/api/coordinator/accounts/wipe", {
        method: "POST",
        body: {
          student_ids: [...pickedStudents],
          supervisor_ids: [...pickedSupervisors],
          password,
        },
      });
      toast.success(data.message);
      setPickedStudents(new Set());
      setPickedSupervisors(new Set());
      closeConfirm();
      await load();
    } catch (wipeError) {
      setFormError(errorText(wipeError, "The accounts could not be deleted."));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <div className="p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-red-700">Delete test accounts</h2>
        <p className="mt-1 text-sm text-slate-500">
          For the trial phase. Deleting an account also removes everything it recorded and every
          file it uploaded. This cannot be undone.
        </p>

        {error ? (
          <div className="mt-4">
            <ErrorNotice message={error} onRetry={() => void load()} />
          </div>
        ) : loading ? (
          <div className="mt-4">
            <SkeletonRows rows={3} />
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <AccountPicker
              label="students"
              accounts={students}
              picked={pickedStudents}
              onChange={setPickedStudents}
            />
            <AccountPicker
              label="supervisors"
              accounts={supervisors}
              picked={pickedSupervisors}
              onChange={setPickedSupervisors}
            />
          </div>
        )}

        <Button
          variant="danger"
          icon="trash"
          disabled={total === 0}
          onClick={() => setConfirming(true)}
          className="mt-4"
        >
          {total === 0 ? "Delete selected" : `Delete ${selection}`}
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        title={`Delete ${selection}?`}
        message="Their attendance, tasks, documents, evaluations, reports, notifications and uploaded files are deleted with them. Work a deleted supervisor reviewed for a remaining student goes back to Pending."
        confirmLabel={deleting ? "Deleting" : "Delete permanently"}
        tone="danger"
        busy={deleting}
        onConfirm={() => void wipe()}
        onCancel={closeConfirm}
      >
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void wipe();
          }}
        >
          <FormField label="Your password" htmlFor="wipe-password">
            <input
              id="wipe-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              disabled={deleting}
              onChange={(event) => setPassword(event.target.value)}
              className="field"
            />
          </FormField>
          <div className="mt-3">
            <FormError message={formError} />
          </div>
        </form>
      </ConfirmDialog>
    </Card>
  );
}
