import { useEffect, useState } from "react";
import { Card, SkeletonRows } from "../../components/ui";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";

type Status = {
  email: {
    on: boolean;
    through: "provider" | "smtp" | null;
    reset_links: boolean;
    daily_limit: number | null;
    kept_for_password_resets: number | null;
    sent_today: number | null;
  };
  push: { on: boolean };
  files: { kept_in: string };
  privacy: {
    consent_asked: boolean;
    notice_is_placeholder: boolean;
    photo_retention_days: number | null;
    /** The Philippine time the nightly clean-up runs. Missing from an older server. */
    photo_purge_time?: string;
    last_photo_purge?: { ran_at: string; retention_days: number; removed: number; failed: number; by_hand: boolean } | null;
  };
};

type Problem = {
  id: number;
  source: "server" | "browser";
  label: string;
  detail: string;
  route: string;
  times: number;
  first_seen: string;
  last_seen: string;
};

const when = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Which parts of the system that depend on the host's settings are on:
 * email, push, where files are kept, the privacy switches. It says what
 * each means for the people using the system, and lets the coordinator
 * send themselves a test email. It never shows a setting's value.
 */
export default function SystemStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [problems, setProblems] = useState<Problem[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    coordinatorRequest<{ problems: Problem[] }>("/api/coordinator/problems", { signal: controller.signal })
      .then((data) => setProblems(data.problems))
      .catch(() => {
        /* A server from before this list: the section is left out. */
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    coordinatorRequest<Status>("/api/coordinator/system-status", { signal: controller.signal })
      .then(setStatus)
      .catch(() => {
        // A server from before this page answers "not found": show nothing.
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, []);

  if (failed) return null;

  const sendTest = async () => {
    setSending(true);
    try {
      const data = await coordinatorRequest<{ message: string }>("/api/coordinator/email-test", {
        method: "POST",
      });
      toast.success(data.message);
    } catch (sendError) {
      toast.error(errorText(sendError, "The test email could not be sent."));
    } finally {
      setSending(false);
    }
  };

  const checkStorage = async () => {
    setChecking(true);
    try {
      const data = await coordinatorRequest<{ message: string }>("/api/coordinator/storage-test", {
        method: "POST",
      });
      toast.success(data.message);
    } catch (checkError) {
      toast.error(errorText(checkError, "The file storage could not be checked."));
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-slate-900">What is switched on</h2>
      <p className="mt-1 text-sm text-slate-600">
        These depend on settings of the server, which whoever looks after the hosting changes.
        The steps are in the deployment notes.
      </p>
      {status === null ? (
        <div className="mt-3">
          <SkeletonRows rows={4} />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
          <Line
            name="Email"
            on={status.email.on}
            about={emailText(status.email)}
            action={
              status.email.on ? (
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => void sendTest()}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {sending ? "Sending" : "Send me a test email"}
                </button>
              ) : null
            }
          />
          <Line
            name="Notifications to phones"
            on={status.push.on}
            about={
              status.push.on
                ? "People can turn them on for a device from their Profile, and send themselves a test there."
                : "Nobody can turn them on yet. Notifications still appear in the app."
            }
          />
          <Line
            name="Uploaded files"
            on={status.files.kept_in === "object storage"}
            state={status.files.kept_in === "object storage" ? "Object storage" : "Server disk"}
            about={
              status.files.kept_in === "object storage"
                ? "Photos and documents are kept in object storage."
                : "Photos and documents are kept on the server's own disk. They need their own backup."
            }
            action={
              <button
                type="button"
                disabled={checking}
                onClick={() => void checkStorage()}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {checking ? "Checking" : "Check file storage"}
              </button>
            }
          />
          <Line
            name="Privacy notice"
            on={status.privacy.consent_asked}
            state={status.privacy.consent_asked ? "Asked" : "Not asked"}
            about={
              (status.privacy.consent_asked
                ? "A student agrees to the notice before their first time-in."
                : "Students are not asked to agree before their first time-in.") +
              (status.privacy.notice_is_placeholder
                ? " The notice is still the sample wording, not the university's."
                : "")
            }
          />
          <Line
            name="Old time-in photos"
            on={status.privacy.photo_retention_days !== null}
            state={status.privacy.photo_retention_days !== null ? "Removed" : "Kept"}
            about={
              status.privacy.photo_retention_days !== null
                ? photoPurgeText(status.privacy)
                : "Kept with no limit."
            }
          />
        </ul>
      )}
      {problems !== null && (
        <section aria-labelledby="problems-heading" className="mt-4 border-t border-slate-100 pt-4">
          <h3 id="problems-heading" className="text-sm font-semibold text-slate-900">
            Problems the system noticed in the last 7 days
          </h3>
          {problems.length === 0 ? (
            <p className="mt-1 text-sm text-slate-600">None.</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-slate-600">
                Each line is one kind of fault. Tell whoever looks after the system what it says and
                how often. It does not say who was using the system.
              </p>
              <ul className="mt-2 divide-y divide-slate-100">
                {problems.map((problem) => (
                  <li key={problem.id} className="py-2.5">
                    <p className="break-words text-sm font-medium text-slate-900">{problem.label}</p>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {problem.source === "browser"
                        ? `In a browser${problem.route ? `, on ${problem.route}` : ""}`
                        : "On the server"}
                      {problem.detail ? ` (${problem.detail})` : ""}
                      {" · "}
                      {problem.times === 1 ? "once" : `${problem.times} times`}
                      {" · last "}
                      {when.format(new Date(problem.last_seen))}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </Card>
  );
}

function photoPurgeText(privacy: Status["privacy"]): string {
  const days = privacy.photo_retention_days;
  if (!privacy.photo_purge_time) return `Removed after ${days} days, when the clean-up is run.`;
  const last = privacy.last_photo_purge;
  const when = last ? new Date(last.ran_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }) : "";
  return (
    `Removed after ${days} days, every night at 2:30 AM Philippine time. ` +
    (last
      ? `Last run ${when}: ${last.removed === 1 ? "1 photo" : `${last.removed} photos`} removed${last.failed > 0 ? `, ${last.failed} could not be deleted` : ""}.`
      : "It has not run yet.")
  );
}

function emailText(email: Status["email"]): string {
  if (!email.on) {
    return "No email is sent. \"Forgot password\" does not work; reset a password from the person's row instead.";
  }
  const parts = [
    email.reset_links
      ? "Password reset, deadline reminders and summaries are sent."
      : "Reminders and summaries are sent, but password reset is not: the site's address is not set on the server.",
  ];
  if (email.daily_limit !== null && email.sent_today !== null) {
    parts.push(
      `${email.sent_today} of ${email.daily_limit} sent today; the last ${email.kept_for_password_resets} are kept for password resets.`
    );
  }
  return parts.join(" ");
}

function Line({
  name,
  on,
  state,
  about,
  action,
}: {
  name: string;
  on: boolean;
  state?: string;
  about: string;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1 basis-56">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
          {name}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              on ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"
            }`}
          >
            {state ?? (on ? "On" : "Off")}
          </span>
        </p>
        <p className="mt-0.5 text-sm text-slate-600">{about}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </li>
  );
}
