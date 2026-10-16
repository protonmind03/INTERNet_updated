import { useCallback, useEffect, useId, useState } from "react";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";
import { FILTER_KEYS, type StudentFilterState, type StudentFilters } from "./useStudentFilters";
import { sameId } from "../../lib/ids";

/*
| The coordinator's saved views of the filter bar: a set of the bar's
| choices under a name ("BSIT 4A"), kept on the server for that
| coordinator alone. Choosing one puts its choices in the bar; a choice
| that no longer exists is dropped by the bar itself. A view holds only
| the bar's own six choices, not a page's other filters or its search.
*/

type View = { id: number; name: string; filters: Partial<StudentFilters> };

const same = (view: View, filters: StudentFilters) =>
  FILTER_KEYS.every((key) => (view.filters[key] || "") === (filters[key] || ""));

export default function SavedViews({ state }: { state: StudentFilterState }) {
  const [views, setViews] = useState<View[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const selectId = useId();
  const nameId = useId();

  const load = useCallback(async () => {
    try {
      const data = await coordinatorRequest<{ views: View[] }>("/api/coordinator/filter-views");
      setViews(data.views || []);
    } catch {
      // Without them the bar works as before.
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  // The view the bar shows now, if its choices are exactly one's.
  const current = views.find((view) => same(view, state.filters));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const data = await coordinatorRequest<{ message: string }>("/api/coordinator/filter-views", {
        method: "POST",
        body: { name: name.trim(), filters: state.filters },
      });
      toast.success(data.message);
      setNaming(false);
      setName("");
      await load();
    } catch (saveError) {
      toast.error(errorText(saveError, "The view could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (view: View) => {
    setBusy(true);
    try {
      const data = await coordinatorRequest<{ message: string }>(`/api/coordinator/filter-views/${view.id}`, {
        method: "DELETE",
        body: {},
      });
      toast.success(data.message);
      await load();
    } catch (removeError) {
      toast.error(errorText(removeError, "The view could not be removed."));
    } finally {
      setBusy(false);
    }
  };

  if (views.length === 0 && !state.active) return null;

  return (
    <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2 border-t border-slate-100 pt-3">
      {views.length > 0 && (
        <div className="min-w-0">
          <label htmlFor={selectId} className="mb-1 block text-xs font-medium text-slate-600">
            Saved views
          </label>
          <select
            id={selectId}
            value={current ? String(current.id) : ""}
            onChange={(event) => {
              const view = views.find((item) => sameId(item.id, event.target.value));
              if (view) state.apply(view.filters);
            }}
            className="h-10 w-full min-w-44 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-800 focus:border-psu-500 focus:outline-none"
          >
            <option value="">{current ? "Choose another" : "Choose a view"}</option>
            {views.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {current && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void remove(current)}
          className="h-10 rounded-md px-2.5 text-sm font-semibold text-red-700 hover:bg-slate-100 disabled:opacity-50"
        >
          Remove this view<span className="sr-only">: {current.name}</span>
        </button>
      )}

      {state.active && !current && !naming && (
        <button
          type="button"
          onClick={() => setNaming(true)}
          className="h-10 rounded-md px-2.5 text-sm font-semibold text-psu-700 hover:bg-slate-100"
        >
          Save these filters as a view
        </button>
      )}

      {naming && (
        <form onSubmit={save} className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor={nameId} className="mb-1 block text-xs font-medium text-slate-600">
              Name for this view
            </label>
            <input
              id={nameId}
              type="text"
              maxLength={60}
              value={name}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              placeholder="For example, BSIT 4A"
              className="h-10 w-56 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-800 focus:border-psu-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="h-10 rounded-lg bg-psu-700 px-3.5 text-sm font-semibold text-white hover:bg-psu-800 disabled:opacity-50"
          >
            Save view
          </button>
          <button
            type="button"
            onClick={() => {
              setNaming(false);
              setName("");
            }}
            className="h-10 rounded-md px-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
