// Writes the three role apps' manifests (Iteration 23), beside the unchanged
// public/manifest.json:
//
//   node scripts/make-role-manifests.mjs
//
// public/manifest-{student,supervisor,coordinator}.webmanifest, each with its
// own id, name, start (the role's door, which opens the portal for someone
// signed in), colours from ROLE_PALETTES (src/brand/tokens.ts), the role
// icons (scripts/make-role-icons.mjs) and the role's shortcuts. The scope is
// "/" for all three: the trainee's pages (/daily-log, /task, ...) are not
// under /student/, and a narrower scope would open them outside the app's
// window. The outputs are kept in the repository; check-pwa.mjs checks them.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tokens = fs.readFileSync(path.join(root, "src", "brand", "tokens.ts"), "utf8");
const colour = (role, key) => tokens.match(new RegExp(`${role}: \{[^}]*?${key}: "(#[0-9A-Fa-f]{6})"`))[1];

const APPS = {
  student: {
    name: "INTERNet Trainee",
    short_name: "Trainee",
    description: "Time in, log the day and follow your OJT hours: Pangasinan State University, Lingayen Campus.",
    shortcuts: [
      ["Today's attendance", "Today", "Time in, lunch break and time out.", "/go/today"],
      ["Daily log", "Log", "Write today's log.", "/daily-log"],
      ["Tasks", "Tasks", "Assigned tasks and their deadlines.", "/task"],
    ],
  },
  supervisor: {
    name: "INTERNet Supervisor",
    short_name: "Supervisor",
    description: "Verify your trainees' days, tasks and documents from one review queue.",
    shortcuts: [
      ["Review queue", "Review", "The days waiting for your review.", "/supervisor/attendance"],
      ["Interns", "Interns", "Your trainees and their hours.", "/supervisor/interns"],
      ["Notifications", "Notifications", "What has changed since you last looked.", "/supervisor/notifications"],
    ],
  },
  coordinator: {
    name: "INTERNet Coordinator",
    short_name: "Coordinator",
    description: "Monitoring, records and settings for the OJT program at PSU Lingayen.",
    shortcuts: [
      ["Action list", "Actions", "What needs the coordinator today.", "/coordinator/dashboard"],
      ["Monitoring", "Monitoring", "Flagged logs and attendance across the program.", "/coordinator/monitoring"],
      ["Students", "Students", "Every trainee and their placement.", "/coordinator/students"],
    ],
  },
};

for (const [role, app] of Object.entries(APPS)) {
  const icon = (kind, side) => ({ src: `/icons/${role}${kind}-${side}.png`, sizes: `${side}x${side}`, type: "image/png", purpose: kind ? "maskable" : "any" });
  const manifest = {
    id: `/${role}/`,
    name: app.name,
    short_name: app.short_name,
    description: app.description,
    lang: "en-PH",
    dir: "ltr",
    start_url: `/${role}/sign-in?source=app`,
    scope: "/",
    display: "standalone",
    background_color: colour(role, "surface"),
    theme_color: colour(role, "chrome"),
    categories: ["education", "productivity"],
    launch_handler: { client_mode: ["navigate-existing", "auto"] },
    icons: [icon("", 192), icon("", 512), icon("-maskable", 192), icon("-maskable", 512)],
    shortcuts: app.shortcuts.map(([name, short_name, description, url]) => ({
      name,
      short_name,
      description,
      url,
      icons: [{ src: `/icons/${role}-192.png`, sizes: "192x192", type: "image/png" }],
    })),
  };
  const file = path.join(root, "public", `manifest-${role}.webmanifest`);
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
  console.log(path.relative(root, file));
}
