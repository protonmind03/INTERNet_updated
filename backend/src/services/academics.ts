/*
|--------------------------------------------------------------------------
| COLLEGES, PROGRAMS, MAJORS AND BLOCKS
|--------------------------------------------------------------------------
|
| The academic structure a student belongs to (migration 037), and the one
| place that decides where a student is put in it. A student's placement
| is named in two ways: by ids, from the pickers on the coordinator's
| student form, and by words, from the columns of an imported file. Both
| come through `resolvePlacement`, so both follow the same rules:
|
|   * a major belongs to the student's program;
|   * a block belongs to the student's program, and if the block is of one
|     major the student is of that major;
|   * a program found by its name or its short code, whatever the capitals;
|   * a block found by its name as displayed: "BSIT 4A".
|
| students.program stays the text that is displayed. When a program is
| chosen its name is written there; when only text is given it is kept as
| typed, and linked if it happens to be a program's name or short code.
|
*/

import type { Pool, PoolClient } from "pg";

type Db = Pool | PoolClient;

export type College = { id: number; name: string; short_name: string | null; is_active: boolean };
export type Program = {
  id: number;
  college_id: number;
  name: string;
  short_code: string;
  ojt_applies: boolean;
  is_active: boolean;
};
export type Major = { id: number; program_id: number; name: string; is_active: boolean };
export type Block = {
  id: number;
  program_id: number;
  major_id: number | null;
  year_level: number;
  section: string;
  term_id: number | null;
  is_active: boolean;
  /** "BSIT 4A": the program's short code, the year and the section. */
  name: string;
  term_name: string | null;
  term_closed: boolean;
};

export type Catalogue = { colleges: College[]; programs: Program[]; majors: Major[]; blocks: Block[] };

/** A block's name as displayed, for a query that joins blocks b to their program p. */
export const BLOCK_NAME_SQL = `p.short_code || ' ' || b.year_level || UPPER(TRIM(b.section))`;

export async function loadCatalogue(db: Db): Promise<Catalogue> {
  const [colleges, programs, majors, blocks] = await Promise.all([
    db.query<College>(`SELECT id, name, short_name, is_active FROM colleges ORDER BY name`),
    db.query<Program>(
      `SELECT id, college_id, name, short_code, ojt_applies, is_active FROM programs ORDER BY name`
    ),
    db.query<Major>(`SELECT id, program_id, name, is_active FROM majors ORDER BY name`),
    db.query<Block>(
      `SELECT b.id, b.program_id, b.major_id, b.year_level, UPPER(TRIM(b.section)) AS section,
              b.term_id, b.is_active, ${BLOCK_NAME_SQL} AS name,
              t.name AS term_name, COALESCE(t.is_closed, FALSE) AS term_closed
       FROM blocks b
       JOIN programs p ON p.id = b.program_id
       LEFT JOIN terms t ON t.id = b.term_id
       ORDER BY p.short_code, b.year_level, UPPER(TRIM(b.section)), b.id`
    ),
  ]);
  return { colleges: colleges.rows, programs: programs.rows, majors: majors.rows, blocks: blocks.rows };
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** "bsit 4a", "BSIT  4A" and "BSIT4A" are the same block name. */
const blockKey = (value: string) => value.replace(/\s+/g, "").toLowerCase();

export type PlacementInput = {
  /** From the pickers. `undefined` means the field was not sent. */
  program_id?: unknown;
  major_id?: unknown;
  block_id?: unknown;
  /** From a file, or the free-text program on the form. */
  college?: string;
  program?: string;
  major?: string;
  block?: string;
};

export type Placement = {
  program_id: number | null;
  major_id: number | null;
  block_id: number | null;
  /** What students.program should say. */
  program_text: string | null;
  /** Something the person should know that is not an error. */
  note?: string;
};

const wholeId = (value: unknown): number | null | "bad" => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : "bad";
};

/**
 * Works out where a student is placed from what was given, or says in
 * plain words why it cannot be. Ids win over words where both are given.
 */
