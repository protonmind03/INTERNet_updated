import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Icon from "./Icon";
import { Card, EmptyState, ErrorNotice, SkeletonRows } from "./ui";
import { API_URL, withRoleAuth } from "../lib/api";
import { formatDateTime } from "../lib/format";
import type { SessionRole } from "../lib/session";

/*
| PSU redesign, More, Messages: the signed-in person's message threads,
| newest first (GET /api/messages/threads). A thread opens in the same
| composer a "New message" notification opens (?thread=, MessageThreadHost
| in each layout), to read and reply. Writing a new message stays where it
| was: from a person's page or "Message your supervisor".
*/

type ThreadRow = {
  id: number;
  subject: string;
  context_label: string | null;
  last_message_at: string;
  last_body: string | null;
  unread: number;
  with: { role: string; name: string };
};

const ROLE_WORD: Record<string, string> = { student: "Trainee", supervisor: "Supervisor", coordinator: "Coordinator" };

export default function MessagesList({ role }: { role: SessionRole }) {
  const [threads, setThreads] = useState<ThreadRow[] | null>(null);
  const [error, setError] = useState("");
  const [params, setParams] = useSearchParams();
  const openId = params.get("thread");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/messages/threads`, withRoleAuth(role));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not load your messages.");
      setThreads(data.threads || []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your messages.");
    }
  }, [role]);

  // Load again when a thread closes (its messages are now read) and when a notification arrives.
  useEffect(() => {
    if (openId) return;
    const refresh = () => void load();
    refresh();
    window.addEventListener("internet-notification", refresh);
    return () => window.removeEventListener("internet-notification", refresh);
  }, [load, openId]);

  if (error) return <ErrorNotice message={error} onRetry={() => void load()} />;
  return (
    <Card>
      {threads === null ? (
        <SkeletonRows rows={4} />
      ) : threads.length === 0 ? (
        <EmptyState icon="chat" title="No messages yet" description="Messages you send or receive appear here." />
      ) : (
        <ul className="divide-y divide-(--role-hairline)">
          {threads.map((thread) => (
            <li key={thread.id}>
              <button
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set("thread", String(thread.id));
                  setParams(next);
                }}
                className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-psu-50/50"
              >
                <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-psu-50 text-psu-700">
                  <Icon name="chat" size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={`truncate text-[15px] ${thread.unread ? "font-extrabold" : "font-semibold"} text-slate-900`}>{thread.with.name}</span>
                    <span className="tabular shrink-0 text-[12.5px] text-slate-500">{formatDateTime(thread.last_message_at)}</span>
                  </span>
                  <span className="block truncate text-[13.5px] font-medium text-slate-700">
                    {ROLE_WORD[thread.with.role] ?? ""} · {thread.subject}
                  </span>
                  {thread.last_body && <span className="block truncate text-[13.5px] text-slate-500">{thread.last_body}</span>}
                </span>
                {thread.unread > 0 && (
                  <span className="st-badge st-badge--bad shrink-0">
                    {thread.unread} new
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
