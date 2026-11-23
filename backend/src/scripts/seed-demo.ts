// Must stay first: the file store reads PRIVATE_UPLOAD_DIR when imported.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import { PH_PG_OPTIONS } from "../services/phTime";
import { currentRemoteStore, deletePrivateFile, newStoredFileName, savePrivateFile } from "../services/privateFileStore";

const demoSupervisor = {
  id: "DEMO-SUP-0001",
  email: "supervisor.demo@internet.test",
  password: "SupervisorDemo123!",
  name: "Demo Supervisor",
  company: "INTERNet Demo Company",
  department: "OJT Training",
};

const demoStudent = {
  id: "DEMO-STU-0001",
  email: "student.demo@internet.test",
  password: "StudentDemo123!",
  name: "Demo Student",
  program: "BS Information Technology",
  company: demoSupervisor.company,
};

// A second intern of the same supervisor, in the same program, so that
// things done for several interns at once (a team task) can be tried.
const demoStudentTwo = {
  id: "DEMO-STU-0002",
  email: "student2.demo@internet.test",
  password: demoStudent.password,
  name: "Demo Student Two",
  program: demoStudent.program,
  company: demoSupervisor.company,
};

// A coordinator of its own, so the coordinator sign-in can be filled in
// locally without touching the default COORD-0001 account.
const demoCoordinator = {
  id: "DEMO-COORD-0001",
  email: "coordinator.demo@internet.test",
  password: "CoordinatorDemo123!",
  name: "Demo Coordinator",
  department: "College of Computing Sciences",
};

/*
|--------------------------------------------------------------------------
| PSU LINGAYEN DEMO DATA (Phase 0.5)
|--------------------------------------------------------------------------
|
| Agencies like the campus's partners, fictional supervisors and trainees
| in BSIT, BPA and BSBA, and a week of activity, so a demo looks like PSU
| Lingayen. Every person here is made up: emails end in @demo.invalid (a
| domain that can never receive mail), every ID starts DEMO-, and the
| agencies' contact people are placeholders.
|
| None of it touches the demo accounts above: their supervisor keeps two
| interns and no company record, as the tests expect. Each row is added
| only when missing, so running the seed again changes nothing there.
|
*/

/** One company of each kind the campus deals with. MOA dates are days from today. */
const demoAgencies = [
  { name: "Provincial Government of Pangasinan", address: "Provincial Capitol Compound, Lingayen, Pangasinan", industry: "Government", moa: [-420, 680], slots: 20 },
  { name: "DepEd Schools Division Office Pangasinan I", address: "Lingayen, Pangasinan", industry: "Government (education)", moa: [-300, 400], slots: 10 },
  { name: "Philippine Ports Authority PMO Pangasinan", address: "Pangasinan", industry: "Government (ports)", moa: [-200, 160], slots: 5 },
  // Ends within days, so "agreements ending" has something to show.
  { name: "Land Registration Authority – Registry of Deeds Lingayen", address: "Lingayen, Pangasinan", industry: "Government (land registration)", moa: [-700, 6], slots: 4 },
  { name: "Bayside Digital Works, Inc. (demo)", address: "Dagupan City, Pangasinan", industry: "Private (software)", moa: [-90, 275], slots: 6 },
] as const;

const demoAgencySupervisors = [
  { id: "DEMO-SUP-0101", name: "Ma. Teresa Villanueva", job: "Human Resource Management Officer", agency: 0 },
  { id: "DEMO-SUP-0102", name: "Ronaldo Pascual", job: "Administrative Officer IV", agency: 1 },
  { id: "DEMO-SUP-0103", name: "Liza Fernandez", job: "Port Operations Officer", agency: 2 },
  { id: "DEMO-SUP-0104", name: "Arnel Soriano", job: "Land Registration Examiner", agency: 3 },
  { id: "DEMO-SUP-0105", name: "Kristine Abad", job: "Engineering Lead", agency: 4 },
].map((each) => ({ ...each, email: `${each.id.toLowerCase()}@demo.invalid` }));