export function resolvePlacement(catalogue: Catalogue, input: PlacementInput): { problem: string } | Placement {
  const typedProgram = (input.program ?? "").trim();
  const typedCollege = (input.college ?? "").trim();
  const typedMajor = (input.major ?? "").trim();
  const typedBlock = (input.block ?? "").trim();

  const programId = wholeId(input.program_id);
  const majorId = wholeId(input.major_id);
  const blockId = wholeId(input.block_id);
  if (programId === "bad") return { problem: "That is not a program." };
  if (majorId === "bad") return { problem: "That is not a major." };
  if (blockId === "bad") return { problem: "That is not a block." };

  // The college, when one is named: only used to check the program is in it.
  let college: College | undefined;
  if (typedCollege) {
    college = catalogue.colleges.find(
      (item) => same(item.name, typedCollege) || (item.short_name && same(item.short_name, typedCollege))
    );
    if (!college) return { problem: `There is no college named "${typedCollege}".` };
  }

  // The program: by id, or by its name or short code.
  let program: Program | undefined;
  if (programId !== null) {
    program = catalogue.programs.find((item) => item.id === programId);
    if (!program) return { problem: "That program does not exist." };
  } else if (typedProgram) {
    program =
      catalogue.programs.find((item) => same(item.name, typedProgram)) ??
      catalogue.programs.find((item) => same(item.short_code, typedProgram));
  }
  if (program && college && program.college_id !== college.id) {
    return { problem: `${program.name} is not a program of the ${college.name}.` };
  }

  const wantsMajor = majorId !== null || typedMajor !== "";
  const wantsBlock = blockId !== null || typedBlock !== "";
  if (!program) {
    // Free text only: kept as typed, as it always was. A college, major or
    // block cannot hang on a program the system does not know.
    if (wantsMajor || wantsBlock || college) {
      return {
        problem: typedProgram
          ? `"${typedProgram}" is not a program's name or short code, so a college, major or block cannot be set with it.`
          : "A college, major or block needs a program.",
      };
    }
    return {
      program_id: null,
      major_id: null,
      block_id: null,
      program_text: typedProgram || null,
      ...(typedProgram
        ? { note: `"${typedProgram}" is not one of the listed programs; it is kept as text.` }
        : {}),
    };
  }

  let major: Major | undefined;
  if (majorId !== null) {
    major = catalogue.majors.find((item) => item.id === majorId);
    if (!major) return { problem: "That major does not exist." };
  } else if (typedMajor) {
    major = catalogue.majors.find((item) => item.program_id === program!.id && same(item.name, typedMajor));
    if (!major) return { problem: `${program.name} has no major named "${typedMajor}".` };
  }
  if (major && major.program_id !== program.id) {
    return { problem: `${major.name} is not a major of ${program.name}.` };
  }

  let block: Block | undefined;
  if (blockId !== null) {
    block = catalogue.blocks.find((item) => item.id === blockId);
    if (!block) return { problem: "That block does not exist." };
  } else if (typedBlock) {
    // By name, among this program's blocks that are in use. The same name
    // can exist in two terms; then the one whose term is open is meant.
    let named = catalogue.blocks.filter(
      (item) => item.program_id === program!.id && item.is_active && blockKey(item.name) === blockKey(typedBlock)
    );
    if (major) {
      const ofMajor = named.filter((item) => item.major_id === null || item.major_id === major!.id);
      if (ofMajor.length > 0) named = ofMajor;
    }
    if (named.length > 1) named = named.filter((item) => !item.term_closed);
    if (named.length === 0) {
      return { problem: `${program.name} has no active block named "${typedBlock}". Add it on the Programs page first.` };
    }
    if (named.length > 1) {
      return { problem: `More than one active block is named "${typedBlock}". Set this student's block on their form instead.` };
    }
    block = named[0];
  }
  if (block && block.program_id !== program.id) {
    return { problem: `${block.name} is not a block of ${program.name}.` };
  }
  if (block && block.major_id !== null) {
    if (major && major.id !== block.major_id) {
      return { problem: `${block.name} is a block of another major than ${major.name}.` };
    }
    // The block says which major its students are of.
    major = major ?? catalogue.majors.find((item) => item.id === block!.major_id);
  }

  return {
    program_id: program.id,
    major_id: major?.id ?? null,
    block_id: block?.id ?? null,
    program_text: program.name,
  };
}
