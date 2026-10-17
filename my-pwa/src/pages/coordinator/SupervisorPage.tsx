import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AccountDetailsForm from "../../components/AccountDetailsForm";
import ComposeMessage from "../../components/ComposeMessage";
import Icon from "../../components/Icon";
import { Button, Card, CardHeader, EmptyState, ErrorNotice, SkeletonRows, StatusBadge } from "../../components/ui";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { errorText } from "../../lib/toast";
import { coordinatorRequest } from "./request";

/*
|--------------------------------------------------------------------------
| ONE SUPERVISOR
|--------------------------------------------------------------------------
|
| Roadmap 5.2 and 4.4. A supervisor's view page, from their company's page
| or the Supervisors tab: who they are and how to reach them, their
| interns, and Message. The coordinator can correct their contact details
| here; that is audited (the fields changed, not what they say).
|
*/

type Supervisor = {
  supervisor_id: string;
  name: string;
  email: string;
  company: string | null;
  company_id: number | null;
  department: string | null;
  is_active: boolean;
  position: string | null;
  work_phone: string | null;
  office_hours: string | null;
  preferred_contact: string | null;
  mobile_number: string | null;
  show_mobile: boolean;
};
type Intern = { student_id: string; name: string; email: string; program: string | null; is_active: boolean };

const CONTACT: Record<string, string> = { email: "Email", mobile: "Mobile", message: "A message in INTERNet", office: "In person" };

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-900">{children || "—"}</dd>
    </div>
  );
}

export default function SupervisorPage() {
  const { supervisorId = "" } = useParams();
  const [data, setData] = useState<{ supervisor: Supervisor; interns: Intern[] } | null>(null);
  const [error, setError] = useState("");
  const [writing, setWriting] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await coordinatorRequest(`/api/coordinator/supervisors/${encodeURIComponent(supervisorId)}/page`));
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the supervisor."));
    }
  }, [supervisorId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const supervisor = data?.supervisor;

  return (
    <CoordinatorLayout
      title={supervisor?.name ?? "Supervisor"}
      subtitle={supervisor ? [supervisor.position, supervisor.company].filter(Boolean).join(", ") || undefined : undefined}
      actions={
        supervisor && (
          <>
            <Link
              to={supervisor.company_id ? `/coordinator/companies/${supervisor.company_id}` : "/coordinator/companies?tab=supervisors"}
              className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-psu-700 hover:underline"
            >
              <Icon name="chevron-left" size={16} />
              {supervisor.company_id ? supervisor.company : "All supervisors"}
            </Link>
            {supervisor.is_active && (
              <Button icon="mail" onClick={() => setWriting(true)}>
                Message {supervisor.name.split(" ")[0]}
              </Button>
            )}
          </>
        )
      }
    >
      <div className="space-y-6">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}
        {!data && !error && (
          <Card>
            <SkeletonRows rows={4} />
          </Card>
        )}
        {supervisor && data && (
          <>
            <Card>
              <CardHeader
                title="How to reach them"
                action={
                  <Button variant="secondary" icon="edit" onClick={() => setEditing((open) => !open)} aria-expanded={editing}>
                    {editing ? "Close" : "Edit details"}
                  </Button>
                }
              />
              <dl className="grid gap-x-6 gap-y-4 px-4 pb-5 pt-3 sm:grid-cols-2 sm:px-5 lg:grid-cols-3">
                <Fact label="Email">
                  <a href={`mailto:${supervisor.email}`} className="font-semibold text-psu-700 hover:underline">
                    {supervisor.email}
                  </a>
                </Fact>
                <Fact label="Work phone">{supervisor.work_phone}</Fact>
                <Fact label="Mobile">
                  {supervisor.mobile_number &&
                    `${supervisor.mobile_number}${supervisor.show_mobile ? "" : " (not shown to interns)"}`}
                </Fact>
                <Fact label="Hours they can be reached">{supervisor.office_hours}</Fact>
                <Fact label="Prefers">{supervisor.preferred_contact ? CONTACT[supervisor.preferred_contact] : null}</Fact>
                <Fact label="Department">{supervisor.department}</Fact>
                <Fact label="Account">
                  {supervisor.is_active ? <StatusBadge status="Active" tone="good" /> : <StatusBadge status="Deactivated" tone="neutral" />}
                </Fact>
              </dl>
            </Card>

            {editing && (
              <AccountDetailsForm
                role="supervisor"
                viewer="coordinator"
                person={{ role: "supervisor", id: supervisor.supervisor_id }}
                title={`${supervisor.name}'s contact details`}
                description="Saved changes are recorded in the audit log by field, not by what they say."
                onSaved={() => void load()}
              />
            )}

            <Card>
              <CardHeader title="Interns" description="Active interns first." />
              {data.interns.length === 0 ? (
                <EmptyState icon="users" title="No interns assigned" />
              ) : (
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {data.interns.map((intern) => (
                    <li key={intern.student_id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
                      <span className="min-w-0">
                        <Link
                          to={`/coordinator/students/${encodeURIComponent(intern.student_id)}`}
                          className="font-semibold text-psu-800 hover:underline"
                        >
                          {intern.name}
                        </Link>
                        <span className="block text-xs text-slate-600">{[intern.program, intern.email].filter(Boolean).join(" · ")}</span>
                      </span>
                      {!intern.is_active && <StatusBadge status="Deactivated" tone="neutral" />}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>

      {writing && supervisor && (
        <ComposeMessage
          role="coordinator"
          to={{ role: "supervisor", id: supervisor.supervisor_id, name: supervisor.name, email: supervisor.email }}
          subject="About your interns"
          context={{ type: "supervisor", id: supervisor.supervisor_id, label: [supervisor.name, supervisor.company].filter(Boolean).join(", ") }}
          onClose={() => setWriting(false)}
        />
      )}
    </CoordinatorLayout>
  );
}
