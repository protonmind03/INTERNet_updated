import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL, withStudentAuth } from "../../../lib/api";
import { savedFetch } from "../../../lib/offlineStore";
import { phToday } from "../../../lib/phTime";
import { useAccount } from "../../../lib/session";
import { useTimeRecordHeader } from "../../../lib/timeRecordHeader";
import { traineeRecord, type NarrativeParts } from "../../../lib/traineeRecord";
import { useFinalEvaluation } from "../../../lib/useFinalEvaluation";
import { useTimeIn } from "../timeInContext";
import { logDateKey } from "../useAttendance";
import type { Records } from "./model";

/*
| Everything the narrative report is drawn from, loaded once for the page:
| the trainee's written parts, weekly reports, tasks, daily reports and
| their events, uploaded documents, report photos, the company, the
| supervisor's evaluation and the attendance the layout already holds.
*/

export type Journal = { week_start: string; activities: string; learnings: string; challenges: string | null; solutions?: string | null; status: string };
export type UploadedDocument = { id: number; doc_type: string; status: string; original_filename: string; uploaded_at: string };
export type ReportPhoto = { id: number; title: string; day: string | null; caption: string | null; has_preview: boolean; taken_at: string };

export function useNarrativeData() {
  const student = useAccount("student");
  const studentId = student?.student_id;
  const { attendance } = useTimeIn();
  const header = useTimeRecordHeader("student", studentId, null);
  const final = useFinalEvaluation("student", studentId);
  const [parts, setParts] = useState<NarrativeParts>({});
  const [journals, setJournals] = useState<Journal[]>([]);
  const [tasksDone, setTasksDone] = useState<string[]>([]);
  const [events, setEvents] = useState<Records["events"]>([]);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [photos, setPhotos] = useState<ReportPhoto[]>([]);
  const [company, setCompany] = useState({ name: "", department: "", supervisor: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const logs = useMemo(() => attendance.logs.filter((log) => log.time_in).sort((a, b) => logDateKey(a).localeCompare(logDateKey(b))), [attendance.logs]);
  const start = logs[0] ? logDateKey(logs[0]) : undefined;
  const end = logs.length ? logDateKey(logs[logs.length - 1]) : undefined;
  const verifiedHours = logs.filter((log) => log.status === "Verified").reduce((sum, log) => sum + (Number(log.hours) || 0), 0);

  const load = useCallback(async () => {
    if (!studentId) return;
    const id = encodeURIComponent(studentId);
    try {
      const [narrative, journalResponse, taskResponse, docResponse, companyResponse, albumResponse] = await Promise.all([
        traineeRecord.narrative("student", studentId),
        savedFetch("student", "journals", `${API_URL}/api/journals/student/${id}`, withStudentAuth()).catch(() => null),
        savedFetch("student", "tasks", `${API_URL}/api/tasks/student/${id}`, withStudentAuth()).catch(() => null),
        fetch(`${API_URL}/api/documents/student`, withStudentAuth()).catch(() => null),
        fetch(`${API_URL}/api/company/${id}`, withStudentAuth()).catch(() => null),
        fetch(`${API_URL}/api/students/${id}/album`, withStudentAuth()).catch(() => null),
      ]);
      setParts(narrative.parts);
      if (journalResponse?.ok) setJournals(((await journalResponse.json()).journals ?? []) as Journal[]);
      if (taskResponse?.ok) {
        const list = (await taskResponse.json()) as { title: string; status: string }[];
        setTasksDone(Array.isArray(list) ? list.filter((task) => ["Submitted", "Reviewed", "Completed"].includes(task.status)).map((task) => task.title) : []);
      }
      if (docResponse?.ok) setDocuments(((await docResponse.json()).documents ?? []) as UploadedDocument[]);
      if (companyResponse?.ok) {
        const data = await companyResponse.json();
        setCompany({ name: data.company?.name ?? "", department: data.company?.department ?? "", supervisor: data.company?.supervisor ?? "" });
      }
      if (albumResponse?.ok) {
        const data = await albumResponse.json();
        setPhotos(((data.pictures ?? []) as (ReportPhoto & { source: string })[]).filter((photo) => photo.source === "report_entry"));
      }
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your narrative report.");
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  // The events of every day reported, from the first time-in to today.
  useEffect(() => {
    if (!studentId || !start) return;
    let active = true;
    traineeRecord
      .dailyReports("student", studentId, start, phToday())
      .then((data) => {
        if (!active) return;
        setEvents(
          data.reports
            .flatMap((report) => report.entries.map((entry) => ({ day: report.report_date, title: entry.title || "An event", details: entry.details })))
            .sort((a, b) => a.day.localeCompare(b.day))
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [studentId, start]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const records: Records = {
    name: header?.trainee.name ?? student?.name ?? "",
    program: header?.trainee.program ?? student?.program ?? "",
    // "LINGAYEN" in the institution record reads as "Lingayen" in sentences.
    campus: (header?.institution.campus_name ?? "Lingayen")
      .replace(/\s*campus$/i, "")
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase()),
    company: company.name || header?.trainee.company || student?.company || "",
    department: company.department,
    supervisor: company.supervisor || header?.trainee.supervisor || "",
    start,
    end,
    hours: verifiedHours,
    requiredHours: Number(header?.trainee.required_hours ?? student?.required_hours ?? 0) || 0,
    weeks: journals,
    events,
    tasksDone,
  };

  return { studentId, parts, setParts, records, journals, documents, photos, logs, header, evaluation: final.evaluation, loading, error, reload: load };
}
