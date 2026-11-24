import { useEffect, useState } from "react";
import { placementBlock } from "../../lib/hte";
import { knownCompanies, loadCompanies, type CompanyChoice } from "./companyNames";

/**
 * The company field on the student and supervisor forms. It suggests the
 * recorded, active companies as you type, so a name is picked, not retyped
 * with a different spelling. Any name can still be typed: an account with a
 * name that has no record is listed on the Companies page as "not yet
 * recorded", and links itself once the record exists.
 *
 * Phase 1.3, on the student form (`forStudents`): companies that cannot
 * take a student (not approved, or every slot taken) are left out of the
 * suggestions, and typing one says why. The server checks again when the
 * student is saved (409 NO_SLOTS or COMPANY_NOT_APPROVED).
 */
export default function CompanyPicker({
  id,
  value,
  onChange,
  forStudents = false,
  current = null,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  forStudents?: boolean;
  /** The student's company now: keeping it is never refused. */
  current?: string | null;
}) {
  const [companies, setCompanies] = useState<CompanyChoice[]>(() => knownCompanies() ?? []);

  useEffect(() => {
    if (knownCompanies()) return;
    let active = true;
    loadCompanies()
      .then((loaded) => {
        if (active) setCompanies(loaded);
      })
      .catch(() => {
        // The field still works as plain text without suggestions.
      });
    return () => {
      active = false;
    };
  }, []);

  const listId = `${id}-names`;
  const typed = value.trim().toLowerCase();
  const match = companies.find((company) => company.name.toLowerCase() === typed);
  const keeping = Boolean(current) && current!.trim().toLowerCase() === typed;
  const blocked = forStudents && match && !keeping ? placementBlock(match) : null;
  const offered = forStudents ? companies.filter((company) => placementBlock(company) === null) : companies;
  const hidden = companies.length - offered.length;

  return (
    <>
      <input
        id={id}
        type="text"
        maxLength={150}
        list={listId}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field"
        aria-describedby={blocked ? `${id}-why` : undefined}
      />
      <datalist id={listId}>
        {offered.map((company) => (
          <option key={company.name} value={company.name} />
        ))}
      </datalist>
      {blocked ? (
        <p id={`${id}-why`} className="mt-1 text-xs text-red-700">
          {match!.name} cannot take a student now: {blocked}.
        </p>
      ) : value.trim() && companies.length > 0 && !match ? (
        <p className="mt-1 text-xs text-amber-700">No company record has this name yet. You can add one on the Companies page.</p>
      ) : forStudents && hidden > 0 && !value.trim() ? (
        <p className="mt-1 text-xs text-slate-500">
          {hidden === 1 ? "1 company is" : `${hidden} companies are`} not suggested: not approved yet, or every slot taken.
        </p>
      ) : null}
    </>
  );
}
