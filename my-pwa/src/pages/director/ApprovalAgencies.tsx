import { useCallback, useEffect, useState } from "react";
import { Button, Card, ConfirmDialog, EmptyState, ErrorNotice, SkeletonRows, StatusBadge } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { HTE_STATUS_EFFECT, HTE_STATUS_TONE, HTE_STATUS_WORDS, HTE_TYPE_WORDS, type HteStatus, type HteType } from "../../lib/hte";
import { errorText, toast } from "../../lib/toast";
import { directorRead, directorWrite } from "./request";

/*
| Approvals, agencies (Phase 1.3): the Director approves or suspends a Host
| Training Establishment (GET /api/director/htes, then the shared
| PUT .../hte-status with the version read). Waiting ones come first. A
| private agency is approved only after a screening that passed; the
| coordinators record screenings on the agency's page, so here it only
| says so. The college marks keep the agencies that serve that college.
*/

type Decision = "pass" | "conditional" | "fail";
type Agency = {
  id: number;
  name: string;
  address: string | null;
  hte_type: HteType;
  status: HteStatus;
  version: number;
  is_active: boolean;
  slots: number | null;
  moa_notarized: boolean;
  moa_expiry: string | null;
  moa_on_file: boolean;
  active_students: number;
  screening_passed: boolean;
  last_screening: { screened_on: string; decision: Decision; notes: string | null } | null;
  college_ids: number[];
};

const DECISION_WORDS: Record<Decision, string> = { pass: "passed", conditional: "passed with conditions", fail: "failed" };

type Change = { agency: Agency; to: HteStatus; verb: string };

/** The one action an agency's row offers, or why there is none. */
function actionFor(agency: Agency): Change | { note: string } {
  if (agency.status === "approved") return { agency, to: "suspended", verb: "Suspend" };
  if (agency.hte_type === "private" && !agency.screening_passed) {
    return { note: "Needs a screening that passed before it can be approved. Coordinators record it on the agency's page." };
  }
  return { agency, to: "approved", verb: agency.status === "suspended" ? "Approve again" : "Approve" };
}

const slotsText = (agency: Agency) =>
  agency.slots === null
    ? `${agency.active_students} ${agency.active_students === 1 ? "student" : "students"}, no slot limit`
    : `${agency.active_students} of ${agency.slots} slots taken`;

export default function ApprovalAgencies({ college }: { college: number | null }) {
  const [agencies, setAgencies] = useState<Agency[] | null>(null);
  const [error, setError] = useState("");
  const [change, setChange] = useState<Change | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await directorRead<{ companies: Agency[] }>("approvals-agencies", "/api/director/htes");
      setAgencies(data.companies.filter((row) => row.is_active));
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "The agencies could not be loaded. Check your connection and try again."));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const shown = (agencies ?? []).filter((row) => college === null || row.college_ids.includes(college));

  const save = async () => {
    if (!change) return;
    setBusy(true);
    try {
      const done = await directorWrite<{ message: string }>(`/api/coordinator/company-records/${change.agency.id}/hte-status`, "PUT", {
        status: change.to,
        expected_version: change.agency.version,
      });
      toast.success(done.message);
    } catch (saveError) {
      // Someone changed it first, or it still needs a screening: the server says which; the list is read again.
      toast.error(errorText(saveError, "The agency's status could not be changed. Check your connection and try again."));
    } finally {
      setBusy(false);
      setChange(null);
      await load();
    }
  };

  return (
    <>
      {error && (
        <div className="mb-4">
          <ErrorNotice message={error} onRetry={() => void load()} />
        </div>
      )}
      <Card>
        {!agencies && !error ? (
          <div className="p-4">
            <SkeletonRows rows={3} />
          </div>
        ) : shown.length === 0 ? (
          <EmptyState
            icon="building"
            title={college === null ? "No agencies yet" : "No agency serves this college yet"}
            description="Coordinators add agencies on their Companies page, or approve one a student suggests. It shows here to approve."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((agency) => {
              const action = actionFor(agency);
              return (
                <li key={agency.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-(--role-ink)">{agency.name}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={HTE_STATUS_WORDS[agency.status]} tone={HTE_STATUS_TONE[agency.status]} />
                      <StatusBadge status={HTE_TYPE_WORDS[agency.hte_type]} tone="neutral" />
                      <StatusBadge
                        status={agency.moa_notarized ? "MOA notarized" : agency.moa_on_file ? "MOA not notarized" : "No MOA on file"}
                        tone={agency.moa_notarized ? "good" : "waiting"}
                      />
                    </div>
                    <p className="mt-1.5 text-sm text-slate-700">
                      {slotsText(agency)}
                      {agency.moa_expiry ? `. MOA ends ${formatDate(agency.moa_expiry)}` : ""}.
                    </p>
                    <p className="mt-1 max-w-[65ch] text-sm text-slate-700">
                      {agency.last_screening
                        ? `Screened ${formatDate(agency.last_screening.screened_on)}: ${DECISION_WORDS[agency.last_screening.decision]}.${agency.last_screening.notes ? ` ${agency.last_screening.notes}` : ""}`
                        : "Not screened yet."}
                    </p>
                    {"note" in action && <p className="mt-1 max-w-[65ch] text-sm font-medium text-amber-800">{action.note}</p>}
                  </div>
                  {"verb" in action && (
                    <Button variant="secondary" onClick={() => setChange(action)}>
                      {action.verb}
                      <span className="sr-only"> {agency.name}</span>
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={change !== null}
        title={change ? `${change.verb} ${change.agency.name}?` : ""}
        message={
          change
            ? `Now: ${HTE_STATUS_WORDS[change.agency.status]}. After: ${HTE_STATUS_WORDS[change.to]}. ${HTE_STATUS_EFFECT[change.to]}`
            : undefined
        }
        confirmLabel={change ? `${change.verb} ${change.agency.name}` : ""}
        tone={change?.to === "suspended" ? "danger" : undefined}
        busy={busy}
        onConfirm={() => void save()}
        onCancel={() => setChange(null)}
      />
    </>
  );
}
