import { runStaffAccountCli } from "./staff-account-cli";

// Creates an OJT Director account (Phase 1.6).
//
// Once an active Director exists, the coordinators no longer manage
// coordinator accounts, the programs or the OJT rules: the Director does
// (server.ts, requireOffice). An IT administrator can also make one from
// the admin portal's Accounts page (Phase 1.7).
//
//   npm run director:create email=director@example.edu.ph name="Juana Dela Cruz"
//   npm run director:create email=director@example.edu.ph deactivate
//   (or, straight through tsx or with npm's "--": --email ... --name ... --deactivate)
//
// It prints a temporary password once. The account must set its own at
// first sign-in. On the hosted database, through a tunnel (DEPLOY.md,
// "Running a data script on the hosted database"):
//
//   railway run --service Postgres npm run director:create <port> email=... name="..."

runStaffAccountCli("director");
