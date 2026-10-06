import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Icon from "../../components/Icon";
import Pagination from "../../components/Pagination";
import {
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorNotice,
  FormError,
  FormField,
  Modal,
  RowMenu,
  SearchField,
  SkeletonRows,
  StatusBadge,
} from "../../components/ui";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { PASSWORD_POLICY_HINT, passwordPolicyError } from "../../lib/api";
import { errorText, toast } from "../../lib/toast";
import { usePagination } from "../../lib/usePagination";
import { coordinatorRequest } from "./request";
import ResetPassword from "./ResetPassword";

type Supervisor = {
  supervisor_id: string;
  email: string;
  name: string;
  company: string | null;
  department: string | null;
  is_active: boolean;
  intern_count: number;
};

const EMPTY_FORM = {
  supervisor_id: "",
  email: "",
  password: "",
  name: "",
  company: "",
  department: "",
};

export default function CoordinatorSupervisors() {
  const [searchParams] = useSearchParams();

  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(() => searchParams.get("q") || "");

  const [editing, setEditing] = useState<Supervisor | "new" | null>(null);
  const [toggling, setToggling] = useState<Supervisor | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  // The supervisor whose interns are being moved to someone else.
  const [moving, setMoving] = useState<Supervisor | null>(null);
  const pager = usePagination(supervisors, 20);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    try {
      const data = await coordinatorRequest<{ supervisors: Supervisor[] }>(
        `/api/coordinator/supervisors?${params.toString()}`
      );
      setSupervisors(data.supervisors || []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load supervisors."));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const toggle = async () => {
    if (!toggling) return;
    setToggleBusy(true);
    try {
      await coordinatorRequest(
        `/api/coordinator/supervisors/${encodeURIComponent(toggling.supervisor_id)}/status`,
        { method: "PATCH", body: { is_active: !toggling.is_active } }
      );
      toast.success(
        toggling.is_active
          ? `${toggling.name}'s account is deactivated.`
          : `${toggling.name}'s account is active again.`
      );
      setToggling(null);
      await load();
    } catch (toggleError) {
      toast.error(errorText(toggleError, "The account could not be updated."));
    } finally {
      setToggleBusy(false);
    }
  };

  const filtered = search.trim() !== "";
  const internsOf = (supervisor: Supervisor) => Number(supervisor.intern_count) || 0;

  return (
    <CoordinatorLayout
      title="Supervisors"
      subtitle="Company staff who verify attendance, assign tasks and evaluate interns."
      actions={
        <Button icon="plus" onClick={() => setEditing("new")}>
          Register supervisor
        </Button>
      }
    >
      <div className="space-y-5">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <Card>
          <div className="border-b border-slate-100 p-4 sm:p-5">
            <SearchField
              value={search}
              onChange={setSearch}
              label="Search supervisors"
              placeholder="Search name, email or company"
              className="w-full sm:w-80"
            />
          </div>

          {loading ? (
            <SkeletonRows rows={5} />
          ) : supervisors.length === 0 ? (
            <EmptyState
              icon={filtered ? "search" : "briefcase"}
              title={filtered ? "No supervisors match" : "No supervisors registered yet"}
              description={
                filtered
                  ? undefined
                  : "Register a supervisor first, then assign students to them."
              }
              action={
                filtered ? undefined : (
                  <Button icon="plus" onClick={() => setEditing("new")}>
                    Register supervisor
                  </Button>
                )
              }
            />
          ) : (
            <>
              <ul className="divide-y divide-slate-100 lg:hidden">
                {pager.pageItems.map((supervisor) => (
                  <li key={supervisor.supervisor_id} className="px-4 py-4">
                    <div className="flex items-start gap-3">
                      <Avatar name={supervisor.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {supervisor.name}
                          </p>
                          <StatusBadge
                            status={supervisor.is_active ? "Active" : "Deactivated"}
                            tone={supervisor.is_active ? "good" : "neutral"}
                          />
                        </div>
                        <p className="truncate text-xs text-slate-500">{supervisor.email}</p>
                        <p className="mt-1.5 text-sm text-slate-600">
                          {[supervisor.company, supervisor.department].filter(Boolean).join(" · ") ||
                            "No company set"}
                        </p>
                        <p className="text-sm text-slate-600">
                          {internsOf(supervisor)} {internsOf(supervisor) === 1 ? "intern" : "interns"}
                        </p>
                        <RowActions
                          supervisor={supervisor}
                          onEdit={() => setEditing(supervisor)}
                          onToggle={() => setToggling(supervisor)}
                          onMove={() => setMoving(supervisor)}
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="table-head border-b border-slate-100 text-xs text-slate-500">
                      <th scope="col" className="px-5 py-3 font-medium">Supervisor</th>
                      <th scope="col" className="px-3 py-3 font-medium">Company</th>
                      <th scope="col" className="px-3 py-3 font-medium">Department</th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">Interns</th>
                      <th scope="col" className="px-3 py-3 font-medium">Status</th>
                      <th scope="col" className="px-5 py-3 font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pager.pageItems.map((supervisor) => (
                      <tr key={supervisor.supervisor_id} className="hover:bg-slate-50">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={supervisor.name} size="sm" />
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900">{supervisor.name}</p>
                              <p className="text-xs text-slate-500">
                                {supervisor.supervisor_id} · {supervisor.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-700">{supervisor.company || "—"}</td>
                        <td className="px-3 py-3 text-slate-700">
                          {supervisor.department || "—"}
                        </td>
                        <td className="tabular px-3 py-3 text-right text-slate-700">
                          {internsOf(supervisor)}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge
                            status={supervisor.is_active ? "Active" : "Deactivated"}
                            tone={supervisor.is_active ? "good" : "neutral"}
                          />
                        </td>
                        <td className="px-5 py-3">
                          <RowActions
                            supervisor={supervisor}
                            compact
                            onEdit={() => setEditing(supervisor)}
                            onToggle={() => setToggling(supervisor)}
                            onMove={() => setMoving(supervisor)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination state={pager} noun="supervisor" />
            </>
          )}
        </Card>
      </div>

      <SupervisorDialog
        key={editing === "new" ? "new" : editing?.supervisor_id ?? "closed"}
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />

      {/* A supervisor who still has interns must hand them over first. */}
      <ConfirmDialog
        open={toggling !== null && toggling.is_active && internsOf(toggling) > 0}
        title={`Move ${toggling?.name}'s interns first`}
        message={
          toggling
            ? `${toggling.name} still has ${internsOf(toggling)} active ${
                internsOf(toggling) === 1 ? "intern" : "interns"
              }. Their work needs a reviewer, so move them to another supervisor before deactivating this account.`
            : undefined
        }
        confirmLabel="Move interns"
        onConfirm={() => {
          setMoving(toggling);
          setToggling(null);
        }}
        onCancel={() => setToggling(null)}
      />

      <ConfirmDialog
        open={toggling !== null && !(toggling.is_active && internsOf(toggling) > 0)}
        title={
          toggling?.is_active
            ? `Deactivate ${toggling.name}'s account?`
            : `Reactivate ${toggling?.name}'s account?`
        }
        message={
          toggling?.is_active
            ? "They will not be able to sign in. You can reactivate the account at any time."
            : "They will be able to sign in again with their existing password."
        }
        confirmLabel={toggling?.is_active ? "Deactivate" : "Reactivate"}
        tone={toggling?.is_active ? "danger" : "primary"}
        busy={toggleBusy}
        onConfirm={() => void toggle()}
        onCancel={() => setToggling(null)}
      />

      {moving && (
        <MoveInternsDialog
          key={moving.supervisor_id}
          from={moving}
          count={internsOf(moving)}
          others={supervisors.filter(
            (item) => item.is_active && item.supervisor_id !== moving.supervisor_id
          )}
          onClose={() => setMoving(null)}
          onMoved={() => {
            setMoving(null);
            void load();
          }}
        />
      )}
    </CoordinatorLayout>
  );
}

function RowActions({
  supervisor,
  compact = false,
  onEdit,
  onToggle,
  onMove,
}: {
  supervisor: Supervisor;
  compact?: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onMove: () => void;
}) {
  const base =
    "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium hover:bg-slate-100";
  return (
    <div className={`flex gap-1 ${compact ? "flex-nowrap justify-end whitespace-nowrap" : "mt-3 -ml-2 flex-wrap"}`}>
      <button type="button" onClick={onEdit} className={`${base} text-psu-700`}>
        <Icon name="edit" size={15} />
        Edit
      </button>
      <RowMenu
        label={`More actions for ${supervisor.name}`}
        items={[
          ...(Number(supervisor.intern_count) > 0
            ? [{ label: "Move interns", icon: "users" as const, onSelect: onMove }]
            : []),
          supervisor.is_active
            ? {
                label: "Deactivate account",
                icon: "close" as const,
                tone: "danger" as const,
                onSelect: onToggle,
              }
            : {
                label: "Reactivate account",
                icon: "refresh" as const,
                tone: "good" as const,
                onSelect: onToggle,
              },
        ]}
      />
    </div>
  );
}

/** Moves every active intern of one supervisor to another in one step. */
function MoveInternsDialog({
  from,
  count,
  others,
  onClose,
  onMoved,
}: {
  from: Supervisor;
  count: number;
  others: Supervisor[];
  onClose: () => void;
  onMoved: () => void;
}) {
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const move = async () => {
    if (!to) return setError("Choose the supervisor who will take them.");
    setBusy(true);
    setError("");
    try {
      const data = await coordinatorRequest<{ message: string }>(
        `/api/coordinator/supervisors/${encodeURIComponent(from.supervisor_id)}/reassign`,
        { method: "POST", body: { to } }
      );
      toast.success(`${data.message} Everyone involved has been notified.`);
      onMoved();
    } catch (moveError) {
      setError(errorText(moveError, "The interns could not be moved."));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={`Move ${from.name}'s interns`}
      description={`${count} active ${count === 1 ? "intern" : "interns"} will be reassigned together.`}
      locked={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void move()} busy={busy} failed={Boolean(error)} disabled={others.length === 0}>
            {busy ? "Moving" : `Move ${count} ${count === 1 ? "intern" : "interns"}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {others.length === 0 ? (
          <p className="text-sm text-slate-600">
            There is no other active supervisor to move them to. Register one first.
          </p>
        ) : (
          <FormField label="New supervisor" htmlFor="move-target">
            <select
              id="move-target"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="field"
            >
              <option value="">Choose a supervisor</option>
              {others.map((item) => (
                <option key={item.supervisor_id} value={item.supervisor_id}>
                  {item.name}
                  {item.company ? ` · ${item.company}` : ""}
                </option>
              ))}
            </select>
          </FormField>
        )}
        <p className="text-sm text-slate-600">
          Their attendance, tasks and documents move with them, and the new supervisor reviews
          anything still waiting.
        </p>
        <FormError message={error} />
      </div>
    </Modal>
  );
}

function SupervisorDialog({
  target,
  onClose,
  onSaved,
}: {
  target: Supervisor | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = target && target !== "new" ? target : null;
  const [form, setForm] = useState(() =>
    existing
      ? {
          supervisor_id: existing.supervisor_id,
          email: existing.email,
          password: "",
          name: existing.name,
          company: existing.company || "",
          department: existing.department || "",
        }
      : EMPTY_FORM
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (field: keyof typeof EMPTY_FORM) => (value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return setError("Enter the supervisor's full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return setError("Enter a valid email address.");
    }
    if (!existing) {
      if (!form.supervisor_id.trim()) return setError("Enter a supervisor ID.");
      const policy = passwordPolicyError(form.password);
      if (policy) return setError(`Starting password: ${policy}`);
    }

    setSaving(true);
    setError("");
    try {
      const shared = {
        name: form.name.trim(),
        email: form.email.trim(),
        company: form.company.trim() || null,
        department: form.department.trim() || null,
      };
      if (existing) {
        await coordinatorRequest(
          `/api/coordinator/supervisors/${encodeURIComponent(existing.supervisor_id)}`,
          { method: "PUT", body: shared }
        );
        toast.success(`${shared.name}'s details are saved.`);
      } else {
        await coordinatorRequest("/api/coordinator/supervisors", {
          method: "POST",
          body: { ...shared, supervisor_id: form.supervisor_id.trim(), password: form.password },
        });
        toast.success(`${shared.name} is registered. Give them their starting password.`);
      }
      onSaved();
    } catch (saveError) {
      setError(errorText(saveError, "The supervisor could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={target !== null}
      onClose={() => !saving && onClose()}
      title={existing ? "Edit supervisor" : "Register a supervisor"}
      description={existing ? existing.supervisor_id : undefined}
      locked={saving}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="supervisor-form" busy={saving} failed={Boolean(error)}>
            {saving ? "Saving" : existing ? "Save changes" : "Register supervisor"}
          </Button>
        </>
      }
    >
      <form id="supervisor-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        {!existing && (
          <FormField
            label="Supervisor ID"
            htmlFor="supervisor-id"
            hint="A short code of your choosing, for example SUP-0012."
          >
            <input
              id="supervisor-id"
              type="text"
              maxLength={50}
              value={form.supervisor_id}
              onChange={(event) => set("supervisor_id")(event.target.value)}
              className="field"
            />
          </FormField>
        )}
        <FormField
          label="Full name"
          htmlFor="supervisor-name"
          className={existing ? "sm:col-span-2" : ""}
        >
          <input
            id="supervisor-name"
            type="text"
            maxLength={150}
            value={form.name}
            onChange={(event) => set("name")(event.target.value)}
            className="field"
          />
        </FormField>
        <FormField
          label="Company email"
          htmlFor="supervisor-email"
          hint="They sign in with this."
          className="sm:col-span-2"
        >
          <input
            id="supervisor-email"
            type="email"
            maxLength={150}
            value={form.email}
            onChange={(event) => set("email")(event.target.value)}
            className="field"
          />
        </FormField>
        {!existing && (
          <FormField
            label="Starting password"
            htmlFor="supervisor-password"
            hint={`${PASSWORD_POLICY_HINT} They set their own at first sign-in.`}
            className="sm:col-span-2"
          >
            <input
              id="supervisor-password"
              type="text"
              autoComplete="off"
              value={form.password}
              onChange={(event) => set("password")(event.target.value)}
              className="field font-mono"
            />
          </FormField>
        )}
        <FormField label="Company" htmlFor="supervisor-company" optional>
          <input
            id="supervisor-company"
            type="text"
            maxLength={150}
            value={form.company}
            onChange={(event) => set("company")(event.target.value)}
            className="field"
          />
        </FormField>
        <FormField label="Department" htmlFor="supervisor-department" optional>
          <input
            id="supervisor-department"
            type="text"
            maxLength={150}
            value={form.department}
            onChange={(event) => set("department")(event.target.value)}
            className="field"
          />
        </FormField>
        {existing && (
          <div className="sm:col-span-2">
            <ResetPassword
              kind="supervisors"
              accountId={existing.supervisor_id}
              name={existing.name}
            />
          </div>
        )}
        <div className="sm:col-span-2">
          <FormError message={error} />
        </div>
      </form>
    </Modal>
  );
}
