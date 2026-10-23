import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BrandLoader } from "../brand";
import Icon, { type IconName } from "./Icon";
import { API_URL, withCoordinatorAuth } from "../lib/api";

/*
|--------------------------------------------------------------------------
| FIND ANYONE (the coordinator's search)
|--------------------------------------------------------------------------
|
| PSU redesign, Section 11: at the top of the side menu ("/" or Ctrl K jumps
| to it) and at the top of More on a phone. It finds a student, a supervisor
| or a concern (GET /api/coordinator/search) and opens their page.
|
*/

type SearchResult = { type: "student" | "supervisor" | "complaint"; id: string; title: string; detail: string; href: string };

const RESULT_ICONS: Record<SearchResult["type"], IconName> = { student: "users", supervisor: "briefcase", complaint: "flag" };

export default function CoordinatorSearch({ tone, onGo, shortcut = false }: { tone: "dark" | "light"; onGo?: () => void; shortcut?: boolean }) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    if (!shortcut) return;
    const onKey = (event: KeyboardEvent) => {
      const typing = (event.target as HTMLElement | null)?.matches?.("input, textarea, select, [contenteditable=true]");
      if (((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") || (event.key === "/" && !typing)) {
        event.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shortcut]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`${API_URL}/api/coordinator/search?q=${encodeURIComponent(text)}`, withCoordinatorAuth({ signal: controller.signal }));
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Search failed.");
        setResults(data.results || []);
        setHighlighted(0);
      } catch (searchError) {
        if (searchError instanceof DOMException && searchError.name === "AbortError") return;
        setResults([]);
        setError("Search is unavailable right now.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  const go = (result: SearchResult) => {
    navigate(result.href);
    setQuery("");
    setResults([]);
    setOpen(false);
    inputRef.current?.blur();
    onGo?.();
  };
  const showPanel = open && query.trim().length >= 2;
  const dark = tone === "dark";

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex h-11 items-center gap-2 rounded-xl px-3 ${
          dark ? "bg-white/10 text-white ring-1 ring-white/15 focus-within:ring-2 focus-within:ring-[var(--inb-amber)]" : "bg-slate-100 text-slate-700 focus-within:ring-2 focus-within:ring-psu-500"
        }`}
      >
        <Icon name="search" size={16} className="shrink-0 opacity-80" />
        <input
          ref={inputRef}
          type="search"
          maxLength={100}
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            setOpen(true);
            if (value.trim().length < 2) {
              setResults([]);
              setError("");
              setLoading(false);
            }
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              setHighlighted((index) => Math.min(index + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlighted((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter" && results[highlighted]) {
              go(results[highlighted]);
            }
          }}
          role="combobox"
          aria-label="Find a student, supervisor or concern"
          aria-expanded={showPanel}
          aria-controls={`coordinator-search-${tone}`}
          placeholder={dark ? "Find anyone" : "Find a student, supervisor or company"}
          className={`h-full w-full min-w-0 bg-transparent text-sm focus:outline-none ${dark ? "text-white placeholder:text-white/70" : "text-slate-800 placeholder:text-slate-500"}`}
        />
        {shortcut && (
          <kbd aria-hidden="true" className="shrink-0 rounded border border-current/30 px-1.5 text-xs opacity-80">
            /
          </kbd>
        )}
      </div>
      {showPanel && (
        <div
          id={`coordinator-search-${tone}`}
          role="listbox"
          aria-label="Search results"
          className="absolute inset-x-0 top-full z-40 mt-2 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 text-slate-800 shadow-xl"
        >
          {loading && (
            <div className="px-4 py-3">
              <BrandLoader variant="inline" role="coordinator" process="search" />
            </div>
          )}
          {!loading && error && (
            <p role="alert" className="px-4 py-3 text-sm text-red-600">
              {error}
            </p>
          )}
          {!loading && !error && results.length === 0 && <p className="px-4 py-3 text-sm text-slate-500">Nothing matches "{query.trim()}".</p>}
          {!loading &&
            !error &&
            results.map((result, index) => (
              <button
                key={`${result.type}-${result.id}`}
                type="button"
                role="option"
                aria-selected={index === highlighted}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => go(result)}
                className={`flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left ${index === highlighted ? "bg-psu-50" : ""}`}
              >
                <Icon name={RESULT_ICONS[result.type]} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{result.title}</span>
                  <span className="block truncate text-xs text-slate-500">{result.detail}</span>
                </span>
                <span className="shrink-0 text-xs capitalize text-slate-500">{result.type}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
