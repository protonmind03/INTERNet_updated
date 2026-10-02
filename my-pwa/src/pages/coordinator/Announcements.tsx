import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorNotice,
  FormError,
  FormField,
  SkeletonRows,
  StatusBadge,
} from "../../components/ui";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { formatDateTime } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";

type Audience = "students" | "supervisors" | "everyone";

type Announcement = {
  id: number;
  title: string;
  message: string;
  audience: Audience;
  /** Set when it went to one host company only. */
  company: string | null;
  recipients: number;
  created_at: string;
};

const AUDIENCES: { value: Audience; label: string; sent: string }[] = [
  { value: "students", label: "All students", sent: "Students" },
  { value: "supervisors", label: "All supervisors", sent: "Supervisors" },
  { value: "everyone", label: "Students and supervisors", sent: "Everyone" },
];

export default function CoordinatorAnnouncements() {
  const [history, setHistory] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<Audience>("students");
  const [companies, setCompanies] = useState<string[]>([]);
  const [company, setCompany] = useState("");
  const [withdrawing, setWithdrawing] = useState<Announcement | null>(null);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await coordinatorRequest<{ announcements: Announcement[] }>(
        "/api/coordinator/announcements"
      );
      setHistory(data.announcements || []);
      setLoadError("");
    } catch (requestError) {
      setLoadError(errorText(requestError, "Could not load past announcements."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  useEffect(() => {
    coordinatorRequest<{ companies: string[] }>("/api/coordinator/companies")
      .then((data) => setCompanies(data.companies || []))
      .catch(() => undefined);
  }, []);

  const withdraw = async () => {
    if (!withdrawing) return;
    setWithdrawBusy(true);
    try {
      await coordinatorRequest(`/api/coordinator/announcements/${withdrawing.id}`, {
        method: "DELETE",
      });
      toast.success("Announcement withdrawn. It was removed from everyone's notifications.");
      setWithdrawing(null);
      await load();
    } catch (withdrawError) {
      toast.error(errorText(withdrawError, "The announcement could not be withdrawn."));
    } finally {
      setWithdrawBusy(false);
    }
  };

  const review = (event: React.FormEvent) => {
    event.preventDefault();
    if (title.trim().length < 3) return setError("Give the announcement a title.");
    if (message.trim().length < 5) return setError("Write the announcement.");
    setError("");
    setConfirming(true);
  };

  const send = async () => {
    setSending(true);
    try {
      const data = await coordinatorRequest<{ message: string }>(
        "/api/coordinator/announcements",
        {
          method: "POST",
          body: { title: title.trim(), message: message.trim(), audience, company: company || null },
        }
      );
      toast.success(data.message);
      setTitle("");
      setMessage("");
      setConfirming(false);
      await load();
    } catch (sendError) {
      setConfirming(false);
      setError(errorText(sendError, "The announcement could not be sent."));
    } finally {
      setSending(false);
    }
  };

  const chosen = AUDIENCES.find((option) => option.value === audience)!;

  return (
    <CoordinatorLayout
      title="Announcements"
      subtitle="Send one message to students, supervisors, or both, across the programme or at one company. It arrives as a notification."
    >
      <div className="grid items-start gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <form onSubmit={review} className="space-y-4 p-4 sm:p-5" noValidate>
            <h2 className="text-sm font-semibold text-slate-900">New announcement</h2>

            <FormField label="Send to" htmlFor="announcement-audience">
              <select
                id="announcement-audience"
                value={audience}
                onChange={(event) => setAudience(event.target.value as Audience)}
                className="field"
              >
                {AUDIENCES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>

            {companies.length > 1 && (
              <FormField label="Company" htmlFor="announcement-company" optional>
                <select
                  id="announcement-company"
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  className="field"
                >
                  <option value="">All companies</option>
                  {companies.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </FormField>
            )}

            <FormField label="Title" htmlFor="announcement-title">
              <input
                id="announcement-title"
                type="text"
                maxLength={120}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="For example, Mid-term reports due Friday"
                className="field"
              />
            </FormField>

            <FormField label="Message" htmlFor="announcement-message">
              <textarea
                id="announcement-message"
                rows={6}
                maxLength={2000}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="field resize-none"
              />
              <p className="mt-1 text-right text-xs text-slate-400">{message.length} / 2000</p>
            </FormField>

            <FormError message={error} />

            <Button type="submit">Review and send</Button>
          </form>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title="Sent announcements" description="Newest first" />
          <div className="mt-3">
            {loadError && (
              <div className="px-4 pb-3 sm:px-5">
                <ErrorNotice message={loadError} onRetry={() => void load()} />
              </div>
            )}
            {loading ? (
              <SkeletonRows rows={3} />
            ) : history.length === 0 ? (
              <EmptyState
                icon="megaphone"
                title="Nothing sent yet"
                description="Announcements you send are kept here as a record."
              />
            ) : (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {history.map((item) => (
                  <li key={item.id} className="px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      <StatusBadge
                        status={
                          AUDIENCES.find((option) => option.value === item.audience)?.sent ||
                          item.audience
                        }
                        tone="info"
                      />
                    </div>
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
                      {item.message}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      {formatDateTime(item.created_at)} · sent to {item.recipients}{" "}
                      {item.recipients === 1 ? "person" : "people"}
                      {item.company && ` at ${item.company}`}
                    </p>
                    <button
                      type="button"
                      onClick={() => setWithdrawing(item)}
                      className="mt-1.5 text-sm font-medium text-red-600 hover:underline"
                    >
                      Withdraw
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Send this announcement?"
        message={`It goes to ${chosen.label.toLowerCase()}${
          company ? ` at ${company}` : ""
        } straight away. You can withdraw it afterwards, but people may already have read it.`}
        confirmLabel="Send"
        busy={sending}
        onConfirm={() => void send()}
        onCancel={() => setConfirming(false)}
      >
        <div className="rounded-lg bg-slate-50 px-3.5 py-3">
          <p className="text-sm font-semibold text-slate-900">{title.trim()}</p>
          <p className="mt-1 line-clamp-6 whitespace-pre-line text-sm text-slate-700">
            {message.trim()}
          </p>
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={withdrawing !== null}
        title="Withdraw this announcement?"
        message={
          withdrawing
            ? `"${withdrawing.title}" will be removed from this list and from the notifications of everyone it was sent to. People who already read it will simply stop seeing it.`
            : undefined
        }
        confirmLabel="Withdraw"
        cancelLabel="Keep it"
        tone="danger"
        busy={withdrawBusy}
        onConfirm={() => void withdraw()}
        onCancel={() => setWithdrawing(null)}
      />
    </CoordinatorLayout>
  );
}
