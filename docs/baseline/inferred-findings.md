# Iteration 0: the report's "Inferred" findings, checked in the code

Branch `iter-0-baseline`, from `ui-redesign` at `91ecbcd`, 16 October 2026.
Each finding below was checked by reading the files named. None was
checked on a phone or with a camera.

## 1. The mirrored photo (report 3.4, R05)

**The report inferred** that the capture copies the mirrored preview, or
draws to the canvas with a negative horizontal scale.

**The code says otherwise. Corrected.**

- The live preview is mirrored by CSS only:
  `my-pwa/src/components/LivenessCamera.tsx:391`, class `-scale-x-100` on
  the `<video>`. Nothing else in `components/` or `pages/` flips an image.
- The photo is taken from the raw camera frame with no transform:
  `my-pwa/src/lib/liveness/detector.ts:210`,
  `context.drawImage(video, 0, 0, width, height)` in `grabFrame()`. There
  is no `scale(-1, 1)` anywhere in `lib/liveness/`.
- That canvas becomes the file (`LivenessCamera.tsx:270`, `toBlob`), the
  review image in `TimeInDialog.tsx` shows that file as it is, and
  `lib/image.ts#compressPhoto` redraws it the right way round.

So the **saved photo is already un-mirrored**: it shows the scene as
others see it, which is exactly the fix the report proposes. What the
student sees is a mirrored preview while posing, then an un-mirrored
review photo. The flip between those two is most likely what was
reported as "the photo is mirrored".

What R05 needs to decide is therefore which way the review photo should
look to the student, not a code fault. The report's fix (mirrored preview,
raw capture, review showing the saved image) describes the current
behaviour. The supervisor's in-person capture (`pages/supervisor/
RecordTimeIn.tsx:188-189`) uses the phone's own camera app
(`capture="environment"`), which the app does not flip.

## 2. Supervisor notifications that do not open their item (report 4.6, R16)

**The report inferred** either that the supervisor feed ignores the
stored link or maps it to a student-portal path, or that newer routes use
a record type the supervisor router does not know.

**Partly corrected, partly confirmed.**

- **The feed does use the stored link.** `pages/supervisor/
  notifications.tsx:11-15` uses `notificationPath()`
  (`lib/useNotifications.ts:29-31`), which returns `item.link` first and
  only falls back to a guess from the title. No supervisor link points
  into the student portal. There is no `notificationTargets` file in the
  frontend; the rule lives on the server, in
  `backend/src/services/notificationLinks.ts`.
- **The real cause: most supervisor notifications lead to a page, not to
  the item.** The server's own rule (`notificationLink()`, run for every
  supervisor notification the code writes) gives:

  | Notification | Opens | The item itself? |
  |---|---|---|
  | Attendance log ready to verify | `/supervisor/dashboard?focus=attendance-N` | yes |
  | Task submitted | `/supervisor/dashboard?focus=task-N` | yes |
  | Weekly report submitted (again) | `/supervisor/dashboard?focus=journal-N` | yes |
  | Attendance log awaiting verification (live time-in) | `/supervisor/dashboard` | **no**: no record named (`server.ts:2654`) |
  | Late time-out submitted | `/supervisor/dashboard` | **no**: no record named |
  | Absence filed for review | `/supervisor/dashboard` | **no**: no record named (`routes/extensions.ts:211`) |
  | Document submitted for review | `/supervisor/dashboard` | **no**: no record named (`server.ts:9049`) |
  | Time-in recorded without a connection | `/supervisor/attendance` | **no**: names the log, but that page does not read `?focus=` |
  | Coordinator decided an attendance log | `/supervisor/attendance` | **no**: same |
  | Reply on your concern; Concern resolved | `/supervisor/complaints` | **no**: that page does not read `?focus=` |
  | Task past its deadline | `/supervisor/tasks` | **no** |
  | New document required | `/supervisor/documents` | **no** |
  | New intern assigned; reassigned; deactivated; schedule updated | `/supervisor/interns` | **no**: the intern is not named |

  Only `pages/supervisor/dashboardsp.tsx` reads `?focus=` (`useFocus`,
  line 149); no other supervisor page does. The review queue only opens
  the item while it is still waiting, so a link to something already
  decided opens the queue with nothing selected.
- **One more gap found:** the bell. `layouts/SupervisorLayout.tsx:125`
  gives `NotificationBell` no `resolvePath`, so the bell uses
  `notificationPath(item, "")`. A notification stored before links
  existed (migration 018) has no link, and tapping it in the bell does
  nothing. The full Notifications page guesses from the title instead.
- The report's second guess, an unknown record type, is half right: the
  record types are known, but `attendance` only leads to the item on the
  dashboard, and the offline time-in sends it to the Attendance page,
  which ignores it.

## 3. Where the colour (screen-light) test lives (report 3.2, R02/R03)

**The report said** the server chooses the prompts and "the check also
runs a screen-light test", and treated removing it as a policy change in
one place.

**Confirmed where it runs; corrected on how much changes.**

- **It runs on the phone.** `my-pwa/src/lib/liveness/engine.ts`: the
  `flash` phase (line 14, 55, 342), `judgeFlash()` (line 458).
  `components/LivenessCamera.tsx` turns the whole screen into the light
  source (lines 97, 470-475) and hands the readings to the engine
  (line 260).
- **It is already off for anyone who asks for reduced motion:**
  `LivenessCamera.tsx:209`, `createEngine({ ..., flash: !reducedMotion })`.
  The result is then "skipped".
- **The server does not run it, but it relies on it.**
  `backend/src/server.ts:2344-2350`: unless the report says the light
  check "passed", the server requires the spare prompt as well. So a
  "skipped" or "inconclusive" light check costs the student a third
  prompt.
- **The prompts:** `server.ts:2280`, `["blink", "smile", "turn-left",
  "turn-right"]`; `pickLivenessPrompts()` (line 2289) picks two at random
  plus a spare.

So removing the colour test by default is a change in three places, not
one: the engine's phase list, the camera view, and the server's
spare-prompt rule. Without the server change, every student would be
asked a third prompt.
