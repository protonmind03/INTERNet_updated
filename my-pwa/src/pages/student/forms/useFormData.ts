import { useCallback, useEffect, useState } from "react";
import { API_URL, withStudentAuth } from "../../../lib/api";
import { readRecord, saveRecord, savedFetch } from "../../../lib/offlineStore";
import { useAccount } from "../../../lib/session";
import type { TimeRecordHeaderData } from "../../../lib/timeRecordHeader";
import { logDateKey, type AttendanceLog } from "../useAttendance";
import { EMPTY, type Fields } from "./formModel";
import { weekRange, type TimeframeData, type WeeklyData } from "./recordForms";

/*
| What the forms are filled in from: the lines the trainee typed in Fill and
| print (kept on this device only, under "print-forms"), over what the
| record knows (name, program, hours, company). Shared by Fill and print,
| the Narrative report and the Weekly reports, so a line typed once shows
| on every form that has it.
*/

export function usePrintFields() {
  const student = useAccount("student");
  const [fields, setFields] = useState<Fields | null>(null);

  useEffect(() => {
    if (!student?.student_id) return;
    let active = true;
    const id = encodeURIComponent(student.student_id);
    const parts = (student.name || "").trim().split(/\s+/);
    const known: Partial<Fields> = {
      firstName: parts.slice(0, -1).join(" ") || parts[0] || "",
      lastName: parts.length > 1 ? parts[parts.length - 1] : "",
      course: student.program ?? "",
      hours: student.required_hours ? String(Number(student.required_hours)) : "",
      company: student.company ?? "",
    };
    void Promise.all([
      fetch(`${API_URL}/api/company/${id}`, withStudentAuth())
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null),
      readRecord<Partial<Fields>>("student", "print-forms").catch(() => null),
    ]).then(([company, typed]) => {
      if (!active) return;
      const fromCompany: Partial<Fields> = company?.company
        ? { company: company.company.name || known.company, companyAddress: company.company.address ?? "", companyRep: company.company.supervisor ?? "" }
        : {};
      setFields({ ...EMPTY, ...known, ...fromCompany, ...(typed ?? {}) });
    });
    return () => {
      active = false;
    };
  }, [student?.student_id, student?.name, student?.program, student?.required_hours, student?.company]);

  const change = useCallback(
    (key: keyof Fields, value: string) =>
      setFields((current) => {
        if (!current) return current;
        const next = { ...current, [key]: value };
        void saveRecord("student", "print-forms", next).catch(() => undefined);
        return next;
      }),
    []
  );

  return { fields, change };
}

const nameOf = (fields: Fields | null, header: TimeRecordHeaderData | null) =>
  header?.trainee.name || [fields?.firstName, fields?.middleName ? `${fields.middleName.trim()[0]}.` : "", fields?.lastName].filter(Boolean).join(" ");

/** The days worked, as the Time Frame lists them: the verified days, oldest first. */
export function timeframeFrom(logs: AttendanceLog[], header: TimeRecordHeaderData | null, fields: Fields | null): TimeframeData {
  const days = logs
    .filter((log) => log.time_in && log.status === "Verified")
    .map((log) => ({ day: logDateKey(log), hours: Number(log.hours) || 0 }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const yearCourse = [fields?.yearSection, fields?.course || header?.trainee.program].filter(Boolean).join(" - ") || header?.trainee.block || "";
  return {
    name: nameOf(fields, header),
    yearCourse,
    company: fields?.company || header?.trainee.company || "",
    companyAddress: fields?.companyAddress ?? "",
    hours: fields?.hours || (header?.trainee.required_hours ? String(header.trainee.required_hours) : ""),
    days,
    representative: fields?.companyRep || header?.trainee.supervisor || "",
  };
}

export type JournalWeek = { week_start: string; activities: string; learnings: string; status?: string };

/** The weekly reports, oldest first, as the Weekly Report's rows. */
export function weeklyFrom(journals: JournalWeek[], logs: AttendanceLog[], header: TimeRecordHeaderData | null, fields: Fields | null): WeeklyData {
  const worked = logs.filter((log) => log.time_in).map(logDateKey).sort();
  const weeks = [...journals].sort((a, b) => a.week_start.localeCompare(b.week_start));
  return {
    name: nameOf(fields, header),
    instructor: fields?.instructor ?? "",
    company: fields?.company || header?.trainee.company || "",
    jobDescription: fields?.jobDescription ?? "",
    start: worked[0],
    end: worked[worked.length - 1],
    hours: fields?.hours || (header?.trainee.required_hours ? String(header.trainee.required_hours) : ""),
    weeks: weeks.map((week, index) => ({ label: `Week ${index + 1}\n(${weekRange(week.week_start, worked)})`, tasks: week.activities ?? "", learned: week.learnings ?? "" })),
    supervisor: header?.trainee.supervisor || fields?.companyRep || "",
  };
}

/** The trainee's weekly reports (kept for offline use like the Weekly reports page). */
export function useJournals(enabled = true) {
  const student = useAccount("student");
  const [journals, setJournals] = useState<JournalWeek[] | null>(null);
  useEffect(() => {
    if (!enabled || !student?.student_id) return;
    let active = true;
    savedFetch("student", "journals", `${API_URL}/api/journals/student/${encodeURIComponent(student.student_id)}`, withStudentAuth())
      .then((response) => (response.ok ? response.json() : { journals: [] }))
      .then((data) => active && setJournals(data.journals || []))
      .catch(() => active && setJournals([]));
    return () => {
      active = false;
    };
  }, [enabled, student?.student_id]);
  return journals;
}
