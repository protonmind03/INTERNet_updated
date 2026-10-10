import { useState } from "react";
import Icon from "../../components/Icon";
import { Button, Card, Modal } from "../../components/ui";
import { API_URL, withStudentAuth } from "../../lib/api";
import { formatLongDate, localDateKey } from "../../lib/format";
import { errorText, toast, withWorkingToast } from "../../lib/toast";
import { usePrivacy, type PrivacyNotice } from "./usePrivacy";

/*
|--------------------------------------------------------------------------
| PRIVACY: THE NOTICE, AGREEING TO IT, AND "DOWNLOAD MY DATA"
|--------------------------------------------------------------------------
|
| The notice comes from the server, with its version. A student agrees to
| it before their first time-in, which is when the app first takes their
| photo, and again whenever the notice changes.
|
*/

/**
 * The notice itself. With `onAgree` it is the consent step, and closing it
 * without agreeing leaves things as they were; without, it is for reading.
 */
export function PrivacyNoticeDialog({
  notice,
  onClose,
  onAgree,
}: {
  notice: PrivacyNotice;
  onClose: () => void;
  onAgree?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const agree = async () => {
    if (!onAgree) return;
    setBusy(true);
    setError("");
    try {
      await onAgree();
    } catch (agreeError) {
      setError(errorText(agreeError, "Your agreement could not be recorded."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={notice.title}
      description={
        onAgree ? "Please read this before your first time-in, which takes your photo." : undefined
      }
      locked={busy}
      size="lg"
      footer={
        onAgree ? (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Not now
            </Button>
            <Button icon="check" onClick={() => void agree()} busy={busy} failed={Boolean(error)}>
              {busy ? "Saving" : "I agree"}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {notice.placeholder && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-950 ring-1 ring-inset ring-amber-600/20">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-amber-600" />
            <span>
              <span className="font-semibold">Draft wording.</span> This notice has not yet been
              approved by the university. When the approved notice replaces it, you will be asked
              to read and agree again.
            </span>
          </p>
        )}
        {notice.sections.map((section) => (
          <section key={section.heading}>
            <h3 className="text-sm font-semibold text-slate-900">{section.heading}</h3>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{section.body}</p>
          </section>
        ))}
        {error && (
          <p role="alert" className="flex items-start gap-2 text-sm text-red-700">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Downloads everything the system holds that is the student's, as one file. */
async function downloadMyData(studentId: string): Promise<void> {
  const response = await withWorkingToast("Preparing your data…", () =>
    fetch(
      `${API_URL}/api/students/${encodeURIComponent(studentId)}/data-export`,
      withStudentAuth()
    )
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Your data could not be prepared.");
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = window.document.createElement("a");
  link.href = objectUrl;
  link.download = `internet-my-data-${localDateKey(new Date())}.json`;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/** The Profile page's privacy card. */
export function PrivacyCard({ studentId }: { studentId: string }) {
  const { state, agree } = usePrivacy(studentId);
  const [reading, setReading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      await downloadMyData(studentId);
      toast.success("Your data was downloaded.");
    } catch (downloadError) {
      toast.error(errorText(downloadError, "Your data could not be prepared."));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-slate-900">Privacy</h2>
      {state && (
        <p className="mt-2 text-sm text-slate-600">
          {state.current && state.consent_at
            ? `You agreed to the privacy notice on ${formatLongDate(state.consent_at)}.`
            : state.consent_at
              ? "The privacy notice has changed since you agreed to it. You will be asked to read it again before your next time-in."
              : "You have not agreed to the privacy notice yet. You will be asked to before your first time-in."}
        </p>
      )}
      <p className="mt-2 text-sm text-slate-600">
        You can download a copy of everything INTERNet holds that is yours: your account,
        attendance, tasks, documents, journals and evaluations. Photos and uploaded files are
        listed by name.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {state && (
          <Button variant="secondary" icon="note" onClick={() => setReading(true)}>
            Read the privacy notice
          </Button>
        )}
        <Button
          variant="secondary"
          icon="download"
          onClick={() => void download()}
          busy={downloading}
          busyLabel="Preparing"
        >
          Download my data
        </Button>
      </div>

      {reading && state && (
        <PrivacyNoticeDialog
          notice={state.notice}
          onClose={() => setReading(false)}
          onAgree={
            state.current
              ? undefined
              : async () => {
                  await agree();
                  setReading(false);
                  toast.success("Thank you. Your agreement has been recorded.");
                }
          }
        />
      )}
    </Card>
  );
}
