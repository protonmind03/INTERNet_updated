import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_URL, withRoleAuth } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { errorText } from "../lib/toast";
import Icon from "./Icon";

type Sent = {
  id: number;
  title: string;
  audience: "students" | "supervisors" | "everyone";
  company: string | null;
  recipients: number;
  /** Missing from an older server. */
  read_count?: number;
  created_at: string;
};

const AUDIENCE: Record<Sent["audience"], string> = {
  students: "Students",
  supervisors: "Supervisors",
  everyone: "Everyone",
};

/**
 * Roadmap 5.7: announcements left the coordinator's side navigation, so the
 * bell's second tab is where they are written and followed. New
 * announcement opens the page with the form; the list is what was sent,
 * newest first, with how many have seen each.
 */
export default function SentAnnouncements() {
  const [items, setItems] = useState<Sent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/coordinator/announcements`, withRoleAuth("coordinator"));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not load the announcements.");
      setItems((data.announcements || []).slice(0, 8));
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the announcements."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
        <Link
          to="/coordinator/announcements"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-psu-700 px-3 text-sm font-semibold text-white hover:bg-psu-800"
        >
          <Icon name="megaphone" size={16} />
          New announcement
        </Link>
        <Link to="/coordinator/announcements" className="text-xs font-semibold text-psu-700 hover:underline">
          All sent
        </Link>
      </div>
      {loading ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <p role="alert" className="px-4 py-6 text-center text-sm text-red-700">
          {error}
        </p>
      ) : items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing sent yet.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id} className="border-b border-slate-100 px-4 py-3 last:border-b-0">
              <p className="text-sm font-semibold text-slate-900">{item.title}</p>
              <p className="mt-0.5 text-xs text-slate-600">
                {item.company ? `${AUDIENCE[item.audience]} of ${item.company}` : AUDIENCE[item.audience]} ·{" "}
                {formatDateTime(item.created_at)}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                {item.read_count !== undefined
                  ? `Seen by ${item.read_count} of ${item.recipients}`
                  : `Sent to ${item.recipients}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
