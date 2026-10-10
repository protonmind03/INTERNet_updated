import { useEffect, useState } from "react";
import { knownCompanyNames, loadCompanyNames } from "./companyNames";

/**
 * The company field on the student and supervisor forms. It suggests the
 * recorded, active companies as you type, so a name is picked, not retyped
 * with a different spelling. Any name can still be typed: an account with a
 * name that has no record is listed on the Companies page as "not yet
 * recorded", and links itself once the record exists.
 */
export default function CompanyPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [names, setNames] = useState<string[]>(() => knownCompanyNames() ?? []);

  useEffect(() => {
    if (knownCompanyNames()) return;
    let active = true;
    loadCompanyNames()
      .then((loaded) => {
        if (active) setNames(loaded);
      })
      .catch(() => {
        // The field still works as plain text without suggestions.
      });
    return () => {
      active = false;
    };
  }, []);

  const listId = `${id}-names`;
  const known = names.some((name) => name.toLowerCase() === value.trim().toLowerCase());

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
      />
      <datalist id={listId}>
        {names.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      {value.trim() && names.length > 0 && !known && (
        <p className="mt-1 text-xs text-amber-700">
          No company record has this name yet. You can add one on the Companies page.
        </p>
      )}
    </>
  );
}
