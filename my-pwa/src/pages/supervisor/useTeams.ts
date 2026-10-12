import { useCallback, useEffect, useState } from "react";
import { API_URL, withSupervisorAuth } from "../../lib/api";
import { errorText } from "../../lib/toast";

export type Team = {
  id: number;
  name: string;
  members: { student_id: string; name: string; is_active: boolean }[];
};

/** The supervisor's teams (GET /api/supervisor/teams), and a way to ask again. */
export function useTeams() {
  const [list, setList] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/supervisor/teams`, withSupervisorAuth());
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not load your teams.");
      setList(Array.isArray(data.teams) ? data.teams : []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load your teams."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  return { list, loading, error, reload };
}

export type TeamsState = ReturnType<typeof useTeams>;
