import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorNotice, FormError, FormField, SkeletonRows, StatusBadge } from "../../components/ui";
import { API_URL, withCoordinatorAuth } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { saveFile } from "../../lib/saveFile";
import { HTE_STATUS_TONE, HTE_STATUS_WORDS, HTE_TYPE_WORDS, type HteStatus, type HteType } from "../../lib/hte";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";

/*
| Phase 1.3: a company as a Host Training Establishment. Its kind and
| status as chips; on its page the status (changed from the version read,
| a private one only after a passed screening), the MOA (the signed copy and
| its notarization) and the screenings; and the agencies students and
| coordinators suggest.
*/

export type HteCompany = {
  id: number;
  name: string;
  hte_type?: HteType;
  status?: HteStatus;
  version?: number;
  moa_notarized?: boolean;
  moa_notarized_on?: string | null;
  moa_file?: string | null;
};

/** The kind, the status and whether the MOA is notarized, as chips. */
export function HteChips({ company }: { company: HteCompany }) {
  if (!company.status) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {company.hte_type && <StatusBadge status={HTE_TYPE_WORDS[company.hte_type]} tone="neutral" />}
      <StatusBadge status={HTE_STATUS_WORDS[company.status]} tone={HTE_STATUS_TONE[company.status]} />
      {company.moa_notarized && <StatusBadge status="MOA notarized" tone="good" />}
    </span>
  );
}

type Screening = {
  id: number;
  screened_on: string;
  standing: number;
  standing_note: string | null;
  work_environment: number;
  work_environment_note: string | null;
  space_capacity: number;
  space_capacity_note: string | null;
  safety: number;
  safety_note: string | null;
  decision: "pass" | "conditional" | "fail";
  notes: string | null;
  version: number;
};

const CRITERIA = [
  { key: "standing", label: "Standing" },
  { key: "work_environment", label: "Work environment" },
  { key: "space_capacity", label: "Space and capacity" },
  { key: "safety", label: "Safety" },
] as const;
type CriterionKey = (typeof CRITERIA)[number]["key"];

const DECISION_WORDS: Record<Screening["decision"], string> = { pass: "Passed", conditional: "Passed with conditions", fail: "Failed" };
const DECISION_TONE: Record<Screening["decision"], "good" | "waiting" | "bad"> = { pass: "good", conditional: "waiting", fail: "bad" };

const STATUS_EFFECT: Record<HteStatus, string> = {
  approved: "Students can be placed there, up to its slots.",
  screening: "No student can be placed there until it is approved.",
  applied: "No student can be placed there until it is approved.",
  suspended: "No new student can be placed there. Students already there stay.",
};

const saveMoaFile = (companyId: number) =>
  saveFile(`${API_URL}/api/coordinator/company-records/${companyId}/moa`, withCoordinatorAuth(), "agreement");

