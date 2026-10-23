import { useCallback, useEffect, useId, useState } from "react";
import { API_URL, withRoleAuth } from "../lib/api";
import type { SessionRole } from "../lib/session";
import { errorText, toast } from "../lib/toast";
import { Button, Card, FormError, FormField } from "./ui";

/*
|--------------------------------------------------------------------------
| HOW TO REACH SOMEONE
|--------------------------------------------------------------------------
|
| Roadmap 5.3 (migration 060, routes/accountDetails.ts). One form for the
| details each role keeps: on one's own Profile (GET/PUT /api/me/profile),
| and for the coordinator on someone else's page, where a change is
| audited by the names of the fields changed. Every field is optional. A
| personal mobile is shown to others only when its owner ticks the box.
|
*/

type Details = Record<string, string | number | boolean | null>;
type College = { id: number; name: string };

const CONTACT_LABEL: Record<string, string> = {
  email: "Email",
  mobile: "Mobile",
  message: "A message in INTERNet",
  office: "In person, at the office",
};

type FieldSpec = { key: string; label: string; hint?: string; type?: "text" | "tel" | "contact" | "college" | "show"; max?: number; wide?: boolean };

const FIELDS: Record<SessionRole, FieldSpec[]> = {
  student: [{ key: "preferred_contact", label: "How you prefer to be reached", type: "contact" }],
  supervisor: [
    { key: "position", label: "Job title", max: 120 },
    { key: "work_phone", label: "Work phone", type: "tel", max: 20 },
    { key: "office_hours", label: "Hours you can be reached", hint: "For example, Monday to Friday, 9 AM to 4 PM", max: 120 },
    { key: "mobile_number", label: "Mobile number", type: "tel", max: 20 },
    { key: "show_mobile", label: "Show my mobile number to my interns", type: "show" },
    { key: "preferred_contact", label: "How you prefer to be reached", type: "contact" },
  ],
  coordinator: [
    { key: "position", label: "Position or designation", max: 120 },
    { key: "office_location", label: "Office location", hint: "Building and room", max: 150 },
    { key: "office_hours", label: "Office hours", hint: "For example, Monday to Friday, 8 AM to 5 PM", max: 120 },
    { key: "employee_number", label: "Employee number", max: 40 },
    { key: "college_id", label: "College", type: "college" },
    { key: "mobile_number", label: "Mobile number", type: "tel", max: 20 },
    { key: "show_mobile", label: "Show this mobile number to students and supervisors", type: "show" },
    { key: "preferred_contact", label: "Preferred way to be reached", type: "contact" },
  ],
};

export default function AccountDetailsForm({
  role,
  viewer,
  person,
  title = "How to reach you",
  description,
  onSaved,
}: {
  /** Whose details: their kind of account. */
  role: SessionRole;
  /** Who is signed in. */
  viewer: SessionRole;
  /** Someone else's, for the coordinator; leave out for one's own. */
  person?: { role: SessionRole; id: string };
  title?: string;
  description?: string;
  /** After a save, for a page that shows the details elsewhere too. */
  onSaved?: () => void;
}) {
  const formId = useId();
  const url = person
    ? `${API_URL}/api/coordinator/people/${person.role}/${encodeURIComponent(person.id)}/details`
    : `${API_URL}/api/me/profile`;
  const [saved, setSaved] = useState<Details | null>(null);
  const [form, setForm] = useState<Details>({});
  const [colleges, setColleges] = useState<College[]>([]);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(url, withRoleAuth(viewer));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not load the details.");
      setSaved(data.details);
      setForm(data.details);
      setColleges(data.colleges || []);
      setLoadError("");
    } catch (failure) {
      setLoadError(errorText(failure, "Could not load the details."));
    }
  }, [url, viewer]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const fields = FIELDS[role];
  const changes = saved
    ? Object.fromEntries(
        fields
          .map((field) => field.key)
          .filter((key) => String(form[key] ?? "") !== String(saved[key] ?? ""))
          .map((key) => [key, form[key] === "" ? null : form[key]])
      )
    : {};
  const changed = Object.keys(changes).length > 0;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!changed) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        url,
        withRoleAuth(viewer, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "The details could not be saved.");
      setSaved(data.details);
      setForm(data.details);
      toast.success(data.message || "Saved.");
      onSaved?.();
    } catch (failure) {
      setError(errorText(failure, "The details could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const set = (key: string, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const value = (key: string) => (form[key] === null || form[key] === undefined ? "" : String(form[key]));

  return (
    <Card>
      <form onSubmit={save} className="p-4 sm:p-5" noValidate>
        <h2 className="text-[16px] font-bold text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
        {loadError ? (
          <div className="mt-3">
            <FormError message={loadError} />
          </div>
        ) : !saved ? (
          <p className="mt-3 text-sm text-slate-500" role="status">
            Loading…
          </p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {fields.map((field) => {
              const id = `${formId}-${field.key}`;
              if (field.type === "show") {
                return (
                  <label key={field.key} htmlFor={id} className="flex min-h-11 items-center gap-3 text-sm text-slate-700 sm:col-span-2">
                    <input
                      id={id}
                      type="checkbox"
                      checked={form[field.key] === true}
                      onChange={(event) => set(field.key, event.target.checked)}
                      className="h-5 w-5 rounded border-slate-300 text-psu-700"
                    />
                    {field.label}
                  </label>
                );
              }
              return (
                <FormField key={field.key} label={field.label} htmlFor={id} hint={field.hint} optional>
                  {field.type === "contact" ? (
                    <select id={id} value={value(field.key)} onChange={(event) => set(field.key, event.target.value)} className="field">
                      <option value="">Not said</option>
                      {Object.entries(CONTACT_LABEL).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "college" ? (
                    <select id={id} value={value(field.key)} onChange={(event) => set(field.key, event.target.value)} className="field">
                      <option value="">Not said</option>
                      {colleges.map((college) => (
                        <option key={college.id} value={String(college.id)}>
                          {college.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={id}
                      type={field.type === "tel" ? "tel" : "text"}
                      autoComplete={field.type === "tel" ? "tel" : "off"}
                      maxLength={field.max}
                      value={value(field.key)}
                      onChange={(event) => set(field.key, event.target.value)}
                      className="field"
                    />
                  )}
                </FormField>
              );
            })}
          </div>
        )}
        <div className="mt-3">
          <FormError message={error} />
        </div>
        <Button type="submit" busy={saving} doneLabel="Saved" failed={Boolean(error)} disabled={!changed} className="mt-4">
          {saving ? "Saving" : "Save details"}
        </Button>
      </form>
    </Card>
  );
}
