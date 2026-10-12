# Corrections for the System Architectural Design Document (rev 2)

These are the edits needed so that `CC106 GROUP 9 - architecture-aligned
draft (rev 2).docx` matches the system as it stands after the October 2026
changes (see `CHANGES.md`, section 13). Nothing has been changed in the
document itself; apply the edits you agree with.

Each entry gives where the text is, what it says now, and the replacement.
Entries marked **Figure** also affect a diagram. The figures are images, so
they were not checked; the last section lists what each one has to show.

## A. Decisions to make first

**A1. Who can confirm attendance: settled, change the paper.** Part III,
section 2 says the design "ensures only supervisors can confirm
attendance". That is no longer how the system works, and the difference is
in daily use, so the paper has to follow it (entry B9 has the wording):

- The assigned supervisor still confirms or rejects each log.
- The coordinator now decides flagged logs on the Monitoring page: a log
  can be verified, rejected with a reason, returned to the supervisor's
  queue, or acknowledged. The system records which role decided
  (`verifier_role`).
- Since October 2026 a supervisor can also record an intern's time-in in
  person, with a reason, when the camera check cannot run on the intern's
  device. That log is marked as recorded by the supervisor and is verified
  when the intern times out.

Restricting the route to supervisors is no longer a one-line change: it
would remove the coordinator's flagged-log review.

**A2. File storage wording.** The paper presents Azure Blob Storage as the
production store. `DEPLOY.md` uses a persistent volume on the backend host
instead, because it needs no Azure account. Entry B4 has wording that
covers both. If you do configure Azure, the current text can stay.

**A3. Hosting.** The paper does not name where the system runs. Once it is
deployed, add one sentence to Part II (entry B5).

## B. Text corrections

### Part I, Table 1

**B1. Feature 3, Daily Report Logging, Description.** Add break tracking
and the review rule.

> Current: "Lets students log their daily time-in, time-out, and tasks
> completed during OJT. Students submit an attendance image through the
> app; camera input is offered where supported by the device browser, and
> the assigned supervisor reviews and confirms the log."

> Replace with: "Lets students log their daily time-in, break, time-out,
> and tasks completed during OJT, with one log per day. Students submit an
> attendance image through the app; camera input is offered where
> supported by the device browser. Rendered hours exclude the recorded
> break. After the student times out, the assigned supervisor confirms the
> log or rejects it with a reason."

**B2. Feature 6, Data analytics & Reports, Description.**

> Current: "...exportable as CSV or printable/savable as PDF."

> Replace with: "...exportable as CSV, downloadable as a generated PDF
> report, or printable."

**B3. Feature 8, Document/Attachment Upload, Description.** The Teacher is
listed as a user; the description now says what the Teacher does.

> Current: "Lets students upload the OJT requirements set by the
> coordinator; the assigned supervisor approves or rejects each document."

> Replace with: "Lets students upload the OJT requirements set by the
> coordinator; the assigned supervisor approves or rejects each document,
> and the coordinator sees each student's requirement progress and can
> open the submitted files."

### Part II

**B4. Data Tier, File Storage** (see A2).

> Current: "...kept in a private Azure Blob Storage container when
> AZURE_STORAGE_CONNECTION_STRING is configured, or on private local disk
> during development (not durable on ephemeral hosts)."

> Replace with: "...kept in private storage: an Azure Blob Storage
> container when AZURE_STORAGE_CONNECTION_STRING is configured, otherwise
> a private disk directory, which is a persistent volume on the deployment
> host (PRIVATE_UPLOAD_DIR) and local disk in development."

