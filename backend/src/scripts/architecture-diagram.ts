import fs from "node:fs";
import path from "node:path";
import { registeredRoutes } from "./check-route-tests";

// Writes docs/ARCHITECTURE.md: the system as a Mermaid diagram, made from the
// code itself, so it cannot drift from it again (roadmap 8.8; it replaces the
// hand-drawn prototype diagram the October audit found out of date).
//
//   npm run docs:architecture            write it
//   npm run docs:architecture -- --check fail if the file is not what the code says (CI)
//
// What it reads, and nothing else:
// - every route registration, app.<method>("/api/..."), in backend/src (the
//   same reading as check:route-tests), grouped by the file that registers it;
// - every import of backend/src/services/ from the route files, server.ts,
//   the services themselves and the scheduled backup script;
// - the outside systems, from the packages those files import (pg,
//   nodemailer, web-push, the storage SDKs, @simplewebauthn/server) and the
//   email provider setting in the mailer;
// - Iteration 23, the app's side: its pages (the build inputs in
//   my-pwa/vite.config.ts: the landing page and the app), the doors (the
//   "/{role}/sign-in" routes in my-pwa/src/App.tsx) and the installable
//   apps (the manifests in my-pwa/public).

const backendRoot = path.resolve(__dirname, "..", "..");
const repoRoot = path.resolve(backendRoot, "..");
const src = path.join(backendRoot, "src");
const out = path.join(repoRoot, "docs", "ARCHITECTURE.md");

const read = (file: string) => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const tsIn = (directory: string) =>
  fs.existsSync(directory)
    ? fs.readdirSync(directory).filter((name) => name.endsWith(".ts")).sort().map((name) => path.join(directory, name))
    : [];

/** "routes/appeals.ts" from a full path. */
const rel = (file: string) => path.relative(src, file).replace(/\\/g, "/");
/** A Mermaid node id from a file. */
const idOf = (file: string) => rel(file).replace(/\.ts$/, "").replace(/[^A-Za-z0-9]/g, "_");

/** The services a file imports (by its relative imports into services/). */
function serviceImports(file: string): string[] {
  const text = read(file);
  const found = new Set<string>();
  for (const match of text.matchAll(/from\s+["']([^"']+)["']/g)) {
    const target = match[1];
    if (!target.startsWith(".")) continue;
    const resolved = path.resolve(path.dirname(file), target).replace(/\.ts$/, "") + ".ts";
    if (resolved.startsWith(path.join(src, "services") + path.sep) && fs.existsSync(resolved)) found.add(resolved);
  }
  return [...found].sort();
}

