import fs from "node:fs";
import path from "node:path";
import { confirmed as writeConfirmed, connect } from "./fk-shared";
import { option } from "./pg-tools";

// Links students to program records from the program text already typed
// on their accounts.
//
// Without --confirm it only prints what it would do and changes nothing:
// every distinct spelling of students.program, how many students carry it,
// and the program it proposes for each.
//
// It proposes a program in two ways only, and never guesses:
//
//   exact    the spelling is a program's name or short code, ignoring
//            capitals and outer spaces ("bsit", " BS Information Technology ")
//   mapped   the spelling is listed in the mapping file, which a person
//            wrote: backend/src/scripts/program-mapping.json
//
// Anything else ("BS Info Tech", "IT") is listed as "no proposal" and left
// alone. To link those, add a line for each to the mapping file and run it
// again. The mapping file maps a spelling to a program's name or short
// code:
//
//   { "mappings": { "BS Info Tech": "BSIT", "Information Technology": "BSIT" } }
//
// It only sets students.program_id. The program text on each account is
// left exactly as typed, and majors and blocks are not touched: those are
// set by a coordinator, on the student's form or the Programs page.
//
//   npm run db:backfill-programs               (dry run)
//   npm run db:backfill-programs -- --confirm
//   npm run db:backfill-programs -- --map some/other/file.json
//
// On the hosted database it is run by the project owner, after a backup,
// through a tunnel (DEPLOY.md, "Running a data script on the hosted
// database"):
//
//   railway connect Postgres --tunnel-only
//   railway run --service Postgres npm run db:backfill-programs <port>
//   railway run --service Postgres npm run db:backfill-programs <port> confirm

const key = (value: string) => value.trim().toLowerCase();

/** The mapping a person wrote: spelling (lower case) to what they wrote beside it. */
function readMapping(file: string): Map<string, string> {
  if (!fs.existsSync(file)) return new Map();
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`The mapping file ${file} is not valid JSON: ${error instanceof Error ? error.message : error}`);
  }
  const mappings = (parsed as { mappings?: unknown })?.mappings;
  if (!mappings || typeof mappings !== "object" || Array.isArray(mappings)) {
    throw new Error(`The mapping file ${file} must look like { "mappings": { "spelling": "program name or short code" } }.`);
  }
  const map = new Map<string, string>();
  for (const [spelling, target] of Object.entries(mappings as Record<string, unknown>)) {
    if (typeof target !== "string" || !target.trim()) {
      throw new Error(`In the mapping file, "${spelling}" is not mapped to a program name or short code.`);
    }
    map.set(key(spelling), target.trim());
  }
  return map;
}

async function backfill() {
  const confirmed = writeConfirmed();
  const mappingFile = path.resolve(option("--map") || path.join(__dirname, "program-mapping.json"));
  const mapping = readMapping(mappingFile);
  const client = await connect();
  try {
    if (!confirmed) await client.query("SET default_transaction_read_only = on");

    const programs = await client.query<{ id: number; name: string; short_code: string }>(
      `SELECT id, name, short_code FROM programs ORDER BY name`
    );
    if (programs.rows.length === 0) {
      console.log("There are no program records yet. Run the migrations first (npm run db:migrate).");
      return;
    }
    // A program is found by its name or its short code, exactly, whatever the capitals.
    const programOf = new Map<string, { id: number; name: string; short_code: string }>();
    for (const row of programs.rows) programOf.set(key(row.short_code), row);
    for (const row of programs.rows) programOf.set(key(row.name), row);

    // A mapping to something that is not a program is the writer's mistake: say so before anything else.
    const unknown = [...mapping.entries()].filter(([, target]) => !programOf.has(key(target)));
    if (unknown.length > 0) {
      throw new Error(
        `The mapping file names ${unknown.length === 1 ? "a program that does" : "programs that do"} not exist: ` +
          unknown.map(([spelling, target]) => `"${spelling}" -> "${target}"`).join(", ") +
          ". Use a program's exact name or short code."
      );
    }

    const typed = await client.query<{ key: string; spelling: string; students: string; linked: string }>(`
      SELECT LOWER(TRIM(program)) AS key, TRIM(program) AS spelling,
             COUNT(*) AS students, COUNT(program_id) AS linked
      FROM students
      WHERE program IS NOT NULL AND TRIM(program) <> ''
      GROUP BY LOWER(TRIM(program)), TRIM(program)
      ORDER BY LOWER(TRIM(program)), COUNT(*) DESC
    `);
    const blank = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM students WHERE program IS NULL OR TRIM(program) = ''`
    );
    if (typed.rows.length === 0) {
      console.log("No program is typed on any student.");
      return;
    }

    const rows = typed.rows.map((row) => {
      const exact = programOf.get(row.key);
      const mapped = exact ? undefined : programOf.get(key(mapping.get(row.key) ?? ""));
      const program = exact ?? mapped ?? null;
      return {
        key: row.key,
        spelling: row.spelling,
        students: Number(row.students),
        linked: Number(row.linked),
        program,
        how: exact ? "exact" : mapped ? "mapped" : "no proposal",
      };
    });

    console.log(`Mapping file: ${mappingFile} (${mapping.size} ${mapping.size === 1 ? "spelling" : "spellings"})`);
    console.table(
      rows.map((row) => ({
        "program as typed": row.spelling,
        students: row.students,
        "already linked": row.linked,
        "proposed program": row.program ? `${row.program.short_code}: ${row.program.name}` : "",
        how: row.how,
      }))
    );
    const linkable = rows.filter((row) => row.program);
    const left = rows.filter((row) => !row.program);
    console.log(
      `${rows.length} ${rows.length === 1 ? "spelling" : "spellings"}: ${linkable.length} with a proposal, ${left.length} with none` +
        ` (${left.reduce((sum, row) => sum + row.students, 0)} students).` +
        (Number(blank.rows[0].count) > 0 ? ` ${blank.rows[0].count} students have no program typed at all.` : "")
    );
    if (left.length > 0) {
      console.log(
        `To link a spelling with no proposal, add it to the mapping file, for example: "${left[0].spelling}": "<program short code>".`
      );
    }

    if (!confirmed) {
      console.log("Dry run: nothing was changed. Run again with --confirm to apply.");
      return;
    }

    await client.query("BEGIN");
    try {
      let linked = 0;
      for (const row of linkable) {
        // Only students not already on that program; the text is not touched.
        const result = await client.query(
          `UPDATE students SET program_id = $1
           WHERE program_id IS DISTINCT FROM $1 AND LOWER(TRIM(program)) = $2`,
          [row.program!.id, row.key]
        );
        linked += result.rowCount ?? 0;
      }
      await client.query("COMMIT");
      console.log(`Done: ${linked} student(s) linked to a program. Spellings with no proposal were left as they are.`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.end();
  }
}

backfill().catch((error: unknown) => {
  console.error("Program backfill failed. Nothing was changed.", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
