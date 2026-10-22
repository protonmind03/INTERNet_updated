import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { API_URL, withRoleAuth } from "../lib/api";
import { cue } from "../lib/cues";
import { phStamp } from "../lib/phTime";
import type { SessionRole } from "../lib/session";
import { errorText, toast } from "../lib/toast";
import { useDraft } from "../lib/useDraft";
import Icon from "./Icon";
import { Button, FormError } from "./ui";

/*
|--------------------------------------------------------------------------
| WRITING A MESSAGE
|--------------------------------------------------------------------------
|
| One composer for every portal (backend routes/messages.ts). It is drawn
| over the whole page: the page behind is dimmed, blurred and made inert, the
| keyboard stays inside the dialog, and Esc closes it. What is typed is kept
| as a draft until it is sent, so closing by mistake loses nothing.
|
| New message: To is who it is for (read-only), the subject comes filled in,
| and an optional chip says what it is about (an attendance log, a student).
| Reply: the thread is shown above the reply box; it opens from the "New
| message" notification (?thread= on the portal's home, see MessageThreadHost).
|
*/

export const MESSAGE_MAX_LENGTH = 4000;

export type MessageRecipient = { role: SessionRole; id: string | number; name?: string; email?: string | null };
export type MessageContext = { type: "attendance" | "student" | "supervisor" | "appeal"; id: string | number; label: string };

type ThreadMessage = { id: number; mine: boolean; sender_name: string | null; body: string; created_at: string; delivery?: string };
type Thread = {
  thread: { id: number; subject: string; context_label: string | null };
  with: { role: SessionRole; id: string; name: string; email: string | null };
  messages: ThreadMessage[];
};

type Props = {
  /** Who is writing: the portal this is open in. */
  role: SessionRole;
  onClose: () => void;
} & (
  | { threadId: number; to?: undefined; subject?: undefined; context?: undefined }
  | { threadId?: undefined; to: MessageRecipient; subject: string; context?: MessageContext }
);

const ROLE_LABEL: Record<SessionRole, string> = {
  student: "Intern",
  supervisor: "Supervisor",
  coordinator: "OJT coordinator",
};

async function readJson(response: Response, fallback: string) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : fallback);
  return data;
}

