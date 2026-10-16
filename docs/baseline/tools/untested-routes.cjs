// Iteration 0 baseline: every API route registered in the backend, and which of them no test names.
// A route counts as tested when its path, with each :param standing for any value, appears in the
// API tests (backend/test/*.test.cjs) or the browser journeys (e2e/tests/*.ts). That is a text
// match: a test that builds an address from pieces would be missed, so the list errs on the side
// of "untested".
//
//   node untested-routes.cjs            (prints the untested ones)
//   node untested-routes.cjs --all      (prints every route)
const fs = require("fs");
const path = require("path");
const repo = path.resolve(__dirname, "..", "..", "..");
const src = path.join(repo, "backend", "src");
const files = ["server.ts", ...fs.readdirSync(path.join(src, "routes")).filter((f) => f.endsWith(".ts")).map((f) => `routes/${f}`)];
const pattern = /\bapp\.(get|post|put|patch|delete)\(\s*(["'`])([^"'`]+)\2/g;
const testText = [
  ...fs.readdirSync(path.join(repo, "backend", "test")).filter((f) => f.endsWith(".cjs")).map((f) => path.join(repo, "backend", "test", f)),
  ...fs.readdirSync(path.join(repo, "e2e", "tests")).filter((f) => f.endsWith(".ts")).map((f) => path.join(repo, "e2e", "tests", f)),
].map((file) => fs.readFileSync(file, "utf8")).join("\n");
const named = (route) => {
  const parts = route.split(/:[A-Za-z]+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(parts.join("[^\"'`\\s?]+") + "(?![\\w/-])").test(testText);
};
const routes = [];
for (const file of files) {
  const text = fs.readFileSync(path.join(src, file), "utf8").replace(/\r\n/g, "\n");
  for (const match of text.matchAll(pattern)) {
    routes.push({ method: match[1].toUpperCase(), path: match[3], file, line: text.slice(0, match.index).split("\n").length });
  }
}
const untested = routes.filter((route) => !named(route.path));
const list = process.argv.includes("--all") ? routes : untested;
for (const route of list) console.log(`${route.method.padEnd(6)} ${route.path.padEnd(58)} ${route.file}:${route.line}`);
console.log(`\n${routes.length} routes in ${files.length} files; ${untested.length} named by no test.`);
