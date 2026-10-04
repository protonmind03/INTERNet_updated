import { useCallback, useEffect, useState } from "react";
import { Button, Skeleton } from "./ui";
import { API_URL, withRoleAuth } from "../lib/api";
import { formatDateTime } from "../lib/format";
import type { SessionRole } from "../lib/session";
import { errorText } from "../lib/toast";

type Message = {
  id: number;
  author_role: SessionRole;
  author_name: string | null;
  message: string;
  created_at: string;
};

const ROLE_LABELS: Record<SessionRole, string> = {
  student: "Student",
  supervisor: "Supervisor",
  coordinator: "OJT coordinator",
};

/**
 * The conversation on one complaint, between whoever filed it and the
 * coordinator. The same component serves all three portals; `role` is the
 * person looking at it.
 */
export default function ComplaintThread({
  complaintId,
  role,
}: {
  complaintId: number;
  role: SessionRole;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/complaints/${complaintId}/messages`,
        withRoleAuth(role)
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not load the conversation.");
      setMessages(data.messages || []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the conversation."));
    } finally {
      setLoading(false);
    }
  }, [complaintId, role]);

  useEffect(() => {
    const refresh = () => {
      void load();
    };
    refresh();
    // A reply from the other side arrives as a live notification.
    window.addEventListener("internet-notification", refresh);
    return () => window.removeEventListener("internet-notification", refresh);
  }, [load]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (draft.trim().length < 2) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch(
        `${API_URL}/api/complaints/${complaintId}/messages`,
        withRoleAuth(role, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: draft.trim() }),
        })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "The reply could not be sent.");
      setMessages((current) => [...current, data.reply]);
      setDraft("");
    } catch (sendError) {
      setError(errorText(sendError, "The reply could not be sent."));
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-slate-700">Conversation</p>

      {loading ? (
        <Skeleton className="h-12 w-full" />
      ) : messages.length === 0 ? (
        <p className="text-sm text-slate-500">
          No replies yet.{" "}
          {role === "coordinator"
            ? "Ask a follow-up question here."
            : "You can add details or ask about progress here."}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {messages.map((item) => {
            const mine = item.author_role === role;
            return (
              <li key={item.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 ${
                    mine ? "bg-psu-50 text-psu-950" : "bg-slate-100 text-slate-800"
                  }`}
                >
                  <p className="text-xs font-medium text-slate-500">
                    {mine ? "You" : item.author_name || ROLE_LABELS[item.author_role]}
                    {!mine && item.author_role === "coordinator" && " (coordinator)"} ·{" "}
                    {formatDateTime(item.created_at)}
                  </p>
                  <p className="mt-0.5 whitespace-pre-line text-sm">{item.message}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={send} className="mt-3 flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Your reply</span>
          <textarea
            rows={2}
            maxLength={2000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Write a reply"
            className="field resize-none"
          />
        </label>
        <Button type="submit" busy={sending} doneLabel="Sent" failed={Boolean(error)} disabled={draft.trim().length < 2}>
          Send
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
