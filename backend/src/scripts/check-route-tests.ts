import fs from "node:fs";
import path from "node:path";

// Fails when a route the API registers is not named by any test.
//
//   npm run check:route-tests
//
// A route counts as tested when its address appears in the API tests
// (backend/test) or the browser journeys (e2e/tests). The match is on text:
// each ":param" part of the route matches a literal part or a ${...}
// placeholder, so `/api/attendance/${logId}/break-end` names
// PUT /api/attendance/:id/break-end. The method is not checked; a test that
// builds an address from pieces is not seen, so write the address out.
//
// CI runs this, so a new route arrives with its test.

const backendRoot = path.resolve(__dirname, "..", "..");
const repoRoot = path.resolve(backendRoot, "..");

function filesUnder(directory: string, pattern: RegExp): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) return entry.name === "node_modules" ? [] : filesUnder(full, pattern);
      return pattern.test(entry.name) ? [full] : [];
    });
}

type Route = { method: string; path: string; where: string };

export function registeredRoutes(sourceFiles: string[]): Route[] {
  const routes: Route[] = [];
  const registration = /\bapp\.(get|post|put|patch|delete)\(\s*(["'`])(\/api[^"'`]*)\2/g;
  for (const file of sourceFiles) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(registration)) {
      const line = text.slice(0, match.index).split("\n").length;
      routes.push({
        method: match[1].toUpperCase(),
        path: match[3],
        where: `${path.relative(backendRoot, file).replace(/\\/g, "/")}:${line}`,
      });
    }
  }
  return routes;
}

/** A pattern that finds the route's address in test code. */
export function routePattern(routePath: string): RegExp {
  const parts = routePath.split("/").map((part) => {
    if (part.startsWith(":")) return String.raw`(?:\$\{[^}]+\}|[^/\s"'\x60?#]+)`;
    return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  // The address must end there: followed by a quote, query, or the end of a
  // template, never by more path.
  return new RegExp(`${parts.join("/")}(?=["'\x60?#)\\s]|$)`, "m");
}

function main() {
  const sources = filesUnder(path.join(backendRoot, "src"), /\.ts$/).filter(
    (file) => !file.includes(`${path.sep}scripts${path.sep}`)
  );
  const routes = registeredRoutes(sources);
  if (routes.length === 0) {
    console.error("No routes were found; the registration pattern no longer matches server.ts.");
    process.exit(1);
  }

  const testText = [
    ...filesUnder(path.join(backendRoot, "test"), /\.(c|m)?js$/),
    ...filesUnder(path.join(repoRoot, "e2e", "tests"), /\.ts$/),
  ]
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");

  const missing = routes.filter((route) => !routePattern(route.path).test(testText));
  if (missing.length > 0) {
    console.error(`${missing.length} of ${routes.length} routes have no test that names them:`);
    for (const route of missing) console.error(`  ${route.method.padEnd(6)} ${route.path}  (${route.where})`);
    console.error("Add a test that calls each one (backend/test or e2e/tests).");
    process.exit(1);
  }
  console.log(`All ${routes.length} routes are named by a test.`);
}

if (require.main === module) main();
