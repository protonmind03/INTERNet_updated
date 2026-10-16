import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../components/Icon";
import {
  Button,
  Card,
  EmptyState,
  ErrorNotice,
  Modal,
  ProgressBar,
  Skeleton,
} from "../../components/ui";
import SupervisorLayout from "../../layouts/SupervisorLayout";
import { formatHours, getInitials } from "../../lib/format";
import { useAccount } from "../../lib/session";
import { useProjections } from "../../lib/useProjections";
import ProjectionLine from "../../components/ProjectionLine";
import { internPath } from "./internPath";
import { useSupervisorWork, type Intern, type SupervisorWork } from "./useSupervisorWork";

export default function SupervisorInterns() {
  const supervisor = useAccount("supervisor");
  const work = useSupervisorWork(supervisor?.supervisor_id);
  const { interns, loading } = work;

  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const text = search.trim().toLowerCase();
    if (!text) return interns;
    return interns.filter((intern) =>
      [intern.name, intern.student_id, intern.program, intern.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(text))
    );
  }, [interns, search]);

  const opened = interns.find((intern) => intern.student_id === openId) ?? null;

  return (
    <SupervisorLayout
      title="Interns"
      subtitle={
        loading
          ? "The students assigned to you."
          : `${interns.length} ${interns.length === 1 ? "student is" : "students are"} assigned to you.`
      }
    >
      <div className="space-y-5">
        {work.error && <ErrorNotice message={work.error} onRetry={() => void work.reload()} />}

        {interns.length > 3 && (
          <label className="relative block max-w-sm">
            <span className="sr-only">Search interns</span>
            <Icon
              name="search"
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, ID or program"
              className="field pl-9"
            />
          </label>
        )}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((card) => (
              <Card key={card} className="space-y-3 p-5">
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-2 w-full" />
              </Card>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState
              icon="users"
              title={interns.length === 0 ? "No interns yet" : "No interns match your search"}
              description={
                interns.length === 0
                  ? "Your OJT coordinator assigns students to you."
                  : undefined
              }
            />
          </Card>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((intern) => {
              const pending = pendingFor(work, intern.student_id);
              return (
                <li key={intern.student_id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(intern.student_id)}
                    className="block h-full w-full rounded-xl border border-slate-200/80 bg-white p-5 text-left shadow-card transition-[border-color,box-shadow] duration-200 hover:border-psu-300 hover:shadow-raised"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-psu-700 text-sm font-bold text-white">
                        {getInitials(intern.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {intern.name}
                        </p>
                        <p className="truncate text-sm text-slate-500">
                          {intern.program || intern.student_id}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-baseline justify-between text-sm">
                      <span className="text-slate-600">Hours verified</span>
                      <span className="tabular font-medium text-slate-900">
                        {formatHours(intern.hours_rendered)} of{" "}
                        {formatHours(intern.required_hours)}
                      </span>
                    </div>
                    <ProgressBar
                      value={intern.completion}
                      className="mt-2"
                      label={`${intern.completion} percent of required hours`}
                    />

                    <p className="mt-4 text-sm text-slate-600">
                      {intern.active_tasks} open {intern.active_tasks === 1 ? "task" : "tasks"}
                      {pending > 0 && (
                        <span className="font-semibold text-amber-700">
                          {" "}
                          · {pending} waiting for you
                        </span>
                      )}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <InternDialog intern={opened} work={work} onClose={() => setOpenId(null)} />
    </SupervisorLayout>
  );
}

/** Items of this intern's that are waiting for the supervisor's decision. */
function pendingFor(work: SupervisorWork, studentId: string): number {
  return work.queue.filter((item) => item.entry.student_id === studentId).length;
}

/**
 * A short look at one intern: where their hours stand, how to reach them,
 * and what is waiting. Everything else is on their page ("Open").
 */
function InternDialog({
  intern,
  work,
  onClose,
}: {
  intern: Intern | null;
  work: SupervisorWork;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const projections = useProjections("supervisor");
  if (!intern) return null;
  const pending = pendingFor(work, intern.student_id);

  return (
    <Modal
      open
      onClose={onClose}
      title={intern.name}
      description={[intern.student_id, intern.block_name || intern.program].filter(Boolean).join(" · ")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => navigate(internPath(intern.student_id))}>Open</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-slate-700">Hours verified</span>
            <span className="tabular text-slate-900">
              {formatHours(intern.hours_rendered)} of {formatHours(intern.required_hours)} (
              {intern.completion}%)
            </span>
          </div>
          <ProgressBar value={intern.completion} className="mt-2" />
          <ProjectionLine projection={projections.get(intern.student_id)} className="mt-2" />
        </div>

        <dl className="space-y-1 text-sm text-slate-700">
          <div>
            <dt className="inline font-medium">Email: </dt>
            <dd className="inline">
              <a href={`mailto:${intern.email}`} className="break-all text-psu-700 hover:underline">
                {intern.email}
              </a>
            </dd>
          </div>
          {intern.phone && (
            <div>
              <dt className="inline font-medium">Mobile: </dt>
              <dd className="inline">
                <a
                  href={`tel:${intern.phone}`}
                  aria-label={`Call ${intern.name}, ${intern.phone}`}
                  className="inline-flex items-center gap-1 text-psu-700 underline underline-offset-2 hover:text-psu-900"
                >
                  <Icon name="phone" size={14} className="shrink-0" />
                  {intern.phone}
                </a>
              </dd>
            </div>
          )}
          {intern.emergency_contact_phone && (
            <div>
              <dt className="inline font-medium">In an emergency: </dt>
              <dd className="inline">
                {intern.emergency_contact_name ? `${intern.emergency_contact_name}, ` : ""}
                <a
                  href={`tel:${intern.emergency_contact_phone}`}
                  aria-label={`Call the emergency contact, ${intern.emergency_contact_phone}`}
                  className="inline-flex items-center gap-1 text-psu-700 underline underline-offset-2 hover:text-psu-900"
                >
                  <Icon name="phone" size={14} className="shrink-0" />
                  {intern.emergency_contact_phone}
                </a>
              </dd>
            </div>
          )}
        </dl>

        <p className="text-sm text-slate-700">
          {intern.active_tasks} open {intern.active_tasks === 1 ? "task" : "tasks"}
          {pending > 0 ? (
            <span className="font-semibold text-amber-800">
              {" "}
              · {pending} waiting for you
            </span>
          ) : (
            " · nothing waiting for you"
          )}
        </p>
        <p className="text-sm text-slate-600">
          Open their page for attendance, tasks, documents, weekly reports, evaluations, the time record and
          notes with the coordinator.
        </p>
      </div>
    </Modal>
  );
}
