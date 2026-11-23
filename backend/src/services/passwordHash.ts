// How passwords are stored: bcrypt, 12 rounds. Shared by the server's
// sign-in and scripts/hash-legacy-passwords.ts, so the two agree on what
// counts as a hash.

export const BCRYPT_ROUNDS = 12;

/**
 * A whole bcrypt hash ("$2a$12$" and 53 more characters). A plain-text
 * password that merely starts with "$2" is not one. Written once, in a form
 * JavaScript and PostgreSQL (for queries) read the same way.
 */
export const BCRYPT_HASH_SQL = "^\\$2[aby]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}$";
export const BCRYPT_HASH = new RegExp(BCRYPT_HASH_SQL);
