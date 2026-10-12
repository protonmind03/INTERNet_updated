import { useCallback, useEffect, useState } from "react";
import { Button, Skeleton } from "./ui";
import { API_URL, withRoleAuth } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { errorText } from "../lib/toast";

type Note = {
  id: number;
  author_role: "supervisor" | "coordinator";
  author_name: string;
  message: string;
  created_at: string;
  /** Written by the person reading. */
  mine: boolean;
};

/**
 * The notes about one student between their supervisor and the OJT
 * coordinators. The student never sees them. The same component is on the
 * supervisor's intern page and on the coordinator's student record; `role`
 * is the person looking at it. A note cannot be changed or removed once
 * sent, so the thread stays a record of what was said.
 */
export default function StudentNotes({
  studentId,
  studentName,
  role,
}: {
  studentId: string;
  studentName: string;
  role: "supervisor" | "coordinator";
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const path = `${API_URL}/api/student-notes/${encodeURIComponent(studentId)}`;
  const other = role === "supervisor" ? "the OJT coordinator" : "the supervisor";

  const load = useCallback(async () => {
    try {
      const response = await fetch(path, withRoleAuth(role));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not load the notes.");
      setNotes(Array.isArray(data.notes) ? data.notes : []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the notes."));
    } finally {
      setLoading(false);
    }
  }, [path, role]);

  useEffect(() => {
    const refresh = () => {
      void load();
    };
    refresh();
    // A note from the other side arrives as a live notification.
    window.addEventListener("internet-notification", refresh);
    return () => window.removeEventListener("internet-notification", refresh);
  }, [load]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch(
        path,
        withRoleAuth(role, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: draft.trim() }),
        })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "The note could not be sent.");
      setNotes((current) => [...current, data.note]);
      setDraft("");
    } catch (sendError) {
      setError(errorText(sendError, "The note could not be sent."));
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <p className="text-sm text-slate-600">
        Between you and {other}, about {studentName}. {studentName.split(/\s+/)[0] || "The student"} cannot
        see these notes. A note cannot be changed once it is sent.
      </p>

      <div className="mt-4">
        {loading ? (
          <Skeleton className="h-12 w-full" />
        ) : notes.length === 0 ? (
          <p className="text-sm text-slate-600">No notes yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {notes.map((note) => (
              <li key={note.id} className={`flex ${note.mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 ${
                    note.mine ? "bg-psu-50 text-psu-950" : "bg-slate-100 text-slate-800"
                  }`}
                >
                  <p className="text-xs font-medium text-slate-600">
                    {note.mine ? "You" : note.author_name}
                    {!note.mine && (note.author_role === "coordinator" ? " (coordinator)" : " (supervisor)")} ·{" "}
                    {formatDateTime(note.created_at)}
                  </p>
                  <p className="mt-0.5 whitespace-pre-line break-words text-sm">{note.message}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={send} className="mt-4 flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Your note</span>
          <textarea
            rows={2}
            maxLength={2000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Write a note to ${other}`}
            className="field resize-none"
          />
        </label>
        <Button type="submit" busy={sending} doneLabel="Sent" failed={Boolean(error)} disabled={!draft.trim()}>
          Send
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
