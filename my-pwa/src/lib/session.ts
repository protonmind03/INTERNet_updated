import { useEffect, useState } from "react";
import { API_URL } from "./api";
import { purgeOfflineData } from "./offlineStore";

/*
|--------------------------------------------------------------------------
| SIGNED-IN ACCOUNT
|--------------------------------------------------------------------------
|
| Login stores the account record and its token in localStorage. These
| helpers read it back in one place instead of in every page.
|
*/

export type SessionRole = "student" | "supervisor" | "coordinator";

export type StudentAccount = {
  id: number;
  student_id: string;
  email: string;
  name: string;
  program: string | null;
  company: string | null;
  supervisor_id?: string | null;
  required_hours?: number | string | null;
};

export type SupervisorAccount = {
  id: number;
  supervisor_id: string;
  email: string;
  name: string;
  company: string | null;
  department: string | null;
};

export type CoordinatorAccount = {
  coordinator_id: string;
  email: string;
  name: string;
  department: string | null;
};

type AccountFor<R extends SessionRole> = R extends "student"
  ? StudentAccount
  : R extends "supervisor"
    ? SupervisorAccount
    : CoordinatorAccount;

/** The stored account for a role, or null when nobody is signed in. */
export function readAccount<R extends SessionRole>(role: R): AccountFor<R> | null {
  const saved = localStorage.getItem(role);
  if (!saved || !localStorage.getItem(`${role}_token`)) return null;
  try {
    return JSON.parse(saved) as AccountFor<R>;
  } catch {
    void clearSession(role);
    return null;
  }
}

/**
 * Ends the role's session on this device. The returned promise settles when
 * what was kept for offline use has been erased; wait for it before leaving
 * the page with a full reload, or the erase can be cut short.
 */
export function clearSession(role: SessionRole): Promise<void> {
  // Whatever was kept on this device for offline use goes with the session:
  // saved records, drafts and queued actions. Every way of leaving an account
  // (Sign out, an ended session, the forced password change) comes through here.
  const accountId = localStorage.getItem(`${role}_id`);
  const erased = accountId ? purgeOfflineData(role, accountId) : Promise.resolve();

  localStorage.removeItem(role);
  localStorage.removeItem(`${role}_id`);
  localStorage.removeItem(`${role}_token`);
  if (localStorage.getItem("active_role") === role) {
    localStorage.removeItem("active_role");
  }
  window.dispatchEvent(new Event("internet-auth-changed"));
  return erased;
}

/**
 * Signs the role out here and on the server. The local session is cleared
 * straight away; the server is then told to refuse the token and to stop
 * sending this device the account's push notifications. That part is best
 * effort, so signing out still works with no connection.
 */
export function signOut(role: SessionRole): Promise<void> {
  const token = localStorage.getItem(`${role}_token`);
  const erased = clearSession(role);
  if (!token) return erased;

  void (async () => {
    let endpoint: string | undefined;
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      const subscription = await registration?.pushManager?.getSubscription();
      if (subscription) {
        endpoint = subscription.endpoint;
        await subscription.unsubscribe();
      }
    } catch (error) {
      console.error("PUSH UNSUBSCRIBE ERROR:", error);
    }
    try {
      await fetch(`${API_URL}/api/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ endpoint }),
        keepalive: true,
      });
    } catch (error) {
      console.error("SIGN OUT ERROR:", error);
    }
  })();
  return erased;
}

/** Saves an edited account record and tells open layouts to refresh. */
export function updateStoredAccount<R extends SessionRole>(
  role: R,
  changes: Partial<AccountFor<R>>
): void {
  const current = readAccount(role);
  if (!current) return;
  localStorage.setItem(role, JSON.stringify({ ...current, ...changes }));
  window.dispatchEvent(new Event("internet-account-updated"));
}

/** The signed-in account for a role, kept current after profile edits. */
export function useAccount<R extends SessionRole>(role: R): AccountFor<R> | null {
  const [account, setAccount] = useState(() => readAccount(role));

  useEffect(() => {
    const refresh = () => setAccount(readAccount(role));
    window.addEventListener("internet-account-updated", refresh);
    window.addEventListener("internet-auth-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("internet-account-updated", refresh);
      window.removeEventListener("internet-auth-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [role]);

  return account;
}