export default function ComposeMessage(props: Props) {
  const { role, onClose } = props;
  const replyTo = props.threadId;
  const titleId = useId();
  const bodyId = useId();
  const subjectId = useId();
  const countId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const [recipient, setRecipient] = useState<MessageRecipient | null>(
    props.to && props.to.name ? props.to : null
  );
  const [thread, setThread] = useState<Thread | null>(null);
  const [subject, setSubject] = useState(props.subject ?? "");
  const [body, setBody] = useState("");
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const draftName = props.to
    ? `message-${props.to.role}-${props.to.id}${props.context ? `-${props.context.type}-${props.context.id}` : ""}`
    : `message-thread-${replyTo}`;
  const discardDraft = useDraft(role, draftName, body, setBody);

  // Who it is for (a new message whose caller knew only the id), or the thread being answered.
  const toRole = props.to?.role;
  const toId = props.to?.id;
  const knowsName = Boolean(props.to?.name);
  useEffect(() => {
    let active = true;
    const url = replyTo
      ? `${API_URL}/api/messages/threads/${replyTo}`
      : knowsName
        ? null
        : `${API_URL}/api/messages/recipient/${toRole}/${encodeURIComponent(String(toId))}`;
    if (!url) return;
    void fetch(url, withRoleAuth(role))
      .then((response) => readJson(response, "Could not open the message."))
      .then((data) => {
        if (!active) return;
        if (replyTo) {
          setThread(data as Thread);
          setRecipient(data.with);
        } else {
          setRecipient(data.recipient);
        }
      })
      .catch((failure) => {
        if (active) setLoadError(errorText(failure, "Could not open the message."));
      });
    return () => {
      active = false;
    };
  }, [replyTo, toRole, toId, knowsName, role]);

  // The page behind cannot be reached while this is open; focus comes back where it was.
  useEffect(() => {
    const root = document.getElementById("root");
    const before = document.activeElement as HTMLElement | null;
    root?.setAttribute("inert", "");
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      root?.removeAttribute("inert");
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, []);

  const close = useCallback(() => {
    if (!sending) onClose();
  }, [sending, onClose]);

  // Esc closes this dialog only (not a dialog it was opened from), and Tab stays inside it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = Array.from(
        dialog.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null || element === document.activeElement);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const inside = dialog.current.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close]);

  const ready = Boolean(recipient) && (!replyTo || Boolean(thread));
  useEffect(() => {
    if (ready) textarea.current?.focus();
    else dialog.current?.focus();
  }, [ready]);

  // The newest message of a thread is in view when it opens.
  const history = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = history.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [thread]);

  const send = async () => {
    const text = body.trim();
    if (!text) {
      setError("Write your message first.");
      textarea.current?.focus();
      return;
    }
    if (!replyTo && !subject.trim()) {
      setError("Give the message a subject.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const response = !props.to
        ? await fetch(
            `${API_URL}/api/messages/threads/${replyTo}`,
            withRoleAuth(role, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ body: text }),
            })
          )
        : await fetch(
            `${API_URL}/api/messages`,
            withRoleAuth(role, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to_role: props.to.role,
                to_id: String(props.to.id),
                subject: subject.trim(),
                body: text,
                context_type: props.context?.type,
                context_id: props.context ? String(props.context.id) : undefined,
                context_label: props.context?.label,
              }),
            })
          );
      const data = await readJson(response, "Could not send the message.");
      discardDraft();
      cue("committed");
      toast.success(typeof data.message === "string" ? data.message : "Sent.");
      onClose();
    } catch (failure) {
      cue("refused");
      setError(errorText(failure, "Could not send the message."));
    } finally {
      setSending(false);
    }
  };

  const contextLabel = thread?.thread.context_label ?? props.context?.label ?? null;
  const left = MESSAGE_MAX_LENGTH - body.length;
  const title = replyTo ? "Reply" : "New message";

  return createPortal(
    <div
      className="fixed inset-0 z-(--z-modal) flex animate-fade-in items-end justify-center bg-psu-950/50 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[92dvh] w-full animate-sheet-in flex-col rounded-t-2xl bg-white shadow-2xl outline-none sm:max-w-2xl sm:animate-dialog-in sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 rounded-t-2xl border-b border-slate-100 bg-psu-50/70 px-5 py-4">
          <h2 id={titleId} className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Icon name="mail" size={18} className="text-psu-700" />
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            disabled={sending}
            className="-mr-1.5 -mt-1 shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {loadError ? (
            <FormError message={loadError} />
          ) : !ready ? (
            <p className="py-6 text-center text-sm text-slate-500" role="status">
              Opening…
            </p>
          ) : (
            <>
              <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-2 text-sm">
                <dt className="font-medium text-slate-500">To</dt>
                <dd className="min-w-0 text-slate-900">
                  <span className="font-semibold">{recipient!.name}</span>
                  <span className="text-slate-500"> · {ROLE_LABEL[recipient!.role]}</span>
                  {recipient!.email && <span className="block truncate text-slate-500">{recipient!.email}</span>}
                </dd>
                {replyTo && (
                  <>
                    <dt className="font-medium text-slate-500">Subject</dt>
                    <dd className="min-w-0 text-slate-900">{thread!.thread.subject}</dd>
                  </>
                )}
              </dl>

              {contextLabel && (
                <p className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-psu-50 px-3 py-1 text-xs font-medium text-psu-800 ring-1 ring-inset ring-psu-600/20">
                  <Icon name="clipboard" size={14} className="shrink-0" />
                  <span className="sr-only">About: </span>
                  <span className="truncate">{contextLabel}</span>
                </p>
              )}

              {thread && thread.messages.length > 0 && (
                <section aria-label="Earlier messages">
                  <ol ref={history} className="max-h-64 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3">
                    {thread.messages.map((message) => (
                      <li
                        key={message.id}
                        className={`rounded-lg px-3 py-2 text-sm ${
                          message.mine ? "ml-6 bg-psu-50 ring-1 ring-inset ring-psu-600/15" : "mr-6 bg-white ring-1 ring-inset ring-slate-200"
                        }`}
                      >
                        <p className="text-xs text-slate-500">
                          <span className="font-semibold text-slate-700">{message.mine ? "You" : message.sender_name ?? recipient!.name}</span>
                          {" · "}
                          {phStamp(new Date(message.created_at))}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-slate-900">{message.body}</p>
                        {message.delivery && <p className="mt-1 text-xs text-slate-500">{message.delivery}</p>}
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {!replyTo && (
                <div>
                  <label htmlFor={subjectId} className="mb-1.5 block text-sm font-medium text-slate-700">
                    Subject
                  </label>
                  <input
                    id={subjectId}
                    className="field"
                    value={subject}
                    maxLength={150}
                    onChange={(event) => setSubject(event.target.value)}
                  />
                </div>
              )}

              <div>
                <label htmlFor={bodyId} className="mb-1.5 block text-sm font-medium text-slate-700">
                  {replyTo ? "Your reply" : "Message"}
                </label>
                <textarea
                  ref={textarea}
                  id={bodyId}
                  rows={8}
                  maxLength={MESSAGE_MAX_LENGTH}
                  aria-describedby={countId}
                  className="field resize-y"
                  value={body}
                  onChange={(event) => {
                    setBody(event.target.value);
                    if (error) setError("");
                  }}
                />
                <p
                  id={countId}
                  className={`mt-1 text-right text-xs tabular-nums ${left < 200 ? "font-semibold text-amber-800" : "text-slate-500"}`}
                  aria-live={left < 200 ? "polite" : "off"}
                >
                  {body.length.toLocaleString("en-PH")} of {MESSAGE_MAX_LENGTH.toLocaleString("en-PH")} characters
                </p>
              </div>
              <FormError message={error} />
            </>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={sending}>
            Close
          </Button>
          <Button icon="mail" onClick={() => void send()} busy={sending} failed={Boolean(error)} disabled={!ready}>
            Send
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
