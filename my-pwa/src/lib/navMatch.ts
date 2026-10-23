/*
|--------------------------------------------------------------------------
| WHERE AM I? (one menu entry per page)
|--------------------------------------------------------------------------
|
| The side menu, the dock and More each mark one entry as the current
| page, and the side menu opens only the group that entry is in. Every
| entry is scored against the whole address, path and query:
|
|   the path is the entry's, and every query value it names matches   10 + n
|   the address is a page below the entry's (a record, a company)       5
|   the address is one of the entry's other addresses ("also")           1
|
| The highest score wins; a tie goes to the entry listed first. So
| /coordinator/resolution?tab=appeals is Appeals (11), not Concerns (10),
| and a menu never lights two entries or jumps to another group.
|
*/

export type NavEntry = { key: string; path: string; also?: string[] };

export function matchScore(entry: NavEntry, pathname: string, search: string): number {
  const [path, query = ""] = entry.path.split("?");
  if (pathname === path) {
    const wanted = new URLSearchParams(query);
    const have = new URLSearchParams(search);
    let named = 0;
    for (const [key, value] of wanted) {
      if (have.get(key) !== value) return 0;
      named += 1;
    }
    return 10 + named;
  }
  if (pathname.startsWith(`${path}/`)) return 5;
  if ((entry.also ?? []).some((other) => pathname === other || pathname.startsWith(`${other}/`))) return 1;
  return 0;
}

/** The key of the entry the address belongs to, or null when none does. */
export function currentEntry(entries: NavEntry[], pathname: string, search: string): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const entry of entries) {
    const score = matchScore(entry, pathname, search);
    if (score > bestScore) {
      best = entry.key;
      bestScore = score;
    }
  }
  return best;
}
