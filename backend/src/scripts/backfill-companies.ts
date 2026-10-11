import { confirmed as writeConfirmed, connect } from "./fk-shared";

// Turns the company names already typed on students, supervisors and
// complaints into company records, and links those rows to them.
//
// Without --confirm it only prints what it would do and changes nothing.
// Names that differ only in capitals or outer spaces are treated as one
// company; the spelling used most often becomes the record's name. Names
// that differ in any other way ("Acme Corp" and "Acme Corporation") are
// listed as separate companies. To merge two, edit the accounts that carry
// the unwanted spelling so they carry the other one; they link themselves.
//
//   npm run db:backfill-companies               (dry run)
//   npm run db:backfill-companies -- --confirm
//
// On the hosted database it is run by the project owner, after a backup,
// through a tunnel (DEPLOY.md, "Running a data script on the hosted
// database"):
//
//   railway connect Postgres --tunnel-only
//   railway run --service Postgres npm run db:backfill-companies <port>
//   railway run --service Postgres npm run db:backfill-companies <port> confirm

type Proposal = {
  key: string;
  name: string;
  spellings: string[];
  students: number;
  supervisors: number;
  complaints: number;
  existingId: number | null;
};

async function backfill() {
  const confirmed = writeConfirmed();
  const client = await connect();
  try {
    if (!confirmed) await client.query("SET default_transaction_read_only = on");

    const typed = await client.query<{
      key: string;
      spelling: string;
      source: string;
      uses: string;
    }>(`
      SELECT LOWER(TRIM(name)) AS key, TRIM(name) AS spelling, source, COUNT(*) AS uses
      FROM (
        SELECT company AS name, 'students' AS source FROM students
        UNION ALL SELECT company, 'supervisors' FROM supervisors
        UNION ALL SELECT company_name, 'complaints' FROM complaints
      ) rows
      WHERE name IS NOT NULL AND TRIM(name) <> ''
      GROUP BY LOWER(TRIM(name)), TRIM(name), source
    `);
    const existing = await client.query<{ id: number; key: string }>(
      `SELECT id, LOWER(TRIM(name)) AS key FROM companies`
    );
    const existingByKey = new Map(existing.rows.map((row) => [row.key, row.id]));

    const proposals = new Map<string, Proposal & { counts: Map<string, number> }>();
    for (const row of typed.rows) {
      const entry =
        proposals.get(row.key) ??
        {
          key: row.key,
          name: row.spelling,
          spellings: [],
          students: 0,
          supervisors: 0,
          complaints: 0,
          existingId: existingByKey.get(row.key) ?? null,
          counts: new Map<string, number>(),
        };
      const uses = Number(row.uses);
      entry.counts.set(row.spelling, (entry.counts.get(row.spelling) ?? 0) + uses);
      if (row.source === "students") entry.students += uses;
      else if (row.source === "supervisors") entry.supervisors += uses;
      else entry.complaints += uses;
      proposals.set(row.key, entry);
    }
    const list = [...proposals.values()]
      .map((entry) => {
        const ranked = [...entry.counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        return { ...entry, name: ranked[0][0], spellings: ranked.map(([spelling]) => spelling) };
      })
      .sort((a, b) => a.key.localeCompare(b.key));

    if (list.length === 0) {
      console.log("No company names are typed on any student, supervisor or complaint.");
      return;
    }

    console.table(
      list.map((entry) => ({
        company: entry.name,
        "other spellings": entry.spellings.slice(1).join(" | ") || "",
        students: entry.students,
        supervisors: entry.supervisors,
        complaints: entry.complaints,
        action: entry.existingId ? "link to existing record" : "create record, then link",
      }))
    );
    const toCreate = list.filter((entry) => !entry.existingId).length;
    console.log(
      `${list.length} compan${list.length === 1 ? "y" : "ies"}: ${toCreate} to create, ${
        list.length - toCreate
      } already recorded.`
    );

    if (!confirmed) {
      console.log("Dry run: nothing was changed. Run again with --confirm to apply.");
      return;
    }

    await client.query("BEGIN");
    try {
      let created = 0;
      let linked = 0;
      for (const entry of list) {
        let id = entry.existingId;
        if (!id) {
          const saved = await client.query<{ id: number }>(
            `INSERT INTO companies (name) VALUES ($1) RETURNING id`,
            [entry.name]
          );
          id = saved.rows[0].id;
          created += 1;
        }
        for (const [table, column] of [
          ["students", "company"],
          ["supervisors", "company"],
          ["complaints", "company_name"],
        ]) {
          const result = await client.query(
            `UPDATE ${table} SET company_id = $1
             WHERE company_id IS DISTINCT FROM $1 AND LOWER(TRIM(${column})) = $2`,
            [id, entry.key]
          );
          linked += result.rowCount ?? 0;
        }
      }
      await client.query("COMMIT");
      console.log(`Done: ${created} company record(s) created, ${linked} row(s) linked.`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.end();
  }
}

backfill().catch((error: unknown) => {
  console.error("Company backfill failed. Nothing was changed.", error);
  process.exitCode = 1;
});
