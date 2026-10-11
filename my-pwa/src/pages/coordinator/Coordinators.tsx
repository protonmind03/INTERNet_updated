import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  ConfirmDialog,
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
import { PASSWORD_POLICY_HINT, passwordPolicyError } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";
import ResetPassword from "./ResetPassword";

/*
|--------------------------------------------------------------------------
| COORDINATOR ACCOUNTS
|--------------------------------------------------------------------------
|
| Who can sign in as an OJT coordinator. An account can be added,
| deactivated, reactivated or given a temporary password. Nobody can
| deactivate their own account, so there is always one left; an account is
| never deleted.
|
*/

type Coordinator = {
  coordinator_id: string;
  name: string;
  email: string;
  department: string | null;
  is_active: boolean;
  created_at: string | null;
  is_self: boolean;
};

export default function Coordinators() {
  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<Coordinator | null>(null);
  const [toggling, setToggling] = useState<Coordinator | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await coordinatorRequest<{ coordinators: Coordinator[] }>(
        "/api/coordinator/coordinators"
      );
      setCoordinators(data.coordinators || []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the coordinator accounts."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const toggle = async () => {
    if (!toggling) return;
    setBusy(true);
    try {
      const data = await coordinatorRequest<{ message: string }>(
        `/api/coordinator/coordinators/${encodeURIComponent(toggling.coordinator_id)}/status`,
        { method: "PATCH", body: { is_active: !toggling.is_active } }
      );
      toast.success(data.message);
      setToggling(null);
      await load();
    } catch (toggleError) {
      toast.error(errorText(toggleError, "The account could not be updated."));
      setToggling(null);
    } finally {
      setBusy(false);
    }
  };

  const menuFor = (item: Coordinator): RowMenuItem[] => [
    { label: "Reset password", icon: "lock", onSelect: () => setResetting(item) },
    item.is_active
      ? { label: "Deactivate", icon: "close", tone: "danger", onSelect: () => setToggling(item) }
      : { label: "Reactivate", icon: "refresh", tone: "good", onSelect: () => setToggling(item) },
  ];

  return (
    <CoordinatorLayout
      title="Coordinators"
      subtitle="Who can sign in as an OJT coordinator."
      actions={
        <Button icon="plus" onClick={() => setAdding(true)}>
          Add coordinator
        </Button>
      }
    >
      <div className="space-y-5">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <Card>
          {loading ? (
            <SkeletonRows rows={2} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {coordinators.map((item) => (
                <li
                  key={item.coordinator_id}
                  className="flex items-start justify-between gap-3 px-4 py-4 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                      {item.name}
                      {item.is_self && <StatusBadge status="You" tone="info" />}
                      {!item.is_active && <StatusBadge status="Deactivated" tone="neutral" />}
                    </p>
                    <p className="break-all text-sm text-slate-600">{item.email}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {item.coordinator_id}
                      {item.department ? ` · ${item.department}` : ""}
                      {item.created_at ? ` · added ${formatDate(item.created_at)}` : ""}
                    </p>
                  </div>
                  {/* Your own account is changed from your Profile. */}
                  {!item.is_self && (
                    <RowMenu label={`Actions for ${item.name}`} items={menuFor(item)} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <p className="text-sm text-slate-500">
          You cannot deactivate your own account, so one coordinator can always sign in. To
          change your own details or password, open your Profile.
        </p>
      </div>

      {adding && (
        <AddCoordinator
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            void load();
          }}
        />
      )}

      <Modal
        open={resetting !== null}
        onClose={() => setResetting(null)}
        title="Reset password"
        description={resetting ? resetting.name : undefined}
        footer={
          <Button variant="secondary" onClick={() => setResetting(null)}>
            Close
          </Button>
        }
      >
        {resetting && (
          <ResetPassword
            key={resetting.coordinator_id}
            kind="coordinators"
            accountId={resetting.coordinator_id}
            name={resetting.name}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={toggling !== null}
        title={
          toggling
            ? `${toggling.is_active ? "Deactivate" : "Reactivate"} ${toggling.name}?`
            : ""
        }
        message={
          toggling?.is_active
            ? "They are signed out at once and can no longer sign in. Nothing they did is removed, and you can reactivate the account later."
            : "They will be able to sign in as a coordinator again."
        }
        confirmLabel={toggling?.is_active ? "Deactivate" : "Reactivate"}
        tone={toggling?.is_active ? "danger" : "primary"}
        busy={busy}
        onCancel={() => setToggling(null)}
        onConfirm={() => void toggle()}
      />
    </CoordinatorLayout>
  );
}

function AddCoordinator({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    coordinator_id: "",
    name: "",
    email: "",
    department: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.coordinator_id.trim() || !form.name.trim() || !form.email.trim()) {
      return setError("The ID, name and email are all needed.");
    }
    const policy = passwordPolicyError(form.password);
    if (policy) return setError(`Starting password: ${policy}`);
    setSaving(true);
    setError("");
    try {
      const data = await coordinatorRequest<{ message: string }>("/api/coordinator/coordinators", {
        method: "POST",
        body: form,
      });
      toast.success(data.message);
      onSaved();
    } catch (saveError) {
      setError(errorText(saveError, "The account could not be created."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title="Add coordinator"
      description="They will have the same access as you."
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="coordinator-form" busy={saving} failed={Boolean(error)}>
            {saving ? "Saving" : "Add coordinator"}
          </Button>
        </>
      }
    >
      <form id="coordinator-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Account ID" htmlFor="coordinator-id" hint="For example COORD-002.">
            <input id="coordinator-id" type="text" maxLength={50} value={form.coordinator_id} onChange={set("coordinator_id")} className="field" />
          </FormField>
          <FormField label="Name" htmlFor="coordinator-name">
            <input id="coordinator-name" type="text" maxLength={150} value={form.name} onChange={set("name")} className="field" />
          </FormField>
          <FormField label="Email" htmlFor="coordinator-email">
            <input id="coordinator-email" type="email" maxLength={150} value={form.email} onChange={set("email")} className="field" />
          </FormField>
          <FormField label="Department" htmlFor="coordinator-department" optional>
            <input id="coordinator-department" type="text" maxLength={150} value={form.department} onChange={set("department")} className="field" />
          </FormField>
        </div>
        <FormField
          label="Starting password"
          htmlFor="coordinator-password"
          hint={`${PASSWORD_POLICY_HINT} They must set their own at first sign-in.`}
        >
          <input id="coordinator-password" type="text" autoComplete="off" value={form.password} onChange={set("password")} className="field font-mono" />
        </FormField>
        <FormError message={error} />
      </form>
    </Modal>
  );
}
