import type { InternGroupState } from "./useInternGroups";

/**
 * "Program and block" on a supervisor's page. Drawn only when their
 * interns are of more than one program or block: a supervisor whose
 * interns are all "BSIT 4A" has nothing to choose between.
 */
export default function InternGroupSelect({
  state,
  onChange,
}: {
  state: InternGroupState;
  /** Called after a choice, for a page that must reset something under it. */
  onChange?: () => void;
}) {
  if (state.groups.length < 2) return null;
  return (
    <label className="block w-full sm:w-56">
      <span className="sr-only">Program and block</span>
      <select
        value={state.group}
        onChange={(event) => {
          state.setGroup(event.target.value);
          onChange?.();
        }}
        className="field"
      >
        <option value="">All programs and blocks</option>
        {state.groups.map((group) => (
          <option key={group.label} value={group.label}>
            {group.label} ({group.count})
          </option>
        ))}
      </select>
    </label>
  );
}