/** Each trainee's program is found by short code; their hours come from it (migration 077). */
const demoAgencyTrainees = [
  { id: "DEMO-STU-0101", name: "Andrea Mae Castillo", program: "BSIT", supervisor: 4 },
  { id: "DEMO-STU-0102", name: "John Paul Mendoza", program: "BSIT", supervisor: 0 },
  { id: "DEMO-STU-0103", name: "Kimberly Rose Dizon", program: "BPA", supervisor: 0 },
  { id: "DEMO-STU-0104", name: "Mark Anthony Reyes", program: "BPA", supervisor: 3 },
  { id: "DEMO-STU-0105", name: "Patricia Joy Tamayo", program: "BSBA", supervisor: 2 },
  { id: "DEMO-STU-0106", name: "Christian Dela Paz", program: "BSBA", supervisor: 1 },
].map((each) => ({ ...each, email: `${each.id.toLowerCase()}@demo.invalid` }));

/** Last week, Monday to Friday, for each trainee: "Open" is a day with no time-out. */
const demoWeek: Record<string, ("Verified" | "Pending" | "Rejected" | "Open")[]> = {
  "DEMO-STU-0101": ["Verified", "Verified", "Verified", "Pending", "Pending"],
  "DEMO-STU-0102": ["Verified", "Verified", "Rejected", "Verified", "Pending"],
  "DEMO-STU-0103": ["Verified", "Verified", "Verified", "Verified", "Verified"],
  "DEMO-STU-0104": ["Verified", "Pending", "Pending", "Pending", "Open"],
  "DEMO-STU-0105": ["Verified", "Verified", "Verified", "Verified", "Pending"],
  "DEMO-STU-0106": ["Pending", "Pending", "Pending", "Pending", "Pending"],
};

/** A one-page PDF, for the one document waiting for review. */
const DEMO_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
);