/** On a company's page: its status, its MOA and its screenings. */
export function HteSection({ company, onChanged }: { company: HteCompany; onChanged: () => void }) {
  const [nextStatus, setNextStatus] = useState<HteStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [screenings, setScreenings] = useState<Screening[] | null>(null);
  const [screeningError, setScreeningError] = useState("");
  const [editing, setEditing] = useState<Screening | "new" | null>(null);
  const [notarizing, setNotarizing] = useState(false);
  const [notarizedOn, setNotarizedOn] = useState(company.moa_notarized_on ?? "");
  const [moaError, setMoaError] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);

  const loadScreenings = useCallback(async () => {
    try {
      const data = await coordinatorRequest<{ screenings: Screening[] }>(`/api/coordinator/company-records/${company.id}/screenings`);
      setScreenings(data.screenings);
      setScreeningError("");
    } catch (loadError) {
      setScreeningError(errorText(loadError, "The screenings could not be loaded."));
    }
  }, [company.id]);

  useEffect(() => {
    void Promise.resolve().then(loadScreenings);
  }, [loadScreenings]);

  if (!company.status) return null;

  const changeStatus = async () => {
    if (!nextStatus) return;
    setBusy(true);
    try {
      const data = await coordinatorRequest<{ message: string }>(`/api/coordinator/company-records/${company.id}/hte-status`, {
        method: "PUT",
        body: { status: nextStatus, expected_version: company.version },
      });
      toast.success(data.message);
      setNextStatus(null);
      onChanged();
    } catch (changeError) {
      // The refusal says why (no passed screening, or someone changed it first); the dialog closes on it.
      setNextStatus(null);
      toast.error(errorText(changeError, "The status could not be changed."));
      if ((changeError as { code?: string }).code === "STALE") onChanged();
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    setMoaError("");
    const body = new FormData();
    body.set("file", file);
    try {
      const response = await fetch(`${API_URL}/api/coordinator/company-records/${company.id}/moa`, withCoordinatorAuth({ method: "POST", body }));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "The agreement could not be uploaded.");
      toast.success(data.message);
      onChanged();
    } catch (uploadError) {
      setMoaError(errorText(uploadError, "The agreement could not be uploaded."));
    }
  };

  const saveNotarized = async (notarized: boolean) => {
    setBusy(true);
    setMoaError("");
    try {
      const data = await coordinatorRequest<{ message: string }>(`/api/coordinator/company-records/${company.id}/moa-notarized`, {
        method: "PUT",
        body: { notarized, notarized_on: notarized ? notarizedOn : null },
      });
      toast.success(data.message);
      setNotarizing(false);
      onChanged();
    } catch (saveError) {
      setMoaError(errorText(saveError, "The agreement could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  const passed = (screenings ?? []).some((item) => item.decision !== "fail");
  const statuses: HteStatus[] = ["applied", "screening", "approved", "suspended"];

  return (
    <>
      <Card>
        <CardHeader icon="shield" title="Approval and agreement" description="Students are placed only at approved companies, up to their slots." />
        <div className="space-y-4 px-4 pb-5 pt-3 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <HteChips company={company} />
              <p className="mt-1 text-sm text-slate-600">{STATUS_EFFECT[company.status]}</p>
              {company.hte_type === "private" && company.status !== "approved" && !passed && (
                <p className="mt-1 text-sm text-slate-600">A private company is approved only after a screening that passed.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {statuses
                .filter((status) => status !== company.status)
                .map((status) => (
                  <Button key={status} variant="secondary" onClick={() => setNextStatus(status)}>
                    {status === "approved" ? "Approve" : status === "suspended" ? "Suspend" : `Mark ${HTE_STATUS_WORDS[status].toLowerCase()}`}
                  </Button>
                ))}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold text-slate-900">Memorandum of agreement</h3>
            <p className="mt-1 text-sm text-slate-600">
              {company.moa_file ? `Signed copy: ${company.moa_file}.` : "No signed copy uploaded yet."}{" "}
              {company.moa_notarized ? `Notarized ${company.moa_notarized_on ? formatDate(company.moa_notarized_on) : ""}.` : "Not marked notarized."}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                className="sr-only"
                aria-label="Signed agreement file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void upload(file);
                }}
              />
              <Button variant="secondary" icon="upload" onClick={() => fileInput.current?.click()}>
                {company.moa_file ? "Replace the signed copy" : "Upload the signed copy"}
              </Button>
              {company.moa_file && (
                <Button variant="secondary" icon="download" onClick={() => void saveMoaFile(company.id).catch((error) => toast.error(errorText(error, "The agreement could not be opened.")))}>
                  Download
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => {
                  setNotarizedOn(company.moa_notarized_on ?? "");
                  setNotarizing(true);
                }}
              >
                {company.moa_notarized ? "Change notarization" : "Mark notarized"}
              </Button>
            </div>
            <div className="mt-2"><FormError message={moaError} /></div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          icon="clipboard"
          title="Screenings"
          description="A visit's four ratings from 1 to 5, and the decision."
          action={
            <Button variant="secondary" icon="plus" onClick={() => setEditing("new")}>
              Record a screening
            </Button>
          }
        />
        {screeningError ? (
          <div className="p-4"><ErrorNotice message={screeningError} onRetry={() => void loadScreenings()} /></div>
        ) : screenings === null ? (
          <div className="p-4"><SkeletonRows rows={2} /></div>
        ) : screenings.length === 0 ? (
          <EmptyState icon="clipboard" title="No screening yet" description="Record the first one after visiting the company." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {screenings.map((item) => (
              <li key={item.id} className="px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                    {formatDate(item.screened_on)}
                    <StatusBadge status={DECISION_WORDS[item.decision]} tone={DECISION_TONE[item.decision]} />
                  </p>
                  <button type="button" onClick={() => setEditing(item)} className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-psu-700 hover:bg-slate-100">
                    Edit<span className="sr-only"> the screening of {formatDate(item.screened_on)}</span>
                  </button>
                </div>
                <p className="mt-0.5 text-sm text-slate-600">{CRITERIA.map(({ key, label }) => `${label} ${item[key]}`).join(", ")}</p>
                {item.notes && <p className="mt-1 text-sm text-slate-700">{item.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={nextStatus !== null}
        title={nextStatus ? `Make ${company.name} ${HTE_STATUS_WORDS[nextStatus].toLowerCase()}?` : ""}
        message={nextStatus ? `Now: ${HTE_STATUS_WORDS[company.status]}. After: ${HTE_STATUS_WORDS[nextStatus]}. ${STATUS_EFFECT[nextStatus]}` : undefined}
        confirmLabel={nextStatus === "approved" ? "Approve" : nextStatus === "suspended" ? "Suspend" : nextStatus ? `Mark ${HTE_STATUS_WORDS[nextStatus].toLowerCase()}` : ""}
        tone={nextStatus === "suspended" ? "danger" : "primary"}
        busy={busy}
        onConfirm={() => void changeStatus()}
        onCancel={() => setNextStatus(null)}
      />
      <ConfirmDialog
        open={notarizing}
        title="Notarization of the agreement"
        message="Give the date on the notary's stamp."
        confirmLabel="Mark notarized"
        busy={busy}
        onConfirm={() => void saveNotarized(true)}
        onCancel={() => setNotarizing(false)}
      >
        <FormField label="Notarized on" htmlFor="moa-notarized-on">
          <input id="moa-notarized-on" type="date" className="field" value={notarizedOn} onChange={(event) => setNotarizedOn(event.target.value)} />
        </FormField>
        {company.moa_notarized && (
          <button type="button" onClick={() => void saveNotarized(false)} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-red-700 hover:underline">
            Mark not notarized
          </button>
        )}
        <div className="mt-2"><FormError message={moaError} /></div>
      </ConfirmDialog>
      {editing && (
        <ScreeningDialog
          companyId={company.id}
          screening={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void loadScreenings();
          }}
        />
      )}
    </>
  );
}

function ScreeningDialog({ companyId, screening, onClose, onSaved }: { companyId: number; screening: Screening | null; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<Record<string, string>>(() => ({
    screened_on: screening?.screened_on ?? today,
    decision: screening?.decision ?? "pass",
    notes: screening?.notes ?? "",
    ...Object.fromEntries(CRITERIA.flatMap(({ key }) => [[key, screening ? String(screening[key]) : ""], [`${key}_note`, (screening?.[`${key}_note` as `${CriterionKey}_note`] as string | null) ?? ""]])),
  }));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: string) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const body = {
        screened_on: form.screened_on,
        decision: form.decision,
        notes: form.notes,
        ...Object.fromEntries(CRITERIA.flatMap(({ key }) => [[key, Number(form[key])], [`${key}_note`, form[`${key}_note`]]])),
        ...(screening ? { expected_version: screening.version } : {}),
      };
      const data = await coordinatorRequest<{ message: string }>(
        screening ? `/api/coordinator/company-screenings/${screening.id}` : `/api/coordinator/company-records/${companyId}/screenings`,
        { method: screening ? "PUT" : "POST", body }
      );
      toast.success(data.message);
      onSaved();
    } catch (saveError) {
      setError(errorText(saveError, "The screening could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      open
      title={screening ? "Edit the screening" : "Record a screening"}
      message="Rate each from 1 (poor) to 5 (excellent). A note helps whoever decides next."
      confirmLabel={screening ? "Save the screening" : "Record the screening"}
      busy={busy}
      onConfirm={() => void save()}
      onCancel={onClose}
    >
      <div className="space-y-3">
        <FormField label="Screened on" htmlFor="screened-on">
          <input id="screened-on" type="date" className="field" value={form.screened_on} onChange={(event) => set("screened_on")(event.target.value)} />
        </FormField>
        {CRITERIA.map(({ key, label }) => (
          <div key={key} className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <FormField label={label} htmlFor={`screen-${key}`}>
              <select id={`screen-${key}`} className="field" value={form[key]} onChange={(event) => set(key)(event.target.value)}>
                <option value="">Rate</option>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </FormField>
            <FormField label={`${label} note`} htmlFor={`screen-${key}-note`} optional>
              <input id={`screen-${key}-note`} className="field" maxLength={500} value={form[`${key}_note`]} onChange={(event) => set(`${key}_note`)(event.target.value)} />
            </FormField>
          </div>
        ))}
        <FormField label="Decision" htmlFor="screen-decision">
          <select id="screen-decision" className="field" value={form.decision} onChange={(event) => set("decision")(event.target.value)}>
            <option value="pass">Passed</option>
            <option value="conditional">Passed with conditions</option>
            <option value="fail">Failed</option>
          </select>
        </FormField>
        <FormField label={form.decision === "conditional" ? "The conditions" : "Notes"} htmlFor="screen-notes" optional={form.decision !== "conditional"}>
          <textarea id="screen-notes" className="field min-h-20" maxLength={2000} value={form.notes} onChange={(event) => set("notes")(event.target.value)} />
        </FormField>
        <FormError message={error} />
      </div>
    </ConfirmDialog>
  );
}

type Request = {
  id: number;
  requested_by_role: "student" | "coordinator";
  requested_by_name: string | null;
  company_name: string;
  hte_type: HteType;
  address: string | null;
  contact: string | null;
  reason: string;
  status: "submitted" | "screening" | "approved" | "rejected";
  decision_note: string | null;
  version: number;
  created_at: string;
};

const REQUEST_WORDS: Record<Request["status"], string> = { submitted: "New", screening: "Being screened", approved: "Approved", rejected: "Declined" };

/** The agencies students and coordinators suggest, newest waiting first. */
export function CompanyRequests({ onCompanyMade }: { onCompanyMade: () => void }) {
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [error, setError] = useState("");
  const [deciding, setDeciding] = useState<{ request: Request; decision: "screening" | "approve" | "reject" } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [noteError, setNoteError] = useState("");

  const load = useCallback(async () => {
    try {
      setRequests((await coordinatorRequest<{ requests: Request[] }>("/api/coordinator/company-requests")).requests);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "The suggestions could not be loaded."));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const decide = async () => {
    if (!deciding) return;
    setBusy(true);
    setNoteError("");
    try {
      const data = await coordinatorRequest<{ message: string }>(`/api/coordinator/company-requests/${deciding.request.id}/decision`, {
        method: "PUT",
        body: { decision: deciding.decision, note, expected_version: deciding.request.version },
      });
      toast.success(data.message);
      setDeciding(null);
      setNote("");
      await load();
      if (deciding.decision === "approve") onCompanyMade();
    } catch (decideError) {
      setNoteError(errorText(decideError, "The suggestion could not be decided."));
    } finally {
      setBusy(false);
    }
  };

  const open = (requests ?? []).filter((item) => item.status === "submitted" || item.status === "screening");
  if (requests !== null && open.length === 0 && !error) return null;

  return (
    <Card>
      <CardHeader icon="inbox" title="Agency suggestions" description="Agencies students and coordinators suggested. Approving one records it, in screening." />
      {error ? (
        <div className="p-4"><ErrorNotice message={error} onRetry={() => void load()} /></div>
      ) : requests === null ? (
        <div className="p-4"><SkeletonRows rows={2} /></div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {open.map((item) => (
            <li key={item.id} className="px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                    {item.company_name}
                    <StatusBadge status={HTE_TYPE_WORDS[item.hte_type]} tone="neutral" />
                    <StatusBadge status={REQUEST_WORDS[item.status]} tone="waiting" />
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    Suggested by {item.requested_by_name ?? item.requested_by_role} on {formatDate(item.created_at)}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">{item.reason}</p>
                  {(item.address || item.contact) && <p className="mt-0.5 text-sm text-slate-600">{[item.address, item.contact].filter(Boolean).join(", ")}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.status === "submitted" && (
                    <Button variant="secondary" onClick={() => setDeciding({ request: item, decision: "screening" })}>Screen it</Button>
                  )}
                  <Button variant="secondary" onClick={() => setDeciding({ request: item, decision: "approve" })}>Approve</Button>
                  <Button variant="secondary" onClick={() => setDeciding({ request: item, decision: "reject" })}>Decline</Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={deciding !== null}
        title={deciding ? `${deciding.decision === "approve" ? "Approve" : deciding.decision === "reject" ? "Decline" : "Screen"} ${deciding.request.company_name}?` : ""}
        message={
          deciding?.decision === "approve"
            ? `${deciding.request.company_name} is recorded as a company, in screening. No student is placed there until it is approved.`
            : deciding?.decision === "reject"
              ? "Say why: whoever suggested it is told."
              : "Marks the suggestion as being looked at."
        }
        confirmLabel={deciding ? (deciding.decision === "approve" ? "Approve" : deciding.decision === "reject" ? "Decline" : "Screen it") : ""}
        tone={deciding?.decision === "reject" ? "danger" : "primary"}
        busy={busy}
        onConfirm={() => void decide()}
        onCancel={() => setDeciding(null)}
      >
        {deciding?.decision === "reject" && (
          <FormField label="Why" htmlFor="request-note">
            <input id="request-note" className="field" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
          </FormField>
        )}
        <div className="mt-2"><FormError message={noteError} /></div>
      </ConfirmDialog>
    </Card>
  );
}
