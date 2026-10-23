import { useState } from "react";
import ComposeMessage from "../../components/ComposeMessage";
import { Button, Card, FormError, FormField } from "../../components/ui";
import { API_URL, withStudentAuth } from "../../lib/api";
import { errorText, toast } from "../../lib/toast";

export type Contact = {
  phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
};

export type Coordinator = {
  coordinator_id: number | string;
  name: string;
  email: string;
  department: string | null;
  /** Migration 060. Missing from an older server; the mobile only when they chose to show it. */
  position?: string | null;
  office_hours?: string | null;
  mobile?: string | null;
};

export type Supervisor = {
  supervisor_id: number | string;
  name: string;
  email: string | null;
  company: string | null;
  department: string | null;
  position?: string | null;
  office_hours?: string | null;
  mobile?: string | null;
};

/** Position, office hours and a mobile the person chose to show: what the cards add (roadmap 5.3). */
function ReachLines({ person }: { person: { position?: string | null; office_hours?: string | null; mobile?: string | null } }) {
  return (
    <>
      {person.office_hours && <p className="mt-1 text-sm text-slate-600">Available {person.office_hours}</p>}
      {person.mobile && (
        <a href={`tel:${person.mobile.replace(/[^0-9+]/g, "")}`} className="mt-1 block text-sm font-semibold text-psu-700 hover:underline">
          {person.mobile}
        </a>
      )}
    </>
  );
}

const PHONE = /^[0-9+() .-]{7,20}$/;

/**
 * The student's phone number and emergency contact. Their supervisor and
 * the coordinator can see these; other students cannot.
 */
export default function ContactDetails({
  studentId,
  contact,
  onSaved,
}: {
  studentId: string;
  contact: Contact;
  onSaved: (contact: Contact) => void;
}) {
  const [phone, setPhone] = useState(contact.phone || "");
  const [name, setName] = useState(contact.emergency_contact_name || "");
  const [contactPhone, setContactPhone] = useState(contact.emergency_contact_phone || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const changed =
    phone.trim() !== (contact.phone || "") ||
    name.trim() !== (contact.emergency_contact_name || "") ||
    contactPhone.trim() !== (contact.emergency_contact_phone || "");

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    for (const number of [phone.trim(), contactPhone.trim()]) {
      if (number && !PHONE.test(number)) {
        return setError("Write phone numbers with 7 to 20 digits. Spaces, +, - and brackets are fine.");
      }
    }
    if (contactPhone.trim() && name.trim().length < 2) {
      return setError("Add the name of the person that number belongs to.");
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `${API_URL}/api/students/${encodeURIComponent(studentId)}/contact`,
        withStudentAuth({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: phone.trim(),
            emergency_contact_name: name.trim(),
            emergency_contact_phone: contactPhone.trim(),
          }),
        })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Your contact details could not be saved.");
      onSaved(data.contact as Contact);
      toast.success("Contact details saved.");
    } catch (saveError) {
      setError(errorText(saveError, "Your contact details could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5">
      <form onSubmit={save}>
        <h2 className="text-[16px] font-bold text-slate-900">Contact details</h2>
        <p className="mt-1 text-sm text-slate-600">
          Seen by your supervisor and your OJT coordinator, so they can reach you or someone
          close to you if something happens at work.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FormField label="Your mobile number" htmlFor="contact-phone" optional className="sm:col-span-2">
            <input
              id="contact-phone"
              type="tel"
              autoComplete="tel"
              maxLength={20}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="field"
            />
          </FormField>
          <FormField label="Emergency contact" htmlFor="contact-name" optional hint="A parent, guardian or relative">
            <input
              id="contact-name"
              type="text"
              maxLength={150}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="field"
            />
          </FormField>
          <FormField label="Their phone number" htmlFor="contact-emergency-phone" optional>
            <input
              id="contact-emergency-phone"
              type="tel"
              maxLength={20}
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
              className="field"
            />
          </FormField>
        </div>
        <FormError message={error} />
        <Button
          type="submit"
          busy={saving}
          doneLabel="Saved"
          failed={Boolean(error)}
          disabled={!changed}
          className="mt-4"
        >
          {saving ? "Saving" : "Save contact details"}
        </Button>
      </form>
    </Card>
  );
}

/** Who runs the OJT programme for this student, and how to reach them. */
export function CoordinatorCard({ coordinator }: { coordinator: Coordinator | null }) {
  const [writing, setWriting] = useState(false);
  if (!coordinator) return null;
  return (
    <Card className="p-5">
      <h2 className="text-[16px] font-bold text-slate-900">Your OJT coordinator</h2>
      <p className="mt-2 text-sm font-medium text-slate-900">{coordinator.name}</p>
      {coordinator.position && <p className="text-sm text-slate-600">{coordinator.position}</p>}
      {coordinator.department && <p className="text-sm text-slate-600">{coordinator.department}</p>}
      <a
        href={`mailto:${coordinator.email}`}
        className="mt-1 inline-block break-all text-sm font-semibold text-psu-700 hover:underline"
      >
        {coordinator.email}
      </a>
      <ReachLines person={coordinator} />
      <p className="mt-2 text-xs text-slate-500">
        For questions about requirements, your hours, or a problem at your company. To report a
        concern in confidence, use Report.
      </p>
      <Button variant="secondary" icon="mail" className="mt-3" onClick={() => setWriting(true)}>
        Message {coordinator.name.split(" ")[0]}
      </Button>
      {writing && (
        <ComposeMessage
          role="student"
          to={{ role: "coordinator", id: coordinator.coordinator_id, name: coordinator.name, email: coordinator.email }}
          subject="A question about my OJT"
          onClose={() => setWriting(false)}
        />
      )}
    </Card>
  );
}

/** The supervisor at the company, with a way to write to them in INTERNet. */
export function SupervisorCard({ supervisor }: { supervisor: Supervisor | null }) {
  const [writing, setWriting] = useState(false);
  if (!supervisor) return null;
  return (
    <Card className="p-5">
      <h2 className="text-[16px] font-bold text-slate-900">Your supervisor</h2>
      <p className="mt-2 text-sm font-medium text-slate-900">{supervisor.name}</p>
      {supervisor.position && <p className="text-sm text-slate-600">{supervisor.position}</p>}
      {(supervisor.company || supervisor.department) && (
        <p className="text-sm text-slate-600">
          {[supervisor.department, supervisor.company].filter(Boolean).join(", ")}
        </p>
      )}
      {supervisor.email && (
        <a
          href={`mailto:${supervisor.email}`}
          className="mt-1 inline-block break-all text-sm font-semibold text-psu-700 hover:underline"
        >
          {supervisor.email}
        </a>
      )}
      <ReachLines person={supervisor} />
      <p className="mt-2 text-xs text-slate-500">For your schedule, tasks and attendance at the company.</p>
      <Button variant="secondary" icon="mail" className="mt-3" onClick={() => setWriting(true)}>
        Message {supervisor.name.split(" ")[0]}
      </Button>
      {writing && (
        <ComposeMessage
          role="student"
          to={{ role: "supervisor", id: supervisor.supervisor_id, name: supervisor.name, email: supervisor.email }}
          subject="A question about my OJT"
          onClose={() => setWriting(false)}
        />
      )}
    </Card>
  );
}
