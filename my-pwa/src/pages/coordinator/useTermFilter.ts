import { useCallback, useEffect, useState } from "react";
import { coordinatorRequest } from "./request";

/*
 * The coordinator's chosen term, shared by the pages that can filter by it
 * (Students and Monitoring). The choice is kept for the browser session, so
 * it carries from one page to the other. "" means every term; "none" means
 * students with no term.
 */

export type TermOption = { id: number; name: string; is_closed: boolean };

const KEY = "inb_coordinator_term";
let cachedTerms: TermOption[] | null = null;

function stored(): string {
  try {
    return sessionStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function useTermFilter(initial?: string | null) {
  // A term named in the page's address (a link from the Terms page) wins.
  const [term, setTermState] = useState(() => initial ?? stored());
  const [terms, setTerms] = useState<TermOption[]>(cachedTerms ?? []);

  useEffect(() => {
    let active = true;
    coordinatorRequest<{ terms: TermOption[] }>("/api/coordinator/terms")
      .then((data) => {
        cachedTerms = data.terms || [];
        if (!active) return;
        setTerms(cachedTerms);
        // A remembered term that no longer exists would hide everyone.
        setTermState((current) =>
          current && current !== "none" && !cachedTerms!.some((item) => String(item.id) === current)
            ? ""
            : current
        );
      })
      .catch(() => {
        // The pages still work without the term filter.
      });
    return () => {
      active = false;
    };
  }, []);

  const setTerm = useCallback((next: string) => {
    setTermState(next);
    try {
      if (next) sessionStorage.setItem(KEY, next);
      else sessionStorage.removeItem(KEY);
    } catch {
      /* private mode: the choice lasts for this page only */
    }
  }, []);

  return { term, setTerm, terms };
}
