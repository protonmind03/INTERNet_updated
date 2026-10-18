import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { coordinatorRequest } from "./request";
import { sameId } from "../../lib/ids";

/*
|--------------------------------------------------------------------------
| WHICH STUDENTS: THE COORDINATOR'S FILTERS
|--------------------------------------------------------------------------
|
| The coordinator's pages can be narrowed to some of the students: by term,
| college, program, block, company and supervisor. This hook holds that
| choice for every page that offers it, so it is made once and carries from
| page to page.
|
| The choice lives in two places:
|
|   the address    "?program=3&block=12". A filtered page can be bookmarked,
|                  sent to someone, or come back to with the Back button.
|   the session    so opening another page from the menu keeps the choice.
|                  A page opened with filters in its address uses those and
|                  ignores what was remembered.
|
| Each level narrows the next: a college leaves only its programs to choose
| from, a program only its blocks, a term only its blocks, a company only
| its supervisors. Choosing a level clears a choice below it that no longer
| fits.
|
| The server does the filtering (backend/src/services/studentScope.ts);
| `query` is what to add to a request.
|
*/

export const FILTER_KEYS = ["term", "college", "program", "block", "company", "supervisor"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type StudentFilters = Record<FilterKey, string>;

export type TermOption = { id: number; name: string; is_closed: boolean };
type College = { id: number; name: string; short_name: string | null; is_active: boolean };
type Program = { id: number; college_id: number; name: string; short_code: string; is_active: boolean };
type Block = {
  id: number;
  program_id: number;
  term_id: number | null;
  name: string;
  term_name: string | null;
  is_active: boolean;
};
type Company = { id: number; name: string; is_active: boolean };
type Supervisor = { supervisor_id: string; name: string; company_id?: number | null; is_active?: boolean };

export type FilterOptions = {
  terms: TermOption[];
  colleges: College[];
  programs: Program[];
  blocks: Block[];
  companies: Company[];
  supervisors: Supervisor[];
};

const EMPTY: StudentFilters = { term: "", college: "", program: "", block: "", company: "", supervisor: "" };
const NO_OPTIONS: FilterOptions = { terms: [], colleges: [], programs: [], blocks: [], companies: [], supervisors: [] };

const STORE = "inb_coordinator_filters";
/** Where the term alone was kept before there were other filters. */
const OLD_TERM_STORE = "inb_coordinator_term";

function remembered(): StudentFilters {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE) || "null") as Partial<StudentFilters> | null;
    if (saved && typeof saved === "object") {
      const filters = { ...EMPTY };
      for (const key of FILTER_KEYS) if (typeof saved[key] === "string") filters[key] = saved[key] as string;
      return filters;
    }
    return { ...EMPTY, term: sessionStorage.getItem(OLD_TERM_STORE) || "" };
  } catch {
    return { ...EMPTY };
  }
}