/** Adds the PSU Lingayen demo rows. Files it stores are listed in `written`, to remove if the transaction fails. */
async function seedAgencyDemo(
  client: Client,
  written: string[],
  passwords: { supervisor: string; student: string }
): Promise<void> {
  const agencyIds: number[] = [];
  for (const agency of demoAgencies) {
    await client.query(
      `INSERT INTO companies (name, address, industry, contact_person, contact_email, moa_start, moa_expiry, slots, is_active)
       VALUES ($1, $2, $3, 'OJT focal person (demo)', 'ojt-focal@demo.invalid',
               CURRENT_DATE + $4::int, CURRENT_DATE + $5::int, $6, TRUE)
       ON CONFLICT DO NOTHING`,
      [agency.name, agency.address, agency.industry, agency.moa[0], agency.moa[1], agency.slots]
    );
    const row = await client.query<{ id: number }>(
      `SELECT id FROM companies WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))`,
      [agency.name]
    );
    agencyIds.push(row.rows[0].id);
  }

  for (const each of demoAgencySupervisors) {
    await client.query(
      `INSERT INTO supervisors (supervisor_id, email, password, name, company, company_id, department, job_title, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, 'OJT Training', $7, TRUE)
       ON CONFLICT DO NOTHING`,
      [each.id, each.email, passwords.supervisor, each.name, demoAgencies[each.agency].name, agencyIds[each.agency], each.job]
    );
  }

  for (const each of demoAgencyTrainees) {
    const supervisor = demoAgencySupervisors[each.supervisor];
    // The program's name and hours, then 180, as requiredHoursFor gives
    // (services/academics.ts; its catalogue needs a pool, not this transaction).
    await client.query(
      `INSERT INTO students
         (student_id, email, password, name, program, program_id, company, company_id, supervisor_id, required_hours, is_active)
       SELECT $1, $2, $3, $4, COALESCE(p.name, $5), p.id, $6, $7, $8, COALESCE(p.required_hours, 180), TRUE
       FROM (SELECT 1) AS one
       LEFT JOIN programs p ON LOWER(p.short_code) = LOWER($5)
       ON CONFLICT DO NOTHING`,
      [each.id, each.email, passwords.student, each.name, each.program,
        demoAgencies[supervisor.agency].name, agencyIds[supervisor.agency], supervisor.id]
    );
    for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) {
      await client.query(
        `INSERT INTO ojt_schedule (student_id, day, start_time, end_time, focus, hours, is_active)
         SELECT $1::varchar, $2::varchar, TIME '08:00', TIME '17:00', 'OJT training and assigned tasks', 8, TRUE
         WHERE NOT EXISTS (SELECT 1 FROM ojt_schedule WHERE student_id = $1 AND day = $2)`,
        [each.id, day]
      );
    }

    // Last week in Philippine dates (the connection's time zone), recorded
    // by the supervisor so no photo is needed. Only once: a run in a later
    // week does not add another week.
    const hasLogs = await client.query(`SELECT 1 FROM attendance WHERE student_id = $1 LIMIT 1`, [each.id]);
    for (const [index, state] of hasLogs.rows.length > 0 ? [] : demoWeek[each.id].entries()) {
      const open = state === "Open";
      const status = open ? "Pending" : state;
      const decided = status === "Verified" || status === "Rejected";
      await client.query(
        `WITH day AS (SELECT (date_trunc('week', CURRENT_DATE)::date - 7 + $2::int) AS d)
         INSERT INTO attendance
           (student_id, date, time_in, break_time, break_end_time, time_out, hours, status,
            capture_method, recorded_by, capture_reason, session, credited_from, scheduled_start, late_minutes,
            accomplishments, verified_by, verifier_role, verified_at, review_notes)
         SELECT $1, d, d + TIME '07:55', d + TIME '12:00', d + TIME '13:00',
                CASE WHEN $3 THEN NULL ELSE d + TIME '17:05' END,
                CASE WHEN $3 THEN NULL ELSE 8 END,
                $4::varchar, 'supervisor', $5::varchar, 'Recorded by the supervisor (demo data).', 'full', d + TIME '08:00', TIME '08:00', 0,
                CASE WHEN $3 THEN NULL ELSE 'Encoded records and assisted at the front desk (demo data).' END,
                CASE WHEN $6 THEN $5::varchar END,
                CASE WHEN $6 THEN 'supervisor' END,
                CASE WHEN $6 THEN d + TIME '17:30' END,
                CASE WHEN $4::varchar = 'Rejected' THEN 'Not at the office that day (demo data).' END
         FROM day
         ON CONFLICT DO NOTHING`,
        [each.id, index, open, status, supervisor.id, decided]
      );
    }
  }

  // One weekly report waiting for its supervisor, once.
  await client.query(
    `INSERT INTO journals (student_id, week_start, activities, learnings, challenges, solutions, status, submitted_at, updated_at)
     SELECT $1::varchar, date_trunc('week', CURRENT_DATE)::date - 7,
            'Encoded applicant records and helped prepare a training schedule.',
            'How a government office tracks its documents from receipt to release.',
            'Learning the filing codes in my first days.',
            'I kept a list of the codes and asked my supervisor when unsure.',
            'Submitted', NOW(), NOW()
     WHERE NOT EXISTS (SELECT 1 FROM journals WHERE student_id = $1)
     ON CONFLICT DO NOTHING`,
    [demoAgencyTrainees[2].id]
  );

  // One document waiting for review, with a real file behind it. Never
  // into a bucket: settings for one in backend/.env could be a real one.
  const trainee = demoAgencyTrainees[0];
  const hasDocument = await client.query(
    `SELECT 1 FROM documents WHERE student_id = $1 AND doc_type = 'Endorsement' LIMIT 1`,
    [trainee.id]
  );
  if (hasDocument.rows.length === 0 && currentRemoteStore()) {
    console.log("Bucket settings are set, so the demo's pending document was left out (the seed writes files to this computer only).");
  } else if (hasDocument.rows.length === 0) {
    const fileName = await savePrivateFile(
      { buffer: DEMO_PDF, originalname: "endorsement.pdf", mimetype: "application/pdf", size: DEMO_PDF.length } as Express.Multer.File,
      newStoredFileName("endorsement.pdf")
    );
    written.push(fileName);
    const document = await client.query<{ id: number }>(
      `INSERT INTO documents (student_id, doc_type, original_filename, file_path, mime_type, size_bytes, status, uploaded_at)
       VALUES ($1, 'Endorsement', 'endorsement-letter-demo.pdf', $2, 'application/pdf', $3, 'Pending', NOW())
       RETURNING id`,
      [trainee.id, fileName, DEMO_PDF.length]
    );
    await client.query(
      `INSERT INTO upload_ledger (role, account_id, kind, bytes, source, source_id, created_at)
       VALUES ('student', $1, 'document', $2, 'documents', $3, NOW())`,
      [trainee.id, DEMO_PDF.length, document.rows[0].id]
    );
  }
}