Apply the same idea to the stack line in Part III ("private Azure Blob
Storage with local-disk fallback") and the Data Tier bullet in Part III,
section 1.

**B5. Hosting** (see A3). Add after the first paragraph of Part II, once
deployed, filling in the real services:

> "The PWA is served as a static site from Vercel. The Express backend,
> the PostgreSQL database, and the file volume run on Railway as one
> always-on service, which the in-process reminder scheduler and live
> notification stream require."

**B6. Application Tier, Core API.** Nothing is deleted through the API;
accounts and requirements are deactivated, and complaints are closed.

> Current: "It handles all Create, Read, Update, and Delete (CRUD)
> operations related to attendance records, task assignments, and filed
> complaints."

> Replace with: "It handles the create, read, and update operations for
> attendance records, task assignments, documents, and filed complaints.
> Records are not deleted through the application; accounts and
> requirements are deactivated, and complaints are resolved or dismissed,
> so the history stays available."

Make the matching change in Part III, section 1, Application Tier bullet
("CRUD operations for daily reports, ...").

**B7. Application Tier, Security and Access Control.** Add the measures
that now exist. Append to the paragraph:

> "New passwords must have 12 to 128 characters with an uppercase letter,
> a lowercase letter, and a number. On the deployed system, an account
> whose password was set by someone else (the initial coordinator account
> and every account a coordinator registers) must set its own password at
> first login. Changing or resetting a password signs out the account's
> other sessions. Failed logins are also limited per network address, the
> API sends standard security headers, and in production it accepts
> browser requests only from the deployed frontend."

**B8. Application Tier, In-App Notifications.** The sentence is now true
for all three roles; add the read actions.

> Current: "...authenticated users can review them in their role-specific
> PWA views."

> Replace with: "...authenticated users can review them in their
> role-specific PWA views and mark them as read, individually or all at
> once."

### Part III

**B9. Section 2, Use Case Diagram, last paragraph** (see A1; this
replacement is needed).

> Current: "...ensures only supervisors can confirm attendance under Daily
> Report Logging (Feature 3)..."

> Replace with: "...ensures attendance under Daily Report Logging (Feature
> 3) is confirmed by the assigned supervisor, or recorded by that
> supervisor in person when the student's camera check cannot run; the
> coordinator reviews logs the system flags and can verify, reject or
> return them; and the system records which role made each decision..."

If the Use Case Diagram is redrawn, the coordinator needs a "Review
flagged attendance" use case, and the supervisor a "Record time-in in
person" use case.

**B10. Section 2, "How the Components Interact".**

> Current: "Supervisors are notified when a log awaits verification, then
> confirm or reject it..."

> Replace with: "Supervisors are notified when a log awaits verification.
> Once the student has timed out they confirm it, or reject it with a
> reason..."

**B11. Section 2, OJT Coordinator Use Cases.** **Figure 2.**

> Current: "...Evaluate OJT Performance, View Analytics & Reports
> (extended by Export CSV/Print Report)."

> Replace with: "...Evaluate OJT Performance, View Submitted Documents,
> View Analytics & Reports (extended by Export CSV, Download PDF, and
> Print Report)."

**B12. Section 3, Context Diagram, System → OJT Coordinator.** **Figure 3.**

> Current: "Dashboard summaries, monitoring data with flagged
> discrepancies, analytics and CSV/printed reports, notifications."

> Replace with: "Dashboard summaries, monitoring data with flagged
> discrepancies, requirement progress and submitted documents, analytics
> with CSV, PDF, and printed reports, notifications."

**B13. Section 4, DFD, "How the Components Interact".** **Figure 4.** Add
after the sentence about Process 3.0:

> "Process 3.0 also returns each student's requirement progress and the
> submitted documents (D6, D8) to the coordinator for read-only oversight."

**B14. Section 5, ERD, "What the Diagram Represents".** **Figure 5.**

> Current: "...reflects the PostgreSQL migrations (001–006)."

> Replace with: "...reflects the PostgreSQL migrations (001–016)."

(There were 8 migrations when this entry was first written and 16 on
10 October 2026. Count the files in `backend/migrations` before
submitting, and use that number.)

Then, in the component list:

- Students: the entry lists no password. Add "password hash", and add
  "auth_version, must_change_password".
- Supervisors and Coordinators: add "auth_version, must_change_password".
- Attendance: add "unique (student_id, date)", and extend the description
  to "one log per student per day".

Add one sentence after the list:

> "auth_version invalidates an account's existing sessions when its
> password changes; must_change_password marks an account that still has a
> password chosen by someone else."

**B15. Section 6, Module Diagram, Coordinator Module.** **Figure 6.**

