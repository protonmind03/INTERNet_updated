/*
|--------------------------------------------------------------------------
| PRIVACY NOTICE AND CONSENT
|--------------------------------------------------------------------------
|
| The notice a student reads and agrees to before their first time-in,
| which is when the app first takes their photo. It lives here so the app
| and the server can never show or check different versions.
|
| THE WORDING BELOW IS A PLACEHOLDER. It describes what the system does,
| but it has not been approved by the university. Before real use it must
| be replaced with the text the Data Protection Officer signs off, the
| bracketed parts filled in, `placeholder` set to false and `version`
| changed. Changing the version asks every student to agree again.
|
*/

export type PrivacyNotice = {
  version: string;
  /** True while the wording is a draft that nobody has approved. */
  placeholder: boolean;
  title: string;
  sections: { heading: string; body: string }[];
};

export const PRIVACY_NOTICE: PrivacyNotice = {
  version: "draft-1",
  placeholder: true,
  title: "Privacy notice",
  sections: [
    {
      heading: "What INTERNet keeps about you",
      body:
        "Your name, student ID, email, program and company. Your attendance: the time you time in, take a break and time out, and a photo of your face taken at each time-in together with the result of the camera check. Your tasks, uploaded documents, weekly journals, absences, evaluations and any concern you report. A mobile number and an emergency contact, only if you choose to give them.",
    },
    {
      heading: "Why it is kept",
      body:
        "To record and verify the hours and requirements of your On-the-Job Training. The time-in photo is used only to confirm that you were the one who timed in.",
    },
    {
      heading: "Who can see it",
      body:
        "You, your company supervisor, and the OJT coordinator of the university. It is not shared with anyone else.",
    },
    {
      heading: "How long it is kept",
      body:
        "[TO BE DECIDED BY THE UNIVERSITY: how long attendance photos and records are kept after your OJT ends.]",
    },
    {
      heading: "Your rights",
      body:
        "Under the Data Privacy Act of 2012 (Republic Act No. 10173) you may see the data kept about you, ask for it to be corrected, and ask questions about how it is used. You can download a copy of your data from your Profile at any time. To ask for a correction, talk to your OJT coordinator. [CONTACT OF THE UNIVERSITY'S DATA PROTECTION OFFICER TO BE ADDED.]",
    },
  ],
};

/** True when the student has agreed to the notice as it stands now. */
export function hasCurrentConsent(consentVersion: string | null | undefined): boolean {
  return Boolean(consentVersion) && consentVersion === PRIVACY_NOTICE.version;
}

/**
 * Whether the server itself refuses a time-in without consent. Off unless
 * PRIVACY_CONSENT_REQUIRED=true: the app asks either way, and leaving this
 * off keeps a copy of the app from before the notice existed working until
 * everyone has the new one.
 */
export function consentRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PRIVACY_CONSENT_REQUIRED === "true";
}

/**
 * How many days a time-in photo is kept, or null when photos are kept
 * (PHOTO_RETENTION_DAYS unset, or not a whole number of at least 30).
 */
export function photoRetentionDays(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = (env.PHOTO_RETENTION_DAYS || "").trim();
  if (!/^\d{1,5}$/.test(raw)) return null;
  const days = Number(raw);
  return days >= 30 ? days : null;
}