function remember(filters: StudentFilters): void {
  try {
    sessionStorage.setItem(STORE, JSON.stringify(filters));
    sessionStorage.removeItem(OLD_TERM_STORE);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
}

// Asked for once per visit, however many pages are opened.
let cached: FilterOptions | null = null;
let loading: Promise<FilterOptions> | null = null;

/** Forgets the lists, after the Programs page changed them. */
export function refreshFilterOptions(): void {
  cached = null;
  loading = null;
}

function loadOptions(): Promise<FilterOptions> {
  if (cached) return Promise.resolve(cached);
  // Each list is asked for by itself: a page still filters by the others
  // if one of them cannot be loaded.
  const list = <T,>(path: string, pick: (data: Record<string, unknown>) => unknown): Promise<T[]> =>
    coordinatorRequest<Record<string, unknown>>(path)
      .then((data) => (Array.isArray(pick(data)) ? (pick(data) as T[]) : []))
      .catch(() => []);
  loading ??= Promise.all([
    list<TermOption>("/api/coordinator/terms", (data) => data.terms),
    coordinatorRequest<{ colleges: College[]; programs: Program[]; blocks: Block[] }>("/api/coordinator/academics").catch(
      () => ({ colleges: [], programs: [], blocks: [] })
    ),
    list<Company>("/api/coordinator/company-records", (data) => data.companies),
    list<Supervisor>("/api/coordinator/supervisors", (data) => data.supervisors),
  ]).then(([terms, academics, companies, supervisors]) => {
    cached = {
      terms,
      colleges: academics.colleges || [],
      programs: academics.programs || [],
      blocks: academics.blocks || [],
      companies,
      supervisors,
    };
    return cached;
  });
  return loading;
}

/**
 * What can be chosen at each level, given what is chosen above it. An
 * inactive row is offered only while it is the one chosen, so a filter on
 * a closed term's block can still be seen and cleared.
 */
export function narrowed(options: FilterOptions, filters: StudentFilters): FilterOptions {
  const collegePrograms = (collegeId: string) =>
    new Set(options.programs.filter((item) => sameId(item.college_id, collegeId)).map((item) => item.id));
  const programs = options.programs.filter(
    (item) =>
      (item.is_active || sameId(item.id, filters.program)) &&
      (!filters.college || sameId(item.college_id, filters.college))
  );
  const inCollege = filters.college ? collegePrograms(filters.college) : null;
  const blocks = options.blocks.filter(
    (item) =>
      (item.is_active || sameId(item.id, filters.block)) &&
      (!filters.program || sameId(item.program_id, filters.program)) &&
      (!inCollege || inCollege.has(item.program_id)) &&
      (!filters.term || filters.term === "none"
        ? filters.term !== "none" || item.term_id === null
        : sameId(item.term_id, filters.term))
  );
  return {
    terms: options.terms,
    colleges: options.colleges.filter((item) => item.is_active || sameId(item.id, filters.college)),
    programs,
    blocks,
    companies: options.companies.filter((item) => item.is_active !== false || sameId(item.id, filters.company)),
    supervisors: options.supervisors.filter(
      (item) =>
        (item.is_active !== false || sameId(item.supervisor_id, filters.supervisor)) &&
        (!filters.company || sameId(item.company_id, filters.company))
    ),
  };
}

/** Clears the choices below `changed` that no longer fit what is above them. */
function settle(filters: StudentFilters, options: FilterOptions): StudentFilters {
  const next = { ...filters };
  const program = options.programs.find((item) => sameId(item.id, next.program));
  if (next.college && program && !sameId(program.college_id, next.college)) next.program = "";
  const block = options.blocks.find((item) => sameId(item.id, next.block));
  if (block) {
    const blockProgram = options.programs.find((item) => item.id === block.program_id);
    if (
      (next.program && !sameId(block.program_id, next.program)) ||
      (next.college && blockProgram && !sameId(blockProgram.college_id, next.college)) ||
      (next.term && next.term !== "none" && !sameId(block.term_id, next.term)) ||
      (next.term === "none" && block.term_id !== null)
    ) {
      next.block = "";
    }
  }
  const supervisor = options.supervisors.find((item) => sameId(item.supervisor_id, next.supervisor));
  if (next.company && supervisor && !sameId(supervisor.company_id, next.company)) next.supervisor = "";
  return next;
}

/**
 * `remember: false` is for a page where a filter left over from another
 * page would mislead (the audit log): it then uses its address only.
 */
export function useStudentFilters({ remember: remembers = true }: { remember?: boolean } = {}) {
  const [params, setParams] = useSearchParams();
  const [options, setOptions] = useState<FilterOptions>(cached ?? NO_OPTIONS);
  // Whether the choices have come (Iteration 14): until then the bar keeps its place empty.
  const [ready, setReady] = useState(cached !== null);

  useEffect(() => {
    let current = true;
    void loadOptions()
      .then((loaded) => {
        if (current) setOptions(loaded);
      })
      .finally(() => {
        if (current) setReady(true);
      });
    return () => {
      current = false;
    };
  }, []);

  const inAddress = FILTER_KEYS.some((key) => params.get(key));
  // The address wins. With none there, what was remembered is used.
  const filters = useMemo<StudentFilters>(() => {
    if (!inAddress) return remembers ? remembered() : { ...EMPTY };
    const read = { ...EMPTY };
    for (const key of FILTER_KEYS) read[key] = params.get(key) || "";
    return read;
  }, [params, inAddress, remembers]);

  const write = useCallback(
    (next: StudentFilters) => {
      if (remembers) remember(next);
      setParams(
        (current) => {
          const updated = new URLSearchParams(current);
          for (const key of FILTER_KEYS) {
            if (next[key]) updated.set(key, next[key]);
            else updated.delete(key);
          }
          // A list that pages starts again from its first page.
          updated.delete("page");
          return updated;
        },
        { replace: true }
      );
    },
    [remembers, setParams]
  );

  // A remembered choice is put in the address, so the page can be shared as it is seen.
  useEffect(() => {
    if (!inAddress && remembers && FILTER_KEYS.some((key) => filters[key])) write(filters);
  }, [inAddress, remembers, filters, write]);

  // A choice that no longer exists (a term since removed) would hide everyone.
  useEffect(() => {
    if (options === NO_OPTIONS) return;
    const known: Record<FilterKey, (value: string) => boolean> = {
      term: (value) => value === "none" || options.terms.length === 0 || options.terms.some((item) => sameId(item.id, value)),
      college: (value) => options.colleges.length === 0 || options.colleges.some((item) => sameId(item.id, value)),
      program: (value) => options.programs.length === 0 || options.programs.some((item) => sameId(item.id, value)),
      block: (value) => value === "none" || options.blocks.length === 0 || options.blocks.some((item) => sameId(item.id, value)),
      company: (value) => options.companies.length === 0 || options.companies.some((item) => sameId(item.id, value)),
      supervisor: (value) => value === "none" || options.supervisors.length === 0 || options.supervisors.some((item) => sameId(item.supervisor_id, value)),
    };
    const cleaned = { ...filters };
    let changed = false;
    for (const key of FILTER_KEYS) {
      if (cleaned[key] && !known[key](cleaned[key])) {
        cleaned[key] = "";
        changed = true;
      }
    }
    if (changed) write(cleaned);
  }, [options, filters, write]);

  const set = useCallback(
    (key: FilterKey, value: string) => write(settle({ ...filters, [key]: value }, options)),
    [filters, options, write]
  );
  const clear = useCallback(() => write({ ...EMPTY }), [write]);

  /** "term=3&program=7", or "" when nothing is chosen. */
  const query = useMemo(() => {
    const sent = new URLSearchParams();
    for (const key of FILTER_KEYS) if (filters[key]) sent.set(key, filters[key]);
    return sent.toString();
  }, [filters]);

  /** Puts a whole set of choices in the bar at once (a saved view). Keys not given are cleared. */
  const apply = useCallback(
    (next: Partial<StudentFilters>) => write(settle({ ...EMPTY, ...next }, options)),
    [options, write]
  );

  return {
    filters,
    set,
    apply,
    clear,
    query,
    active: query !== "",
    options,
    ready,
    choices: useMemo(() => narrowed(options, filters), [options, filters]),
  };
}

export type StudentFilterState = ReturnType<typeof useStudentFilters>;

/** Which students a page or an export covers, in words: "Program: BSIT; Block: BSIT 4A". */
export function describeFilters(state: Pick<StudentFilterState, "filters" | "options">): string {
  const { filters, options } = state;
  const named: string[] = [];
  if (filters.term) {
    named.push(
      `Term: ${
        filters.term === "none"
          ? "students with no term"
          : options.terms.find((item) => sameId(item.id, filters.term))?.name || filters.term
      }`
    );
  }
  const college = options.colleges.find((item) => sameId(item.id, filters.college));
  if (filters.college) named.push(`College: ${college?.name || filters.college}`);
  const program = options.programs.find((item) => sameId(item.id, filters.program));
  if (filters.program) named.push(`Program: ${program?.short_code || filters.program}`);
  if (filters.block) {
    named.push(
      `Block: ${
        filters.block === "none"
          ? "students with no block"
          : options.blocks.find((item) => sameId(item.id, filters.block))?.name || filters.block
      }`
    );
  }
  const company = options.companies.find((item) => sameId(item.id, filters.company));
  if (filters.company) named.push(`Company: ${company?.name || filters.company}`);
  if (filters.supervisor) {
    named.push(
      `Supervisor: ${
        filters.supervisor === "none"
          ? "students with no supervisor"
          : options.supervisors.find((item) => sameId(item.supervisor_id, filters.supervisor))?.name || filters.supervisor
      }`
    );
  }
  return named.length > 0 ? named.join("; ") : "All students";
}