> Current: "Contains seven administrative submodules: Dashboard, OJT
> Monitoring (with flagged discrepancies), User Management, OJT
> Requirements & Schedules, Complaint Resolution, Evaluation Review &
> Rating, and Analytics & Reporting (CSV export and print)."

> Replace with: "Contains eight administrative submodules: Dashboard, OJT
> Monitoring (with flagged discrepancies), User Management, OJT
> Requirements & Schedules, Document Oversight, Complaint Resolution,
> Evaluation Review & Rating, and Analytics & Reporting (CSV export, PDF
> download, and print)."

**B16. Section 6, Search and Filter as a backend service.** Three
sentences describe Search & Filter as shared backend logic used by every
role. In the system, the backend provides the coordinator's global search
and the list endpoints; filtering by date, status, and text on each page
happens in the PWA on the records already loaded.

In the Common Services Module sentence:

> Current: "...the Deadline Reminder Scheduler, Search and Filter, private
> File Storage..."

> Replace with: "...the Deadline Reminder Scheduler, the coordinator's
> record search and the list endpoints that the page filters use, private
> File Storage..."

In "How the Components Interact":

> Current: "...rely on the analytics aggregation queries and the Search &
> Filter Service."

> Replace with: "...rely on the analytics aggregation queries and the
> record search endpoint; each page then filters its loaded records by
> student, date, status, or company in the client."

In "Centralized Infrastructure (Features 1, 7, 9, 11)":

> Current: "Placing User Authentication, Notifications, and Search &
> Filter services inside the Common Services Module prevents code
> duplication. This ensures that whether a student or a coordinator is
> logging in or searching records, they are utilizing the exact same
> secure, standardized backend logic."

> Replace with: "Placing User Authentication and Notifications inside the
> Common Services Module prevents code duplication, so every role logs in
> and receives alerts through the same secure backend logic. Search &
> Filter is shared at the client level instead: the same date-range and
> text filters are reused across the role-specific pages, on records the
> backend has already restricted to what that user may see."

### Part IV, feature-to-architecture table

**B17. Row 6, Data analytics & Reports.** No change to the cells; if the
row is expanded, add "CSV and PDF export" under Related Process.

**B18. Row 8, Document/Attachment Upload, System Module.**

> Current: "Student & Supervisor Module (Document Upload & Review
> Submodule); Coordinator Module (OJT Requirements & Schedules)"

> Replace with: "Student & Supervisor Module (Document Upload & Review
> Submodule); Coordinator Module (OJT Requirements & Schedules, Document
> Oversight)"

**B19. Row 9, Search & Filter.**

> Current, System Module: "Common Services Module (Search & Filter
> Service)"

> Replace with: "PWA Client (shared page filters); Common Services Module
> (coordinator record search)"

> Current, Related Data: "...per-page filters (attendance, tasks,
> documents, monitoring)"

> Replace with: "...per-page filters by text, status, and date range
> (attendance, daily log, tasks, documents, monitoring)"

### Small fixes

- Part II, first paragraph: "INTERnet" should be "INTERNet".
- Table 1, Feature 3, Purpose/Benefit: "work done.." has two periods.
- Part IV, first sentence: "The INTERNet system" should be "the INTERNet
  system".
- Table 1, "No." column: check that rows 1 to 3 show their numbers and
  that row 9 has a period like the others.

## C. Statements checked and left as they are

These were questioned in the audit and are accurate now:

- "Lets users search and filter records by student, date, status, or
  company" for Student, Supervisor, and Teacher (Feature 9). Date-range
  filters now exist on each role's attendance view.
- "Authenticated users can review [notifications] in their role-specific
  PWA views." Supervisors and coordinators now have a notification panel;
  supervisors also have a full page.
- "Migration 006 adds foreign-key constraints, so the database enforces
  these relationships for every new or updated row." This is exact: the
  constraints apply to new and updated rows.
- "Figures are retrieved on request rather than live-pushed" for the
  coordinator's dashboard, monitoring, and analytics.

## D. What each figure has to show

The six figures were not inspected. After the text edits, each should
agree with the following:

