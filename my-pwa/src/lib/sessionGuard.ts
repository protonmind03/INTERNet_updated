import { API_URL } from "./api";
import { clearSession, type SessionRole } from "./session";

type Role = SessionRole;
const roles: Role[] = ["coordinator", "student", "supervisor"];

function roleForAuthorization(header: string | null): Role | null {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  return roles.find((role) => localStorage.getItem(`${role}_token`) === token) ?? null;
}


/**
 * Watches every API response. When the server says the login behind a
 * request is no longer valid (expired, signed out elsewhere, or the account
 * was deactivated), the stored session is cleared and the user is returned
 * to the login page instead of being left on a page that cannot load. When
 * the server says a new password must be set first, the user is taken to
 * the change-password page.
 *
 * Pages call fetch directly, so this wraps it once instead of repeating the
 * same check in every page.
 */
export function installSessionGuard(): void {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    if (response.status !== 401 && response.status !== 403) return response;

    try {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (!url.startsWith(API_URL)) return response;

      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined)
      );
      const role = roleForAuthorization(headers.get("Authorization"));
      if (!role) return response;

      const body = await response.clone().json().catch(() => null);
      if (body?.code === "SESSION_INVALID") {
        clearSession(role);
        sessionStorage.setItem(
          "session_notice",
          "Your session has ended. Please log in again."
        );
        if (window.location.pathname !== "/") window.location.assign("/");
      } else if (
        body?.code === "PASSWORD_CHANGE_REQUIRED" &&
        window.location.pathname !== "/change-password"
      ) {
        window.location.assign(`/change-password?role=${role}`);
      }
    } catch (error) {
      console.error("SESSION GUARD ERROR:", error);
    }
    return response;
  };
}
