import { useState } from "react";
import Icon from "../../components/Icon";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorNotice,
  Modal,
  SkeletonRows,
} from "../../components/ui";
import { API_URL, withSupervisorAuth } from "../../lib/api";
import { errorText, toast } from "../../lib/toast";
import type { Team, TeamsState } from "./useTeams";
import type { Intern } from "./useSupervisorWork";
import { sameId } from "../../lib/ids";

/*
|--------------------------------------------------------------------------
| TEAMS
|--------------------------------------------------------------------------
|
| A team is a named group of the supervisor's own interns, so one task can
| be given to all of them at once. Each member still gets their own copy
| of the task and submits their own work. Changing who is in a team, or
| removing it, leaves the tasks already given where they are.
|
*/

async function send(method: "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<string> {
  const response = await fetch(
    `${API_URL}${path}`,
    withSupervisorAuth({
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    })
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "The team could not be saved.");
  return typeof data.message === "string" ? data.message : "Saved.";
}

export default function Teams({
  teams,
  interns,
  onAssign,
}: {
  teams: TeamsState;
  interns: Intern[];
  /** Starts a task for this team. */
  onAssign: (team: Team) => void;
}) {
  // "new" while creating, a team while changing one, null when closed.
  const [form, setForm] = useState<Team | "new" | null>(null);
  const [removing, setRemoving] = useState<Team | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const remove = async () => {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      toast.success(await send("DELETE", `/api/supervisor/teams/${removing.id}`));
      setRemoving(null);
      await teams.reload();
    } catch (error) {
      toast.error(errorText(error, "The team could not be removed."));
    } finally {
      setRemoveBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {teams.error && <ErrorNotice message={teams.error} onRetry={() => void teams.reload()} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm text-slate-600">
          Group interns who work on the same thing, then give the group one task. Each member submits
          their own work.
        </p>
        <Button icon="plus" onClick={() => setForm("new")} disabled={interns.length === 0}>
          New team
        </Button>
      </div>

      <Card>
        {teams.loading ? (
          <SkeletonRows rows={3} />
        ) : teams.list.length === 0 ? (
          <EmptyState
            icon="users"
            title="No teams yet"
            description={
              interns.length === 0
                ? "You can make a team once interns are assigned to you."
                : "Make a team to give several interns the same task in one go."
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {teams.list.map((team) => {
              const active = team.members.filter((member) => member.is_active);
              return (
                <li key={team.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold text-slate-900">{team.name}</p>
                    <p className="mt-0.5 break-words text-sm text-slate-600">
                      {team.members.length === 0
                        ? "No members"
                        : team.members
                            .map((member) => (member.is_active ? member.name : `${member.name} (no longer active)`))
                            .join(", ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1 sm:self-center">
                    <Button variant="secondary" onClick={() => onAssign(team)} disabled={active.length === 0}>
                      Assign a task
                    </Button>
                    <button
                      type="button"
                      onClick={() => setForm(team)}
                      className="inline-flex h-10 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-psu-700 hover:bg-slate-100"
                    >
                      <Icon name="edit" size={15} />
                      Edit<span className="sr-only"> {team.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemoving(team)}
                      className="inline-flex h-10 items-center rounded-md px-2.5 text-sm font-medium text-red-700 hover:bg-slate-100"
                    >
                      Remove<span className="sr-only"> {team.name}</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {form && (
        <TeamDialog
          key={form === "new" ? "new" : form.id}
          editing={form === "new" ? null : form}
          interns={interns}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            void teams.reload();
          }}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        title="Remove this team?"
        message={
          removing
            ? `"${removing.name}" will be removed. Tasks already given to it stay with each intern, as they are.`
            : undefined
        }
        confirmLabel="Remove team"
        cancelLabel="Keep team"
        tone="danger"
        busy={removeBusy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

function TeamDialog({
  editing,
  interns,
  onClose,
  onSaved,
}: {
  editing: Team | null;
  interns: Intern[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [chosen, setChosen] = useState<Set<string>>(
    () =>
      new Set(
        (editing?.members ?? [])
          // Someone no longer among the supervisor's interns cannot be kept.
          .filter((member) => interns.some((intern) => sameId(intern.student_id, member.student_id)))
          .map((member) => member.student_id)
      )
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const toggle = (studentId: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) return setError("Give the team a name of at least 2 characters.");
    if (chosen.size === 0) return setError("Choose at least one intern for the team.");
    setSaving(true);
    setError("");
    try {
      const body = { name: name.trim(), student_ids: [...chosen] };
      toast.success(
        editing
          ? await send("PUT", `/api/supervisor/teams/${editing.id}`, body)
          : await send("POST", "/api/supervisor/teams", body)
      );
      onSaved();
    } catch (saveError) {
      setError(errorText(saveError, "The team could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => {
        if (!saving) onClose();
      }}
      title={editing ? "Edit team" : "New team"}
      description={
        editing
          ? "Tasks already given to this team stay with whoever had them."
          : "Only your own interns can be in a team."
      }
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="team-form" busy={saving} failed={Boolean(error)}>
            {saving ? "Saving" : editing ? "Save changes" : "Create team"}
          </Button>
        </>
      }
    >
      <form id="team-form" onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="team-name" className="mb-1.5 block text-sm font-medium text-slate-700">
            Team name
          </label>
          <input
            id="team-name"
            type="text"
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="For example, Inventory team"
            className="field"
          />
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">
            Members <span className="font-normal text-slate-600">({chosen.size} chosen)</span>
          </legend>
          <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {interns.map((intern) => (
              <li key={intern.student_id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={chosen.has(intern.student_id)}
                    onChange={() => toggle(intern.student_id)}
                    className="h-4 w-4 rounded border-slate-400 text-psu-700"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-900">{intern.name}</span>
                    <span className="block text-xs text-slate-600">
                      {intern.block_name || intern.program_code || intern.program || intern.student_id}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