| Figure | Check that it shows |
|---|---|
| 1. System Architecture | File storage labelled as private storage (volume or Azure Blob), per B4. The host names, if you add B5. |
| 2. Use Case | Coordinator has "View Submitted Documents"; "View Analytics & Reports" is extended by Export CSV, Download PDF, and Print Report. If you keep A1 as the system has it, the coordinator is also linked to Confirm/Reject Daily Log. |
| 3. Context | The System → OJT Coordinator arrow includes submitted documents and PDF reports. |
| 4. DFD Level 0 | Process 3.0 has an output to the OJT Coordinator, reading D6 and D8. |
| 5. ERD | Students, Supervisors, and Coordinators include auth_version and must_change_password; Students includes the password hash; Attendance is marked unique on (student_id, date). Since migration 037: four more entities, Colleges, Programs, Majors and Blocks, drawn as described under E ("The ERD has four more entities"). |
| 6. Module Diagram | Coordinator Module has eight submodules including Document Oversight; Analytics & Reporting mentions PDF; Search & Filter is drawn as B16 and B19 describe. |

## E. Sections the document does not have

The document has four parts: features, architecture, diagram
explanations, and feature mapping. It has no objectives, scope and
limitations, or evaluation criteria. If your instructor's template asks
for any of these, they need to be written by the group. Limitations that
are true of the system today, for a scope section:

- Most of the system needs a connection. Since October 2026 the app
  itself opens offline, a student or supervisor can read the last saved
  copy of a few records (marked with the time it was saved), text being
  typed is kept as a draft, and a break, return from break or time-out
  pressed offline is kept on the phone and sent later, marked "recorded
  while offline" for the supervisor. Time-in, every upload, and all of the
  coordinator's work need a connection. If the paper says the system is
  "online only" or "works offline", neither is accurate; use this wording.
- A student's time-in photo is taken by the app after a short camera check
  (blink, smile or turn, on prompts the server chooses); a photo chosen
  from the device is refused. The check runs in the student's browser and
  the server trusts its report, so it raises the effort needed to fake a
  time-in but does not prove presence; the supervisor's review is still
  the control. A replacement photo sent with a corrected log, and the
  supervisor's in-person photo, are ordinary uploads.
- Password recovery, reminder emails, and browser push need email and
  VAPID settings on the server; without them those features report that
  they are not configured. Email is sent through an email provider's HTTPS
  API (or SMTP), from a domain the programme owns; the system does not run
  its own mail server.
- Coordinator dashboard, monitoring, and analytics figures load on request
  and are not live. The dashboard's lists and figures are counted by the
  server each time the page is opened.
- On Monitoring, the coordinator's date range shows each student's hours
  and logs inside the dates and filters the flagged logs. Progress toward
  the required hours is always for the whole placement.
- A page that crashes shows a recovery screen and sends the server a short
  report (error text, page path, build). There is no error dashboard; the
  reports are lines in the server log.
- There is one coordinator account by default. A coordinator can add,
  deactivate and reactivate other coordinator accounts; nobody can
  deactivate their own.
- The supervisor's final evaluation is filled in on a form whose criteria
  and scale the coordinator sets. The system ships with a sample form,
  marked as a sample; the paper should describe the university's own
  criteria only once they have been entered.
- A supervisor can correct the times on a log, with a reason the student
  sees; the times before and after are kept in the audit log. A supervisor
  can also certify a month of a student's time record. Certifying records
  who, when and how many verified hours; it is not a digital signature.
- "Projected finish" is counted from the student's weekly schedule and
  the holiday list, not from the hours they have actually been rendering.
  "At risk" means that date is after the term ends, or nothing is
  scheduled. If the paper calls this a prediction or predictive analytics,
  that overstates it: it is arithmetic on the schedule.
- The coordinator's alerts are fixed rules (reviews waiting more than 3
  days, agreements ending within 30 days, 5 scheduled days without
  attendance), worked out when the dashboard is opened.
- Summary emails to supervisors and coordinators exist in the system but
  are sent only when the server has email settings, which the hosted
  system does not have at the time of writing.
- A camera check is good for one time-in: the ticket the server issues
  for it is refused if presented a second time. This closes replaying one
  check; it does not change the limit already stated above, that the check
  runs in the student's browser and the server trusts its report.
- An announcement's "seen by" count is the number of people who have had
  it on their list of announcements (for a student, the Announcements tab
  under the bell; the Announcements page counts the same way). It does not
  show that anyone read it.
