// The kinds of account, in one place. Phase 1.6 adds the OJT Director.
// Each kind's notifications are the rows whose NOTIFICATION_COLUMN holds
// its id (migrations 002 and 080).

export type AccountRole = "student" | "supervisor" | "coordinator" | "director";

export const ACCOUNT_ROLES: readonly AccountRole[] = ["student", "supervisor", "coordinator", "director"];

export const NOTIFICATION_COLUMN: Record<AccountRole, string> = {
  student: "student_id",
  supervisor: "supervisor_id",
  coordinator: "coordinator_id",
  director: "director_id",
};
