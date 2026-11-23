import { useCallback, useEffect, useState } from "react";
import { Button, Card, ConfirmDialog, EmptyState, ErrorNotice, FormError, FormField, Modal, RowMenu, SkeletonRows, StatusBadge } from "../../components/ui";
import DirectorLayout from "../../layouts/DirectorLayout";
import { PASSWORD_POLICY_HINT, passwordPolicyError } from "../../lib/api";
import { errorText, toast } from "../../lib/toast";
import { directorRead, directorWrite } from "./request";

/*
| The coordinators (Phase 1.6): add one, deactivate or reactivate, set a
| new starting password, and choose the colleges or programs each looks
| after. No college or program means every student, as before. Each
| change says what will happen first, with the old and the new value.
*/

type Coordinator = { coordinator_id: string; name: string; email: string; is_active: boolean; college_ids: number[]; program_ids: number[] };
type Academics = {
  colleges: { id: number; name: string; short_name: string | null; is_active: boolean }[];
  programs: { id: number; college_id: number; name: string; short_code: string; is_active: boolean }[];
};

/** "Every student", or the colleges and programs by their short names. */
function scopeWords(collegeIds: number[], programIds: number[], academics: Academics | null): string {
  if (collegeIds.length + programIds.length === 0) return "Every student";
  const colleges = collegeIds.map((id) => academics?.colleges.find((item) => item.id === id)?.short_name || academics?.colleges.find((item) => item.id === id)?.name || `College ${id}`);
  const programs = programIds.map((id) => academics?.programs.find((item) => item.id === id)?.short_code || `Program ${id}`);
  return [...colleges, ...programs].join(", ");
}

