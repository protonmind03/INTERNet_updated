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
  // draft-5 (Phase 1.8): health and clearance documents, the optional
  // personal details, and the location check planned for Phase 2.
  // draft-6 (Phase 2.1): the location check as it works. A new version asks
  // every student to agree again.
  version: "draft-6",
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
      heading: "Timing in with no connection",
      body:
        "If you time in where there is no signal, the camera check runs on your phone and your photo waits on the phone until it can be sent; it is removed from the phone once it is sent or refused, or when you sign out. To show the photo and time were not changed, your phone signs them with a key that stays on the phone. This shows the time-in came from your phone, not who was standing at the workplace, so your supervisor still confirms it. The time comes from your phone's clock, and your supervisor is told if the clock was changed while you were offline. Pictures you add to a time-out with no signal wait on the phone the same way, made smaller, and are removed from it once they are sent or refused, or when you sign out.",
    },
    {
      heading: "Files you upload",
      body:
        "Before a photo or picture is kept, the details your phone's camera writes into it are taken out, including where it was taken. PDF and Word files are kept exactly as you upload them, so check them for anything you do not want to share. If you add your signature in Profile, an image of your handwriting is kept and printed on your Time Record; it is not a digital or cryptographic signature, and it is in the copy of your data you can download.",
    },
    {
      heading: "Health and clearance documents",
      body:
        "Your medical examination, urinalysis, chest X-ray and CBC results, and your NBI, police and barangay clearances, are kept to check that you are ready to be deployed. Only you, the OJT coordinator and the OJT Director can open them; your company supervisor cannot, and is not told what is missing. Each time one of them opens one, it is written in the system's audit log. They are never shown in your album, in previews or in exports of your records.",
    },
    {
      heading: "Optional personal details",
      body:
        "You may add your sex, your SSS number and your Pag-IBIG MID number in Profile, or leave them out. Your sex is used only to show which requirements apply to you (some medical tests differ). The SSS and Pag-IBIG numbers are kept for the forms of your company or the government that ask for them, and are shown only to you. You can change or remove them at any time.",
    },
    {
      heading: "Where you are when you time in",
      body:
        "When the OJT office turns the location check on, your phone asks for its location once, when you time in, and only then. It is used to work out how far you were from your company's location, and then dropped: only that distance (to the nearest 10 metres) and whether it is inside your company's area are kept, never where you were. With no connection, your phone works the distance out itself and sends only that. You may say no; your time-in is still recorded, and your supervisor confirms the day. A time-in is never refused for where it was made. Your supervisor, the OJT coordinator and the OJT Director see the result.",
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
