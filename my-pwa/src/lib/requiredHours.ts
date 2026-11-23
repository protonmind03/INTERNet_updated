// Required OJT hours, as the server checks them (backend/src/services/academics.ts).

/** What a new student gets when neither they nor their program has hours (migration 077). */
export const FALLBACK_REQUIRED_HOURS = 180;
export const MAX_REQUIRED_HOURS = 5000;

/** True for a whole number of hours from 1 to MAX_REQUIRED_HOURS. */
export const isWholeHours = (hours: number): boolean =>
  Number.isInteger(hours) && hours >= 1 && hours <= MAX_REQUIRED_HOURS;
