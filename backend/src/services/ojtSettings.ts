import type { Pool, PoolClient } from "pg";

/*
|--------------------------------------------------------------------------
| THE OJT PROGRAMME'S RULES (migration 079)
|--------------------------------------------------------------------------
|
| One row a key in ojt_settings, like attendance_rules. Each rule is listed
| here with its default and how a sent value is read, so a key that is not
| listed can never be stored. A change returns the old and the new value
| for the audit log.
|
*/

type Db = Pick<Pool | PoolClient, "query">;

type Setting<T> = {
  label: string;
  fallback: T;
  /** A sent value, or null when it is not acceptable. */
  read: (value: unknown) => T | null;
  /** The stored text back to a value. */
  parse: (text: string) => T;
};

const flag = (label: string, fallback: boolean): Setting<boolean> => ({
  label,
  fallback,
  read: (value) => (typeof value === "boolean" ? value : null),
  parse: (text) => text === "true",
});

/** A whole number from min to max. */
const whole = (label: string, fallback: number, min: number, max: number): Setting<number> => ({
  label,
  fallback,
  read: (value) => (typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null),
  parse: (text) => {
    const value = Number(text);
    return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
  },
});

export const OJT_SETTINGS = {
  // Phase 1.2: time-in only once cleared for deployment. Off until the OJT office turns it on.
  deployment_gate_enabled: flag("Deployment gate", false),
  // Phase 1.5: the HTE's share of the final grade, in percent; the instructor has the rest.
  grade_split_hte: whole("HTE share of the final grade", 50, 1, 99),
} satisfies Record<string, Setting<unknown>>;

export type OjtSettingKey = keyof typeof OJT_SETTINGS;
type ValueOf<K extends OjtSettingKey> = (typeof OJT_SETTINGS)[K]["fallback"];

export const isOjtSettingKey = (key: string): key is OjtSettingKey => Object.prototype.hasOwnProperty.call(OJT_SETTINGS, key);

/** Every rule with its value, for the pages that show them. */
export async function readOjtSettings(db: Db): Promise<Record<OjtSettingKey, unknown>> {
  const rows = (await db.query<{ key: string; value: string }>(`SELECT key, value FROM ojt_settings`)).rows;
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  const out = {} as Record<OjtSettingKey, unknown>;
  for (const key of Object.keys(OJT_SETTINGS) as OjtSettingKey[]) {
    const setting = OJT_SETTINGS[key] as Setting<unknown>;
    const text = stored.get(key);
    out[key] = text === undefined ? setting.fallback : setting.parse(text);
  }
  return out;
}

export async function ojtSetting<K extends OjtSettingKey>(db: Db, key: K): Promise<ValueOf<K>> {
  const setting = OJT_SETTINGS[key] as Setting<ValueOf<K>>;
  const row = (await db.query<{ value: string }>(`SELECT value FROM ojt_settings WHERE key = $1`, [key])).rows[0];
  return row ? setting.parse(row.value) : setting.fallback;
}

/** Stores a rule. Returns the old and new value, or the problem with the value sent. */
export async function changeOjtSetting(
  db: Db,
  key: OjtSettingKey,
  value: unknown,
  actorId: string
): Promise<{ problem: string } | { old: unknown; value: unknown; label: string }> {
  const setting = OJT_SETTINGS[key] as Setting<unknown>;
  const read = setting.read(value);
  if (read === null) return { problem: `That is not a value for ${setting.label.toLowerCase()}.` };
  const old = await ojtSetting(db, key);
  await db.query(
    `INSERT INTO ojt_settings (key, value, updated_by, updated_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [key, String(read), actorId]
  );
  return { old, value: read, label: setting.label };
}
