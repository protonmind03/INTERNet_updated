INTERNet revisions package
==========================

1. Unzip this so the folder "internet-revisions" sits in the ROOT of your
   INTERNet project (next to my-pwa/ and backend/).
2. Commit or stash your current work first. Claude will make a new branch.
3. Open the project in VS Code, open the Claude Code panel, and send this one
   prompt:

   Read internet-revisions/START_HERE.md and carry out every phase in it, end to end, without stopping between phases. Finish with internet-revisions/REVISION_REPORT.md.

4. Let it run. Have your local database (Docker) running so it can test the
   new migration. When it finishes, read REVISION_REPORT.md and try the app
   on localhost on your phone and computer.

Optional: copy internet-revisions/claude-command/apply-revisions.md to
.claude/commands/ in your project, and you can type /apply-revisions instead.

What's inside:
  START_HERE.md        the full brief Claude follows
  MISSING_ASSETS.md    missing or wrong logos to get from the OJT office
  assets/psu/          the PSU seal, college seals and organisation logos,
                       web-ready (web/) and untouched (original/), plus marks.json
  design/              screenshots, HTML and text of every picked board