- The schedule's calendar file is a copy made when it is saved; it does
  not update itself when the schedule changes.
- Accessibility was checked with an automated tool (axe, WCAG 2.1 A and
  AA) on every page as it loads, with no failures left. Automated checks
  find only part of what the guidelines cover; the paper should not claim
  the system "is WCAG compliant".
- On their profile a student can edit their name and email, and add a
  mobile number and an emergency contact. Program, company and required
  hours are set by the coordinator.
- A student writes a weekly journal, which their supervisor marks reviewed
  or returns with a note. It is not graded and is not counted toward
  completion.
- The completion checklist, a card on the student's Profile, is a list
  the system counts (hours, logs, documents, tasks, the supervisor's
  evaluation, the student's rating of the company).
  "Request completion review" tells the coordinator the list is done. It
  does not complete, clear or certify anything; if the paper says the
  system "clears" or "certifies" a student, that is not accurate.
- Holidays entered by the coordinator are shown on the schedule and the
  Daily Time Record. They do not block a time-in.
- A student who leaves a log open is reminded once, an hour after their
  scheduled end. The log is not closed for them.
- Before the first time-in a student reads and agrees to a privacy notice,
  and can download a copy of their data. The notice wording in the system
  is a draft awaiting the university's approved text, and no retention
  period for attendance photos has been set: photos are kept. If the paper
  describes a retention period or an approved consent form, it is ahead of
  the system.
- The student portal's menu, since October 2026, is Today, Attendance,
  Tasks and Documents, with Schedule and Weekly journal under "More".
  Notifications, Announcements, Completion, Feedback and Report a concern
  are no longer menu items. If the paper, a screenshot or the module
  diagram lists them as separate student pages or menu entries, say
  instead where each is now:
  - notifications and announcements are read from the bell in the header,
    on two tabs; the bell shows twenty notifications at a time and can
    show only the unread ones;
  - the completion checklist is a card on the student's Profile;
  - reporting a concern and the evaluations (those written about the
    student, and the student's rating of the company) are the two tabs of
    one page, the "Resolution Center", opened from the avatar menu on a
    phone and from the header on a desktop.
- On screen the student portal says "concern" for what a student reports.
  If the paper says "complaint" or "incident report" for the same thing,
  use one word throughout; "concern" matches the screens. (The database
  table is still named `complaints`; that is a name in the ERD, not on
  screen.)
- The student's Today page no longer carries the attendance card. It
  shows one line saying where the day stands, and the card is on the
  Attendance page. On a phone, the next step of the day (Time in, Lunch,
  Back, Time out) is a button that floats above the menu on every page
  except Attendance and Profile. A screenshot of the old Today page is out
  of date.
- The supervisor portal's top bar, since October 2026, is Review, Interns,
  Attendance, Tasks, Documents, Journals and Evaluations. What the paper
  may call "Incidents" or "Incident Reports" is "Concerns" and is opened
  from the supervisor's account menu; announcements are read from the
  bell. A screenshot or module list that shows Incidents in the top bar,
  or Announcements in the account menu, is out of date.
- One word is used on every screen for what a student or a supervisor
  reports to the coordinator: a "concern". The coordinator's page and
  sidebar entry are "Concerns". If the paper uses "complaint", "incident"
  or "incident report" for it (the feature table, the use case names, the
  module diagram), use "concern" in the text, and keep `complaints` only
  where the paper names the database table.
- The supervisor's Review queue also lists "Final evaluation due" for an
  intern within 40 hours of their required hours, or past them, who has
  no final evaluation. It is a reminder that opens the evaluation form.
  The system does not block completion on it beyond what the completion
  checklist already counts, and it does not write the evaluation.
- In the supervisor's attendance list each log is marked with how it was
  made (the intern's camera check, or recorded in person by the
  supervisor) and whether a step was recorded while the phone was
  offline. These marks describe how the record was made; they are not a
  verification result.
- A supervisor sees the name and email of the OJT coordinator in their
  account menu. The system does not assign supervisors to coordinators:
  with more than one coordinator, the one shown is the longest-serving
  active coordinator.
- The coordinator's dashboard, since October 2026, is in this order:
  today's attendance (timed in, on the clock, absent, scheduled but not
  yet in); one "Action list"; six key figures; verified hours over 14
  days; progress toward required hours; what waits with each supervisor.
  The Action list replaces the three lists the dashboard used to show
  (alerts, "Needs attention" and "Students to check on") and groups what
  needs doing by who has to do it: the coordinator, the supervisors, the
  students. A description or screenshot of the older dashboard is out of
  date.
- The dashboard and Analytics show six key figures, each against a
  target: students on track to finish within the term (90%); attendance
  on scheduled days over the last 4 weeks (95%); the median time from a
  student's time-out to the supervisor's decision (2 days or less);
  requirements complete among students past half their hours (80%); open
  concerns older than 7 days (none); agreements ending within 30 days
  (none). If the paper describes these:
  - the targets are defaults chosen for the system, fixed in the code.
    They are not the university's policy and a coordinator cannot change
    them yet. Do not present them as institutional standards;
  - "on track" is an estimate from each student's schedule, not a
    prediction of what a student will do;
  - the small eight-week chart on each card is worked out from today's
    schedules and end dates, because the system does not keep those as
    they were. It is a guide to direction, not a historical record;
  - the figures describe the programme. The system does not act on them:
    nothing is blocked, flagged or sent when a target is missed.
- The audit log also records a student agreeing to the privacy notice, a
  student downloading a copy of their data, and a coordinator opening a
  student's record, a submitted document or an uploaded photo. Opening
  the same thing again within ten minutes is one entry. It does not
  record supervisors or students viewing records, or anyone signing in.
  If the paper says the system logs "all access" or "every view", that is
  more than it does.
- The coordinator can filter the audit log by category, by who did it,
  by person, by record and by date, and can download the filtered entries
  as a CSV file (at most 10,000 at a time). The download is itself an
  entry in the log. Dates are Philippine dates.
- A student's weekly schedule is edited by the coordinator on the
  student's record (a Schedule tab), and still on the Requirements page.
  It is set one student at a time.
- The ERD has four more entities since October 2026 (migration 037), and
  Students has three more attributes. If Figure 5 is redrawn:
  - **Colleges** (id, name, short_name, is_active).
  - **Programs** (id, college_id, name, short_code, ojt_applies,
    is_active). A college has many programs.
  - **Majors** (id, program_id, name, is_active). A program has zero or
    more majors; "major" also covers a specialization.
  - **Blocks** (id, program_id, major_id, year_level, section, term_id,
    is_active). A program has many blocks; a block may be of one major
    and of one term, and either may be empty. A block has no name
    attribute: its name ("BSIT 4A") is put together from its program's
    short code, its year level and its section.
  - **Students** gains program_id, major_id and block_id, each optional.
    Students keeps its `program` text attribute, which is what is
    displayed; program_id is the link. A student belongs to at most one
    program, major and block.
  - **Terms** gains closed_block_ids (the blocks a closing switched off).
  The paper's text should say that a student's program is recorded both
  as text and as a link, and that the link may be missing for a student
  whose program was typed in a way the system does not recognise.
- The list of colleges, programs and majors in the system was entered
  from a list given to the group and has not been confirmed by the OJT
  office. If the paper lists the campus's colleges and programs, take
  them from the office, not from the system.
- "OJT applies" on a program only keeps it out of the pickers on the
  coordinator's student form. It does not stop a student of that program
  from being registered, timing in or being counted.
- The coordinator's pages (Dashboard, Monitoring, Analytics, Students,
  Documents, Evaluations, Audit log) share one filter bar: term, college,
  program, block, company, supervisor. The filtering is done by the
  server. If the paper describes "search and filter" (B16, B19, and the
  module diagram), this is what it is now. On the audit log the bar finds
  only entries about a student's own record or that name the student.
