import { runStaffAccountCli } from "./staff-account-cli";

// Creates an IT administrator account (Phase 1.7): the person who runs the
// system from the admin portal (/admin) and never sees students' records.
// There is no sign-up and no other way to make the first one; after that an
// administrator can make more from the Accounts page.
//
//   npm run admin:create email=it.office@example.edu.ph name="Juan Dela Cruz"
//   npm run admin:create email=it.office@example.edu.ph deactivate
//   (or, straight through tsx or with npm's "--": --email ... --name ... --deactivate)
//
// It prints a temporary password once. The account must set its own at
// first sign-in. On the hosted database, through a tunnel (DEPLOY.md,
// "Running a data script on the hosted database"):
//
//   railway run --service Postgres npm run admin:create <port> email=... name="..."

runStaffAccountCli("admin");
