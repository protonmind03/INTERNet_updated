// Makes the key pair the scheduled backups are encrypted with. Run ONCE, by
// the project owner, on their own computer (never on Railway):
//
//   npm run backup:keygen
//
// It prints two lines and keeps nothing:
//   - the PUBLIC key (age1…): goes into BACKUP_AGE_RECIPIENT on Railway.
//   - the PRIVATE key (AGE-SECRET-KEY-…): the only thing that can open a
//     backup. Save it where the backups are not: a password manager, and a
//     printed copy in a safe place. Never put it on Railway, in the
//     repository or in a chat. Lose it and every backup is unreadable.
//
// Same format as age (age-encryption.org): the age command-line tool can
// open these backups too, with `age -d -i key.txt file.age`.

async function main() {
  const { generateIdentity, identityToRecipient } = await import("age-encryption");
  const identity = await generateIdentity();
  const recipient = await identityToRecipient(identity);
  console.log("");
  console.log("PUBLIC key, for BACKUP_AGE_RECIPIENT on Railway:");
  console.log(`  ${recipient}`);
  console.log("");
  console.log("PRIVATE key. Save it now in a password manager and on paper; it is shown only once:");
  console.log(`  ${identity}`);
  console.log("");
  console.log("Then clear this window (cls, or clear) so the private key is not left on screen.");
}

void main();
