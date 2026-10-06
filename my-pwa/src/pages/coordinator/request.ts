import { API_URL, withCoordinatorAuth } from "../../lib/api";
import { withWorkingToast } from "../../lib/toast";

/**
 * Calls a coordinator endpoint and returns its JSON. A failed request
 * throws an Error carrying the server's message, so pages can show it.
 */
export async function coordinatorRequest<T = Record<string, unknown>>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
  const response = await fetch(
    `${API_URL}${path}`,
    withCoordinatorAuth({
      method: options.method || "GET",
      signal: options.signal,
      ...(options.body !== undefined
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(options.body),
          }
        : {}),
    })
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data.message === "string" && data.message
        ? data.message
        : "The request could not be completed."
    );
  }
  return data as T;
}

/** Downloads a submitted document through the coordinator's session. */
export async function downloadSubmittedDocument(id: number, filename: string): Promise<void> {
  const response = await withWorkingToast("Preparing the file…", () =>
    fetch(`${API_URL}/api/documents/${id}/file`, withCoordinatorAuth())
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "The document could not be downloaded.");
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = window.document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
