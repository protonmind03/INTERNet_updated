// Iteration 0 baseline: turns axe-before.json and lighthouse-before.json into the tables in README.md.
//   node summarise.cjs ../axe-before.json ../lighthouse-before.json
const fs = require("fs");
const [axeFile, lighthouseFile] = process.argv.slice(2);
const lines = [];

if (axeFile && fs.existsSync(axeFile)) {
  const axe = JSON.parse(fs.readFileSync(axeFile, "utf8"));
  const pages = axe.results.length;
  const states = axe.results.reduce((sum, r) => sum + r.states.length, 0);
  // One line per rule broken, with every page and state it was found in.
  const byRule = new Map();
  for (const record of axe.results) {
    for (const state of record.states) {
      for (const violation of state.violations) {
        const entry = byRule.get(violation.id) ?? { id: violation.id, impact: violation.impact, help: violation.help, where: [], targets: new Set() };
        entry.where.push(`${record.width} px ${record.path}${state.state === "page" ? "" : ` (${state.state})`}`);
        for (const node of violation.nodes) entry.targets.add(node.target);
        byRule.set(violation.id, entry);
      }
    }
  }
  const errors = axe.results.filter((r) => r.error);
  lines.push(`## Accessibility (axe-core, ${axe.rules})`, "");
  lines.push(`${pages} page loads (every route, at 390 px and 1280 px), ${states} states checked in all (the page itself plus each menu, tab and dialog it opened), ${axe.minutes} minutes. Run ${axe.when}.`, "");
  if (byRule.size === 0) lines.push("**No violations.**", "");
  else {
    lines.push("| Rule | Impact | What it means | Where (width, page, state) | Elements |", "|---|---|---|---|---|");
    for (const entry of byRule.values()) {
      lines.push(`| \`${entry.id}\` | ${entry.impact} | ${entry.help} | ${entry.where.join("; ")} | ${[...entry.targets].slice(0, 4).map((t) => `\`${t}\``).join(", ")} |`);
    }
    lines.push("");
  }
  if (errors.length) lines.push(`Pages that could not be checked: ${errors.map((r) => `${r.width} px ${r.path} (${r.error})`).join("; ")}`, "");
  lines.push("States per page:", "", "| Width | Portal | Page | Landed on | States | Violations |", "|---|---|---|---|---|---|");
  for (const record of axe.results) {
    const count = record.states.reduce((sum, s) => sum + s.violations.length, 0);
    lines.push(`| ${record.width} | ${record.role} | \`${record.path}\` | \`${record.landed ?? "-"}\` | ${record.states.length} | ${count} |`);
  }
  lines.push("");
}

if (lighthouseFile && fs.existsSync(lighthouseFile)) {
  const lh = JSON.parse(fs.readFileSync(lighthouseFile, "utf8"));
  lines.push(`## Lighthouse (${lh.settings})`, "", `Run ${lh.when}, Lighthouse ${lh.results[0]?.lighthouse}.`, "");
  lines.push("| Page | Performance (3 runs) | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS | Speed index |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const r of lh.results) {
    const m = r.metrics;
    lines.push(`| ${r.name} | **${r.scores.performance}** (${r.performance_runs.join(", ")}) | ${r.scores.accessibility} | ${r.scores["best-practices"]} | ${r.scores.seo} | ${m["first-contentful-paint"]} | ${m["largest-contentful-paint"]} | ${m["total-blocking-time"]} | ${m["cumulative-layout-shift"]} | ${m["speed-index"]} |`);
  }
  lines.push("", "What Lighthouse marked below 90, on the middle run of each page:", "");
  for (const r of lh.results) {
    lines.push(`- **${r.name}:** ${r.failing.map((a) => `${a.title}${a.value ? ` (${a.value})` : ""}`).join("; ") || "nothing"}`);
  }
  lines.push("");
}
console.log(lines.join("\n"));