/** The packages a file imports. */
function packageImports(file: string): string[] {
  const text = read(file);
  const found = new Set<string>();
  for (const match of text.matchAll(/(?:from\s+|import\()\s*["']([^"'.][^"']*)["']/g)) {
    const name = match[1].startsWith("@") ? match[1].split("/").slice(0, 2).join("/") : match[1].split("/")[0];
    if (!name.startsWith("node:")) found.add(name);
  }
  return [...found].sort();
}

/** The outside systems the diagram shows, by the package (or setting) that reaches them. */
const EXTERNAL: { id: string; label: string; packages: string[]; text?: RegExp }[] = [
  { id: "ext_postgres", label: "PostgreSQL", packages: ["pg"] },
  { id: "ext_smtp", label: "Mail server SMTP", packages: ["nodemailer"] },
  { id: "ext_email_api", label: "Email provider API", packages: [], text: /EMAIL_PROVIDER/ },
  { id: "ext_push", label: "Browser push services", packages: ["web-push"] },
  { id: "ext_bucket", label: "Object storage R2 or S3", packages: ["@aws-sdk/client-s3"] },
  { id: "ext_azure", label: "Azure Blob Storage", packages: ["@azure/storage-blob"] },
  { id: "ext_webauthn", label: "The phone's screen lock, WebAuthn passkeys", packages: ["@simplewebauthn/server"] },
];

const pwaRoot = path.join(repoRoot, "my-pwa");

/** The app's pages, doors and installable apps, read from its files. */
function clientParts(): { pages: string[]; doors: string[]; manifests: { file: string; name: string; id: string }[] } {
  const config = read(path.join(pwaRoot, "vite.config.ts"));
  const inputs = config.match(/input:\s*\{([^}]*)\}/)?.[1] ?? "";
  const pages = [...inputs.matchAll(/path\.resolve\('([^']+)'\)/g)].map((match) => match[1]);
  const app = read(path.join(pwaRoot, "src", "App.tsx"));
  const doors = [...app.matchAll(/path="(\/[a-z]+\/sign-in)"/g)].map((match) => match[1]);
  const publicDir = path.join(pwaRoot, "public");
  const manifests = fs
    .readdirSync(publicDir)
    .filter((name) => name === "manifest.json" || name.endsWith(".webmanifest"))
    .sort()
    .map((file) => {
      const manifest = JSON.parse(read(path.join(publicDir, file)));
      return { file, name: String(manifest.name), id: String(manifest.id) };
    });
  return { pages, doors, manifests };
}

function build(): string {
  const routeFiles = [path.join(src, "server.ts"), ...tsIn(path.join(src, "routes"))];
  const serviceFiles = tsIn(path.join(src, "services"));
  const backupScript = path.join(src, "scripts", "backup-cron.ts");
  const routes = registeredRoutes(routeFiles);

  // Routes by the file that registers them, with their address families.
  const byFile = new Map<string, { count: number; prefixes: Map<string, number> }>();
  for (const route of routes) {
    const file = path.join(backendRoot, route.where.split(":")[0]);
    const entry = byFile.get(file) ?? { count: 0, prefixes: new Map() };
    entry.count += 1;
    const prefix = "/api/" + (route.path.split("/")[2] ?? "");
    entry.prefixes.set(prefix, (entry.prefixes.get(prefix) ?? 0) + 1);
    byFile.set(file, entry);
  }
  const prefixText = (file: string, limit: number) =>
    [...(byFile.get(file)?.prefixes ?? new Map<string, number>()).entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([prefix]) => prefix);

  // Who imports which service.
  const users = new Map<string, Set<string>>();
  const edges: [string, string][] = [];
  for (const file of [...routeFiles, ...serviceFiles, backupScript]) {
    if (!fs.existsSync(file)) continue;
    for (const service of serviceImports(file)) {
      if (service === file) continue;
      edges.push([idOf(file), idOf(service)]);
      const set = users.get(service) ?? new Set<string>();
      set.add(rel(file));
      users.set(service, set);
    }
  }
  const shownServices = serviceFiles.filter((file) => users.has(file));

  // Outside systems, from the packages each file imports.
  const externalEdges: [string, string][] = [];
  const externalsShown = new Set<string>();
  for (const file of [...routeFiles, ...serviceFiles, backupScript]) {
    if (!fs.existsSync(file)) continue;
    const packages = packageImports(file);
    const text = read(file);
    for (const external of EXTERNAL) {
      if (external.packages.some((name) => packages.includes(name)) || (external.text && external.text.test(text) && rel(file) === "services/mailer.ts")) {
        externalEdges.push([idOf(file), external.id]);
        externalsShown.add(external.id);
      }
    }
  }

  const client = clientParts();
  const lines: string[] = [];
  lines.push("flowchart LR");
  lines.push('  subgraph client["my-pwa, the React PWA"]');
  if (client.pages.includes("index.html")) lines.push('    landing["index.html, the landing page<br/>pre-rendered at build, src/landing"]');
  if (client.doors.length > 0) lines.push(`    doors["The doors<br/>${client.doors.join(", ")}"]`);
  lines.push('    pwa["Student, supervisor and coordinator portals<br/>app.html, offline queue, service worker"]');
  lines.push(`    apps["Installable apps<br/>${client.manifests.map((item) => item.name).join(", ")}"]`);
  lines.push("  end");
  if (client.pages.includes("index.html")) lines.push("  landing --> doors");
  if (client.doors.length > 0) lines.push("  doors --> pwa");
  lines.push("  apps --> doors");
  lines.push('  subgraph api["backend, the Express API"]');
  for (const file of routeFiles.filter((candidate) => byFile.has(candidate))) {
    const info = byFile.get(file)!;
    lines.push(`    ${idOf(file)}["${rel(file)}<br/>${info.count} routes: ${prefixText(file, 3).join(", ")}"]`);
  }
  lines.push("  end");
  lines.push('  subgraph services["backend/src/services"]');
  for (const file of shownServices) lines.push(`    ${idOf(file)}["${rel(file).replace(/^services\//, "")}"]`);
  lines.push("  end");
  if (fs.existsSync(backupScript)) {
    lines.push('  subgraph cron["Railway cron service, nightly"]');
    lines.push(`    ${idOf(backupScript)}["${rel(backupScript)}<br/>pg_dump, encrypted, to the backup bucket"]`);
    lines.push("  end");
  }
  lines.push('  subgraph outside["Outside systems"]');
  for (const external of EXTERNAL.filter((item) => externalsShown.has(item.id))) lines.push(`    ${external.id}["${external.label}"]`);
  lines.push("  end");
  lines.push('  pwa -->|"HTTPS JSON and the /api/events stream"| api');
  for (const [from, to] of [...new Set(edges.map((edge) => edge.join(" ")))].sort().map((edge) => edge.split(" "))) {
    lines.push(`  ${from} --> ${to}`);
  }
  for (const [from, to] of [...new Set(externalEdges.map((edge) => edge.join(" ")))].sort().map((edge) => edge.split(" "))) {
    lines.push(`  ${from} -.-> ${to}`);
  }

  const routeRows = routeFiles
    .filter((file) => byFile.has(file))
    .map((file) => `| \`${rel(file)}\` | ${byFile.get(file)!.count} | ${prefixText(file, 8).map((prefix) => `\`${prefix}\``).join(", ")} |`);
  const manifestRows = client.manifests.map((item) => `| \`public/${item.file}\` | ${item.name} | \`${item.id}\` |`);
  const serviceRows = shownServices.map(
    (file) => `| \`${rel(file).replace(/^services\//, "")}\` | ${[...(users.get(file) ?? [])].sort().map((user) => `\`${user}\``).join(", ")} |`
  );

  return [
    "# Architecture",
    "",
    "Generated by `backend/src/scripts/architecture-diagram.ts` from the code:",
    "the route registrations, the imports of `backend/src/services/`, and the",
    "packages that reach outside systems. **Do not edit by hand**: run",
    "`npm run docs:architecture` in `backend` after a change. CI runs it with",
    "`--check` and fails when this file no longer matches the code.",
    "",
    `${routes.length} routes in ${byFile.size} files; ${shownServices.length} services in use.`,
    "Solid arrows are imports; dotted arrows reach a system outside the code.",
    "",
    "```mermaid",
    ...lines,
    "```",
    "",
    "## Route files",
    "",
    "| File | Routes | Address families (most routes first) |",
    "|---|---|---|",
    ...routeRows,
    "",
    "## The app's pages and installable apps",
    "",
    `Pages built: ${client.pages.map((page) => "`" + page + "`").join(", ")}. Doors: ${client.doors.map((door) => "`" + door + "`").join(", ")}.`,
    "",
    "| Manifest | App | id |",
    "|---|---|---|",
    ...manifestRows,
    "",
    "## Services and who uses them",
    "",
    "| Service | Imported by |",
    "|---|---|",
    ...serviceRows,
    "",
  ].join("\n");
}

const text = build();
if (process.argv.includes("--check")) {
  const current = fs.existsSync(out) ? read(out) : "";
  if (current !== text) {
    console.error("docs/ARCHITECTURE.md does not match the code. Run `npm run docs:architecture` in backend and commit the result.");
    process.exit(1);
  }
  console.log("docs/ARCHITECTURE.md matches the code.");
} else {
  fs.writeFileSync(out, text);
  console.log(`Wrote ${path.relative(repoRoot, out)}.`);
}
