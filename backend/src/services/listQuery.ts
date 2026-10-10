/*
|--------------------------------------------------------------------------
| PAGING AND FILTERING A LIST
|--------------------------------------------------------------------------
|
| The list routes used to send every row. They now also take, all optional:
|
|   limit, offset   a page of rows; the answer then carries `total`
|   q               text to look for
|   status          one status
|   from, to        a date range, YYYY-MM-DD
|
| A request that sends none of them is answered exactly as before, with the
| same query. When any is sent, the route's own query is kept as it is and
| wrapped: filtered and counted from the outside, by the names of the
| columns it returns. Each route says which of its columns may be searched,
| which holds the status and which the date, so nothing else can be reached
| through these parameters. The values themselves are always passed to the
| database as parameters, never written into the SQL.
|
*/

export type ListOptions = {
  /** How to order the rows, by output column: "name ASC, id ASC". */
  order: string;
  /** Output columns `q` looks in. Leave out when the route handles `q` itself. */
  search?: string[];
  /** Output column `status` is matched against. Leave out when the route handles it. */
  status?: string;
  /** Output column `from` and `to` apply to. */
  date?: string;
};

export type ListRequest = {
  limit: number | null;
  offset: number;
  q: string;
  status: string;
  from: string;
  to: string;
};

export const MAX_PAGE_SIZE = 200;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function single(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function realDate(value: string): boolean {
  return DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Reads the paging and filter parameters, or says why they cannot be used. */
export function readListRequest(
  query: Record<string, unknown>
): { request: ListRequest } | { problem: string } {
  const rawLimit = single(query.limit);
  const rawOffset = single(query.offset);
  let limit: number | null = null;
  if (rawLimit !== "") {
    if (!/^\d{1,6}$/.test(rawLimit) || Number(rawLimit) < 1) {
      return { problem: "limit must be a whole number, 1 or more." };
    }
    limit = Math.min(Number(rawLimit), MAX_PAGE_SIZE);
  }
  let offset = 0;
  if (rawOffset !== "") {
    if (!/^\d{1,9}$/.test(rawOffset)) {
      return { problem: "offset must be a whole number, 0 or more." };
    }
    offset = Number(rawOffset);
  }
  const from = single(query.from);
  const to = single(query.to);
  if ((from && !realDate(from)) || (to && !realDate(to))) {
    return { problem: "Dates must be written as YYYY-MM-DD." };
  }
  if (from && to && from > to) {
    return { problem: "The start date must not be after the end date." };
  }
  const q = single(query.q);
  if (q.length > 100) return { problem: "Search text must be 100 characters or fewer." };

  return { request: { limit, offset, q, status: single(query.status).slice(0, 40), from, to } };
}

const column = (name: string) => {
  // Column names come from the route's own options, never from the request.
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Not a column name: ${name}`);
  return `page."${name}"`;
};

/**
 * Wraps a route's query for one request. Returns null when the request asks
 * for nothing new, which means: run the original query untouched.
 */
export function buildListQuery(
  sql: string,
  paramCount: number,
  options: ListOptions,
  request: ListRequest
): { rowsSql: string; values: unknown[]; countSql: string | null; countValues: unknown[] } | null {
  const conditions: string[] = [];
  const values: unknown[] = [];
  const next = (value: unknown) => {
    values.push(value);
    return `$${paramCount + values.length}`;
  };

  if (options.search && request.q) {
    const term = next(`%${request.q.replace(/[\\%_]/g, "\\$&")}%`);
    conditions.push(
      `(${options.search.map((name) => `${column(name)}::text ILIKE ${term}`).join(" OR ")})`
    );
  }
  if (options.status && request.status) {
    conditions.push(`${column(options.status)}::text = ${next(request.status)}`);
  }
  if (options.date && request.from) {
    conditions.push(`${column(options.date)}::date >= ${next(request.from)}::date`);
  }
  if (options.date && request.to) {
    conditions.push(`${column(options.date)}::date <= ${next(request.to)}::date`);
  }

  if (conditions.length === 0 && request.limit === null && request.offset === 0) return null;

  // A fixed cap on the route's own query ("LIMIT 300") was there to keep an
  // unpaged answer small. A paged request reaches past it.
  const inner = sql.trim().replace(/;\s*$/, "").replace(/\bLIMIT\s+\d+\s*$/i, "");
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const order = options.order
    .split(",")
    .map((part) => {
      const [name, direction = "ASC"] = part.trim().split(/\s+/);
      return `${column(name)} ${direction.toUpperCase() === "DESC" ? "DESC" : "ASC"}`;
    })
    .join(", ");

  // The count uses the filters only, so it is taken before the page is added.
  const countValues = [...values];
  let rowsSql = `SELECT * FROM (${inner}) AS page ${where} ORDER BY ${order}`;
  if (request.limit !== null) rowsSql += ` LIMIT ${next(request.limit)}`;
  if (request.offset > 0) rowsSql += ` OFFSET ${next(request.offset)}`;

  return {
    rowsSql,
    values,
    countSql:
      request.limit !== null
        ? `SELECT COUNT(*) AS total FROM (${inner}) AS page ${where}`
        : null,
    countValues,
  };
}
