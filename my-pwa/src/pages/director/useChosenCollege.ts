import { useSearchParams } from "react-router-dom";

/* The college chosen on the marks (CollegeRail.tsx), kept in the address as ?college=. */

export type RailCollege = { id: number; name: string; short_name: string | null; mark_key?: string | null };

/** The chosen college's id from the address, or null for every college. */
export function useChosenCollege(): [number | null, (id: number | null) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("college");
  const chosen = raw && /^\d{1,9}$/.test(raw) ? Number(raw) : null;
  const choose = (id: number | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (id === null) next.delete("college");
        else next.set("college", String(id));
        return next;
      },
      { replace: true }
    );
  return [chosen, choose];
}