export default function DirectorCoordinators() {
  const [list, setList] = useState<Coordinator[] | null>(null);
  const [academics, setAcademics] = useState<Academics | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [scoping, setScoping] = useState<Coordinator | null>(null);
  const [toggling, setToggling] = useState<Coordinator | null>(null);
  const [resetting, setResetting] = useState<Coordinator | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [coordinators, catalogue] = await Promise.all([
        directorRead<{ coordinators: Coordinator[] }>("coordinators", "/api/director/coordinators"),
        directorRead<Academics>("academics", "/api/coordinator/academics"),
      ]);
      setList(coordinators.coordinators);
      setAcademics(catalogue);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "The coordinators could not be loaded. Check your connection and try again."));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const toggle = async () => {
    if (!toggling) return;
    setBusy(true);
    try {
      await directorWrite(`/api/coordinator/coordinators/${encodeURIComponent(toggling.coordinator_id)}/status`, "PATCH", { is_active: !toggling.is_active });
      toast.success(`${toggling.name} ${toggling.is_active ? "deactivated" : "reactivated"}.`);
      setToggling(null);
      await load();
    } catch (toggleError) {
      toast.error(errorText(toggleError, "That could not be changed. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DirectorLayout title="Coordinators" actions={<Button icon="plus" onClick={() => setAdding(true)}>Add coordinator</Button>}>
      {error && (
        <div className="mb-4">
          <ErrorNotice message={error} onRetry={() => void load()} />
        </div>
      )}
      <Card>
        {!list && !error ? (
          <div className="p-4">
            <SkeletonRows rows={4} />
          </div>
        ) : list && list.length === 0 ? (
          <EmptyState icon="users" title="No coordinators yet" description="Add the first coordinator; they then register the students of their program." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {(list ?? []).map((row) => (
              <li key={row.coordinator_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-(--role-ink)">{row.name}</p>
                  <p className="truncate text-xs text-slate-600">{row.email}</p>
                  <p className="mt-1 text-sm text-slate-700">Looks after: {scopeWords(row.college_ids, row.program_ids, academics)}</p>
                </div>
                {!row.is_active && <StatusBadge status="Deactivated" tone="neutral" />}
                <Button size="sm" variant="secondary" onClick={() => setScoping(row)}>
                  Colleges and programs<span className="sr-only"> of {row.name}</span>
                </Button>
                <RowMenu
                  label={`More for ${row.name}`}
                  items={[
                    { label: "Set a new password", icon: "lock", onSelect: () => setResetting(row) },
                    row.is_active
                      ? { label: "Deactivate", icon: "close", tone: "danger", onSelect: () => setToggling(row) }
                      : { label: "Reactivate", icon: "refresh", tone: "good", onSelect: () => setToggling(row) },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {adding && <AddDialog onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void load(); }} />}
      {scoping && academics && (
        <ScopeDialog key={scoping.coordinator_id} coordinator={scoping} academics={academics} onClose={() => setScoping(null)} onSaved={() => { setScoping(null); void load(); }} />
      )}
      {resetting && <ResetDialog key={resetting.coordinator_id} coordinator={resetting} onClose={() => setResetting(null)} />}
      <ConfirmDialog
        open={toggling !== null}
        title={toggling?.is_active ? `Deactivate ${toggling?.name}?` : `Reactivate ${toggling?.name}?`}
        message={
          toggling?.is_active
            ? "They are signed out everywhere and cannot sign in. Their students stay as they are."
            : "They can sign in again with their current password."
        }
        confirmLabel={toggling?.is_active ? "Deactivate" : "Reactivate"}
        tone={toggling?.is_active ? "danger" : "primary"}
        busy={busy}
        onConfirm={() => void toggle()}
        onCancel={() => setToggling(null)}
      />
    </DirectorLayout>
  );
}

function AddDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ coordinator_id: "", name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const policy = passwordPolicyError(form.password);
    if (policy) return setError(`Starting password: ${policy}`);
    setSaving(true);
    setError("");
    try {
      await directorWrite("/api/coordinator/coordinators", "POST", { ...form, coordinator_id: form.coordinator_id.trim(), name: form.name.trim(), email: form.email.trim() });
      toast.success(`${form.name.trim()} added. Give them their starting password.`);
      onSaved();
    } catch (saveError) {
      setError(errorText(saveError, "The coordinator could not be added. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title="Add a coordinator"
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="add-coordinator" busy={saving} failed={Boolean(error)}>Add coordinator</Button>
        </>
      }
    >
      <form id="add-coordinator" onSubmit={save} className="grid gap-4 sm:grid-cols-2" noValidate>
        <FormField label="Account ID" htmlFor="coord-id" hint="Letters, digits, dots or dashes, such as COORD-0004.">
          <input id="coord-id" className="field" maxLength={50} value={form.coordinator_id} onChange={set("coordinator_id")} />
        </FormField>
        <FormField label="Full name" htmlFor="coord-name">
          <input id="coord-name" className="field" maxLength={150} value={form.name} onChange={set("name")} />
        </FormField>
        <FormField label="Email" htmlFor="coord-email" className="sm:col-span-2">
          <input id="coord-email" type="email" className="field" maxLength={150} value={form.email} onChange={set("email")} />
        </FormField>
        <FormField label="Starting password" htmlFor="coord-password" hint={`${PASSWORD_POLICY_HINT} They set their own at first sign-in.`} className="sm:col-span-2">
          <input id="coord-password" type="text" autoComplete="off" className="field font-mono" value={form.password} onChange={set("password")} />
        </FormField>
        <div className="sm:col-span-2">
          <FormError message={error} />
        </div>
      </form>
    </Modal>
  );
}

function ScopeDialog({ coordinator, academics, onClose, onSaved }: { coordinator: Coordinator; academics: Academics; onClose: () => void; onSaved: () => void }) {
  const [colleges, setColleges] = useState(new Set(coordinator.college_ids));
  const [programs, setPrograms] = useState(new Set(coordinator.program_ids));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const before = scopeWords(coordinator.college_ids, coordinator.program_ids, academics);
  const after = scopeWords([...colleges].sort((a, b) => a - b), [...programs].sort((a, b) => a - b), academics);
  const flip = (set: Set<number>, update: (next: Set<number>) => void, id: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update(next);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const data = await directorWrite<{ message: string }>(`/api/director/coordinators/${encodeURIComponent(coordinator.coordinator_id)}/scopes`, "PUT", {
        college_ids: [...colleges],
        program_ids: [...programs],
      });
      toast.success(data.message);
      onSaved();
    } catch (saveError) {
      setError(errorText(saveError, "The colleges and programs could not be saved. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const box = "flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-slate-50";
  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title={`What ${coordinator.name} looks after`}
      description="Their students are those of the colleges and programs ticked. None ticked: every student."
      size="lg"
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} busy={saving} failed={Boolean(error)} disabled={before === after}>Save colleges and programs</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">Colleges</legend>
            <ul className="mt-1 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {academics.colleges.filter((item) => item.is_active || colleges.has(item.id)).map((item) => (
                <li key={item.id}>
                  <label className={box}>
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-400 text-psu-700" checked={colleges.has(item.id)} onChange={() => flip(colleges, setColleges, item.id)} />
                    <span className="text-sm text-slate-800">{item.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">Programs</legend>
            <ul className="mt-1 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {academics.programs.filter((item) => item.is_active || programs.has(item.id)).map((item) => (
                <li key={item.id}>
                  <label className={box}>
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-400 text-psu-700" checked={programs.has(item.id)} onChange={() => flip(programs, setPrograms, item.id)} />
                    <span className="text-sm text-slate-800">{item.short_code}: {item.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        </div>
        <dl className="grid gap-1 rounded-lg bg-slate-50 px-3 py-2.5 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="text-slate-600">Now</dt>
          <dd className="text-slate-900">{before}</dd>
          <dt className="text-slate-600">After saving</dt>
          <dd className="font-semibold text-slate-900">{after}</dd>
        </dl>
        <FormError message={error} />
      </div>
    </Modal>
  );
}

function ResetDialog({ coordinator, onClose }: { coordinator: Coordinator; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const policy = passwordPolicyError(password);
    if (policy) return setError(policy);
    setSaving(true);
    setError("");
    try {
      await directorWrite(`/api/coordinator/coordinators/${encodeURIComponent(coordinator.coordinator_id)}/reset-password`, "POST", { password });
      toast.success(`New password set for ${coordinator.name}. Give it to them; they change it at sign-in.`);
      onClose();
    } catch (saveError) {
      setError(errorText(saveError, "The password could not be set. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title={`Set a new password for ${coordinator.name}`}
      description="They are signed out everywhere and must choose their own at their next sign-in."
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="reset-coordinator" busy={saving} failed={Boolean(error)}>Set the new password</Button>
        </>
      }
    >
      <form id="reset-coordinator" onSubmit={save} noValidate>
        <FormField label="New password" htmlFor="reset-password" hint={PASSWORD_POLICY_HINT}>
          <input id="reset-password" type="text" autoComplete="off" className="field font-mono" value={password} onChange={(event) => setPassword(event.target.value)} />
        </FormField>
        <FormError message={error} />
      </form>
    </Modal>
  );
}
