import fs from "node:fs";
import path from "node:path";

// Fails when backend code formats a date without saying the time zone.
//
//   npm run lint
//
// The same three rules as the app's ESLint rule (my-pwa/eslint.config.js):
// toLocaleDateString / toLocaleTimeString, new Date().toLocaleString(), and
// new Intl.DateTimeFormat must each name a timeZone in the call. Without
// one they use the host's zone, and a host on UTC is eight hours off. The
// backend's TypeScript is newer than typescript-eslint reads, so this
// checks the text: the call's brackets are matched, comments and strings
// are not looked inside.
//
// Use services/phTime.ts (phClock, phToday, phSql) instead where it fits.

const RULES: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /\.toLocale(?:Date|Time)String\(/g, message: "toLocaleDateString/toLocaleTimeString without a timeZone" },
  { pattern: /new Date\([^()]*\)\.toLocaleString\(/g, message: "new Date().toLocaleString() without a timeZone" },
  { pattern: /new Intl\.DateTimeFormat\(/g, message: "Intl.DateTimeFormat without a timeZone" },
];

/** Blanks out comments and the inside of strings, keeping line breaks and length. */
function codeOnly(text: string): string {
  return text.replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g,
    (match) => (match.startsWith("/") ? match.replace(/[^\n]/g, " ") : match[0] + match.slice(1, -1).replace(/[^\n]/g, " ") + match.slice(-1))
  );
}

/** The text of a call's arguments, from just after its opening bracket. */
function argumentsFrom(text: string, start: number): string {
  let depth = 1;
  for (let index = start; index < text.length; index++) {
    if (text[index] === "(") depth++;
    else if (text[index] === ")" && --depth === 0) return text.slice(start, index);
  }
  return text.slice(start);
}

export function timeZoneProblems(source: string): Array<{ line: number; message: string }> {
  const code = codeOnly(source);
  const problems: Array<{ line: number; message: string }> = [];
  for (const rule of RULES) {
    for (const match of code.matchAll(rule.pattern)) {
      const start = match.index + match[0].length;
      if (/\btimeZone\b/.test(argumentsFrom(code, start))) continue;
      problems.push({ line: code.slice(0, match.index).split("\n").length, message: rule.message });
    }
  }
  return problems.sort((left, right) => left.line - right.line);
}

function filesUnder(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(full);
    return /\.ts$/.test(entry.name) ? [full] : [];
  });
}

function main() {
  const root = path.resolve(__dirname, "..");
  let count = 0;
  for (const file of filesUnder(root)) {
    for (const problem of timeZoneProblems(fs.readFileSync(file, "utf8"))) {
      count++;
      console.error(`${path.relative(process.cwd(), file).replace(/\\/g, "/")}:${problem.line}  ${problem.message}`);
    }
  }
  if (count > 0) {
    console.error(`${count} date${count === 1 ? "" : "s"} formatted without a time zone. Name timeZone in the call, or use services/phTime.ts.`);
    process.exit(1);
  }
  console.log("Every date the backend formats names its time zone.");
}

if (require.main === module) main();