async function seedDemoData() {
  const connectionString = process.env.DATABASE_PUBLIC_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_PUBLIC_URL is required. Configure it in backend/.env."
    );
  }

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(connectionString);
  } catch {
    throw new Error(
      "DATABASE_PUBLIC_URL must be a valid PostgreSQL URL."
    );
  }

  const host = databaseUrl.hostname.replace(/^\[|\]$/g, "");
  // In the development containers (docker-compose.yml) the database is the
  // container named "db", reachable only inside that private network.
  const dockerDev = process.env.INTERNET_DOCKER_DEV === "1" && host === "db";
  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    (!["localhost", "127.0.0.1", "::1"].includes(host) && !dockerDev) ||
    databaseUrl.pathname !== "/internet_ojt"
  ) {
    throw new Error(
      "Demo data is restricted to the local internet_ojt database."
    );
  }

  const client = new Client({
    connectionString,
    ssl: false,
    options: PH_PG_OPTIONS,
  });
  await client.connect();

  // Files stored during the run, removed again if the transaction fails.
  const written: string[] = [];
  try {
    await client.query("BEGIN");

    const supervisorPassword = await bcrypt.hash(
      demoSupervisor.password,
      10
    );
    const studentPassword = await bcrypt.hash(demoStudent.password, 10);

    const supervisorResult = await client.query(
      `
      INSERT INTO supervisors
        (supervisor_id, email, password, name, company, department)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (supervisor_id) DO UPDATE SET
        email = EXCLUDED.email,
        password = EXCLUDED.password,
        name = EXCLUDED.name,
        company = EXCLUDED.company,
        department = EXCLUDED.department
      WHERE supervisors.email = EXCLUDED.email
      RETURNING supervisor_id
      `,
      [
        demoSupervisor.id,
        demoSupervisor.email,
        supervisorPassword,
        demoSupervisor.name,
        demoSupervisor.company,
        demoSupervisor.department,
      ]
    );
    if (supervisorResult.rows.length !== 1) {
      throw new Error(
        "The demo supervisor ID is already used by a different account."
      );
    }

    for (const each of [demoStudent, demoStudentTwo]) {
    const studentResult = await client.query(
      `
      INSERT INTO students
        (student_id, email, password, name, program, company, supervisor_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (student_id) DO UPDATE SET
        email = EXCLUDED.email,
        password = EXCLUDED.password,
        name = EXCLUDED.name,
        program = EXCLUDED.program,
        company = EXCLUDED.company,
        supervisor_id = EXCLUDED.supervisor_id
      WHERE students.email = EXCLUDED.email
      RETURNING student_id
      `,
      [
        each.id,
        each.email,
        studentPassword,
        each.name,
        each.program,
        each.company,
        demoSupervisor.id,
      ]
    );
    if (studentResult.rows.length !== 1) {
      throw new Error(
        `The demo student ID ${each.id} is already used by a different account.`
      );
    }

    for (const [day, hours] of [
      ["Monday", 8],
      ["Tuesday", 8],
      ["Wednesday", 8],
      ["Thursday", 8],
      ["Friday", 8],
    ] as const) {
      const scheduleExists = await client.query(
        `SELECT 1 FROM ojt_schedule WHERE student_id = $1 AND day = $2 LIMIT 1`,
        [each.id, day]
      );
      if (scheduleExists.rows.length === 0) {
        await client.query(
          `
          INSERT INTO ojt_schedule
            (student_id, day, start_time, end_time, focus, hours, is_active)
          VALUES ($1, $2, TIME '08:00', TIME '17:00', $3, $4, TRUE)
          `,
          [each.id, day, "OJT training and assigned tasks", hours]
        );
      }
    }
    }

    const coordinatorResult = await client.query(
      `
      INSERT INTO coordinators
        (coordinator_id, email, password, name, department, is_active, must_change_password)
      VALUES ($1, $2, $3, $4, $5, TRUE, FALSE)
      ON CONFLICT (coordinator_id) DO UPDATE SET
        email = EXCLUDED.email,
        password = EXCLUDED.password,
        name = EXCLUDED.name,
        department = EXCLUDED.department,
        is_active = TRUE,
        must_change_password = FALSE
      WHERE coordinators.email = EXCLUDED.email
      RETURNING coordinator_id
      `,
      [
        demoCoordinator.id,
        demoCoordinator.email,
        await bcrypt.hash(demoCoordinator.password, 10),
        demoCoordinator.name,
        demoCoordinator.department,
      ]
    );
    if (coordinatorResult.rows.length !== 1) {
      throw new Error(
        "The demo coordinator ID is already used by a different account."
      );
    }

    // The second intern is placed where the first is (program, major, block),
    // when the coordinator has placed the first.
    await client.query(
      `UPDATE students two
       SET program_id = one.program_id, major_id = one.major_id, block_id = one.block_id
       FROM students one
       WHERE one.student_id = $1 AND two.student_id = $2
         AND (two.program_id, two.major_id, two.block_id) IS DISTINCT FROM (one.program_id, one.major_id, one.block_id)`,
      [demoStudent.id, demoStudentTwo.id]
    );

    const taskExists = await client.query(
      `SELECT 1 FROM tasks WHERE student_id = $1 AND title = $2 LIMIT 1`,
      [demoStudent.id, "Prepare a weekly OJT progress report"]
    );
    if (taskExists.rows.length === 0) {
      await client.query(
        `
        INSERT INTO tasks
          (student_id, title, description, assigned_by, assigned_by_id,
           priority, status, due_date, created_at)
        VALUES
          ($1, $2, $3, $4, $5, 'Medium', 'Pending',
           CURRENT_DATE + 14, NOW())
        `,
        [
          demoStudent.id,
          "Prepare a weekly OJT progress report",
          "Summarize this week's training activities and learning outcomes.",
          demoSupervisor.name,
          demoSupervisor.id,
        ]
      );
    }

    await seedAgencyDemo(client, written, { supervisor: supervisorPassword, student: studentPassword });

    await client.query("COMMIT");
  } catch (error) {
    // The files go even when the rollback itself fails (a dropped connection).
    await client.query("ROLLBACK").catch(() => undefined);
    for (const fileName of written) await deletePrivateFile(fileName).catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }

  console.log("Local demo accounts and sample OJT data are ready.");
  console.log(
    `Student: ${demoStudent.email} / ${demoStudent.password} (${demoStudent.id})`
  );
  console.log(
    `Second student: ${demoStudentTwo.email} / ${demoStudentTwo.password} (${demoStudentTwo.id})`
  );
  console.log(
    `Supervisor: ${demoSupervisor.email} / ${demoSupervisor.password} (${demoSupervisor.id})`
  );
  console.log(
    `Coordinator: ${demoCoordinator.email} / ${demoCoordinator.password} (${demoCoordinator.id})`
  );
  console.log(
    `PSU Lingayen demo: ${demoAgencies.length} agencies, ${demoAgencySupervisors.length} agency supervisors and ` +
      `${demoAgencyTrainees.length} trainees (BSIT, BPA, BSBA), all @demo.invalid, with the passwords above.`
  );
  console.log(`  For example: ${demoAgencySupervisors[0].email} (supervisor), ${demoAgencyTrainees[0].email} (trainee).`);
}

seedDemoData().catch((error: unknown) => {
  console.error("Demo data setup failed:", error);
  process.exitCode = 1;
});