- Analytics and its exports report by program and by block as well as by
  company. A student not linked to a program is counted under the text on
  their account, so a program can appear under more than one spelling
  until the students are linked.
- A supervisor whose interns are of more than one program or block can
  narrow their pages to one. This is a view of their own interns only.
- **Feature 3 (attendance), wording.** The four steps of a day are called
  "Time in", "Out for lunch", "Back from lunch" and "Time out" on every
  screen. If the paper says "break", "start break" or "end break", use
  these. The time record is printed with the columns Day, AM In, AM Out,
  PM In, PM Out, Hours, Status: time in is AM In, out for lunch AM Out,
  back from lunch PM In, time out PM Out. The system does not ask for four
  times: lunch is optional. A day worked without one prints "No break" in
  place of AM Out and PM In, and a morning-only or afternoon-only day
  fills only its two columns. The system never prints a time that was not
  recorded; if the paper says the DTR "always shows four entries" or that
  the system "computes" the lunch hour, that is not what it does.
- **The weekly journal is now the weekly report.** One entry a week with
  four parts: What I did, What I learned, Problems encountered, and
  Solutions tried or identified (the last two optional). Beside it the
  system shows what the student wrote at time-out on each day of that
  week. The supervisor still marks it reviewed or returns it. It is not
  graded and, as before, is not counted toward completion. Use "weekly
  report" in the text; the table in the ERD is still `journals`, with one
  more attribute, `solutions`.
