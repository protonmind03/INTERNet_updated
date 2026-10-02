import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { Client } from "pg";

dotenv.config();

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
  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !["localhost", "127.0.0.1", "::1"].includes(host) ||
    databaseUrl.pathname !== "/internet_ojt"
  ) {
    throw new Error(
      "Demo data is restricted to the local internet_ojt database."
    );
  }

  const client = new Client({
    connectionString,
    ssl: false,
  });
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL TIME ZONE 'Asia/Manila'");

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
        demoStudent.id,
        demoStudent.email,
        studentPassword,
        demoStudent.name,
        demoStudent.program,
        demoStudent.company,
        demoSupervisor.id,
      ]
    );
    if (studentResult.rows.length !== 1) {
      throw new Error(
        "The demo student ID is already used by a different account."
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
        [demoStudent.id, day]
      );
      if (scheduleExists.rows.length === 0) {
        await client.query(
          `
          INSERT INTO ojt_schedule
            (student_id, day, start_time, end_time, focus, hours, is_active)
          VALUES ($1, $2, TIME '08:00', TIME '17:00', $3, $4, TRUE)
          `,
          [demoStudent.id, day, "OJT training and assigned tasks", hours]
        );
      }
    }

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

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }

  console.log("Local demo accounts and sample OJT data are ready.");
  console.log(
    `Student: ${demoStudent.email} / ${demoStudent.password} (${demoStudent.id})`
  );
  console.log(
    `Supervisor: ${demoSupervisor.email} / ${demoSupervisor.password} (${demoSupervisor.id})`
  );
}

seedDemoData().catch((error: unknown) => {
  console.error("Demo data setup failed:", error);
  process.exitCode = 1;
});
