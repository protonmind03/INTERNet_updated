/*
| Iteration 23: when the first-open slides show (components/Onboarding.tsx).
| Only in the installed app (standalone), once per role on each device. The
| key carries a version: new slides get a new key, and show once again.
*/

export type OnboardingRole = "student" | "supervisor" | "coordinator";

export const onboardingKey = (role: OnboardingRole) => `internet.onboarding.${role}.v1`;

export function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function shouldShowOnboarding(role: OnboardingRole): boolean {
  if (!isStandalone()) return false;
  try {
    return localStorage.getItem(onboardingKey(role)) === null;
  } catch {
    return false;
  }
}