- At time-out a student may tick which of their assigned tasks they
  worked on that day. It is optional and is the student's own statement:
  the system does not check it against anything, and it does not change a
  task's status. The ERD has one more entity for it, `attendance_tasks`
  (attendance_id, task_id), between Attendance and Tasks.
- The student's Schedule page has three views: the week, a month
  calendar, and "My progress". The calendar and the progress figures are
  put together on the student's device from records already loaded, and
  work from the saved copies without a connection. "Late" on that page
  means a time-in more than 15 minutes after the scheduled start; that
  number is a default chosen for the system, not a university rule, and
  nothing happens to a student who is late: it is only shown to them.
- **Use cases: teams (new).** A supervisor can name a team of their own
  interns and assign one task to the team. Add to the supervisor's use
  cases: "Manage teams" (create, rename, change members, remove) and
  "Assign a task to a team". The system stores a team task as one task
  per member: each member sees it as their own, submits their own work
  and is reviewed separately, and the supervisor sees how many of the
  team have submitted. It is not a shared submission; if the paper says
  "group submission" or "one output per team", that is not what was
  built. The ERD has two more entities, `task_groups` (id,
  supervisor_id, name) and `task_group_members` (group_id, student_id),
  and Tasks has two more attributes, `group_task_id` and
  `task_group_id`.
- **Use cases: notes between supervisor and coordinator (new).** For each
  student there is a thread of notes that the student's supervisor and
  the OJT coordinators write and read. The student is not an actor in
  this use case and has no access to it: it is not on any student page,
  raises no student notification, and is not in the copy of their data a
  student can download. Add "Write a note about a student" to the
  supervisor's and the coordinator's use cases, and do not draw a line
  from the student to it. A note cannot be edited or deleted. The ERD has
  one more entity, `student_notes` (id, student_id, author_role,
  author_id, author_name, message, created_at). If the paper's privacy
  section lists what a student can see about themselves, this is the one
  record about them that they cannot.
- A supervisor can set the day a task is released (`tasks.available_from`).
  Before that day the intern does not see the task and is told nothing;
  on the day they are notified once. If the paper says a student is
  notified "as soon as a task is assigned", add "or on its release day".
- The supervisor's portal has six places in its top bar: Review, Interns,
  Attendance, Tasks, Documents, Weekly reports. Evaluations is no longer
  one of them: star ratings and the final evaluation are written on each
  intern's own page (Interns > an intern > Evaluate). A screen list or
  navigation diagram that shows "Evaluations" as a supervisor page should
  show the intern page with its tabs: Overview, Attendance, Tasks,
  Documents, Weekly reports, Evaluate, Time record, Notes.
- The coordinator can send a supervisor a reminder of what is waiting for
  their review, at most once a day per supervisor. Add "Remind a
  supervisor" to the coordinator's use cases. It is recorded in the audit
  log.
- A supervisor can see when the coordinator last visited their company
  and what was left to follow up. They cannot see the coordinator's
  findings. If the paper says site visit records are "visible to the
  coordinator only", change it to "the findings are visible to the
  coordinator only".
