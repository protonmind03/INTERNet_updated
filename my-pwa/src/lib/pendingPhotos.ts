import { useCallback, useEffect, useState } from "react";
import { API_URL, withRoleAuth } from "./api";
import { pictureForm } from "./attachments";
import { readRecord, saveRecord } from "./offlineStore";
import { toast } from "./toast";

/*
|--------------------------------------------------------------------------
| REPORT PHOTOS WAITING ON THE PHONE (revisions, November 2026)
|--------------------------------------------------------------------------
|
| A photo taken for a day's report with no connection, or one whose upload
| failed, is not lost: it is kept on this phone, in INTERNet's own storage
| (IndexedDB, under the signed-in account), and sent when the phone is back
| online, from whatever page is open.
|
| If it still does not go through after reconnecting (the server refused
| it, or the account's room is full), the trainee is told at once, and the
| photo stays on the phone. "Save to phone" puts a copy in the phone's own
| files or gallery (the share sheet where the phone has one, a download
| otherwise). A web app cannot write to the gallery by itself; the phone
| asks for that tap.
|
| Signing out erases what waits here (as with steps recorded offline), so
| the sign-out question counts these too.
|
*/

export type PendingPhoto = {
  id: string;
  owner: "report_entry";
  ownerId: number;
  /** The report's day, for showing where it belongs. */
  day: string;
  file: Blob;
  thumb?: Blob;
  width: number;
  height: number;
  caption: string;
  ref: string;
  capturedInApp: boolean;
  takenAt: string;
  savedAt: string;
  /** Set once a try after reconnecting failed for a reason other than the connection. */
  failure?: string;
};

const NAME = "pending-photos";
export const PENDING_CHANGED = "internet-pending-photos";

async function all(): Promise<PendingPhoto[]> {
  return (await readRecord<PendingPhoto[]>("student", NAME)) ?? [];
}

async function write(list: PendingPhoto[]): Promise<void> {
  await saveRecord("student", NAME, list);
  window.dispatchEvent(new Event(PENDING_CHANGED));
}

export async function keepOnPhone(photo: Omit<PendingPhoto, "id" | "savedAt">): Promise<void> {
  const list = await all();
  if (list.some((item) => item.ref === photo.ref)) return;
  await write([...list, { ...photo, id: photo.ref, savedAt: new Date().toISOString() }]);
}

export async function pendingPhotos(): Promise<PendingPhoto[]> {
  return all();
}

async function sendOne(photo: PendingPhoto): Promise<"sent" | "offline" | string> {
  try {
    const response = await fetch(
      `${API_URL}/api/attachments`,
      withRoleAuth("student", { method: "POST", body: pictureForm(photo.owner, photo.ownerId, photo) })
    );
    if (response.ok) return "sent";
    const data = (await response.json().catch(() => ({}))) as { message?: string };
    return data.message || "The photo could not be attached.";
  } catch {
    return "offline";
  }
}

let sending: Promise<{ sent: number; failed: number }> | null = null;

/** Sends what waits, in order; stops at the first sign of no connection. */
export function sendPendingPhotos(): Promise<{ sent: number; failed: number }> {
  sending ??= (async () => {
    const list = await all();
    let sent = 0;
    let failed = 0;
    const kept: PendingPhoto[] = [];
    let offline = false;
    for (const photo of list) {
      if (offline) {
        kept.push(photo);
        continue;
      }
      const outcome = await sendOne(photo);
      if (outcome === "sent") sent += 1;
      else if (outcome === "offline") {
        offline = true;
        kept.push(photo);
      } else {
        failed += 1;
        kept.push({ ...photo, failure: outcome });
      }
    }
    if (sent > 0 || failed > 0) await write(kept);
    return { sent, failed };
  })().finally(() => {
    sending = null;
  });
  return sending;
}

export async function forgetPendingPhoto(id: string): Promise<void> {
  await write((await all()).filter((item) => item.id !== id));
}

/** Puts copies in the phone's own files or gallery: the share sheet when the phone has one, downloads otherwise. */
export async function saveToPhone(photos: PendingPhoto[]): Promise<void> {
  const files = photos.map(
    (photo, index) =>
      new File([photo.file], `INTERNet-report-${photo.day}-${index + 1}.jpg`, { type: photo.file.type || "image/jpeg" })
  );
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (nav.canShare?.({ files }) && navigator.share) {
    try {
      await navigator.share({ files, title: "INTERNet report photos" });
      return;
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") return;
    }
  }
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

/**
 * Sends waiting photos whenever the phone comes back online (mounted once,
 * by the trainee's layout), and says so when some could not go.
 */
export function usePendingPhotoSender(): void {
  useEffect(() => {
    const flush = async () => {
      if (!navigator.onLine) return;
      const { sent, failed } = await sendPendingPhotos();
      if (sent > 0) toast.success(sent === 1 ? "A report photo kept on this phone was sent." : `${sent} report photos kept on this phone were sent.`);
      if (failed > 0) {
        const waiting = (await all()).filter((photo) => photo.failure);
        toast.sticky(
          `${failed === 1 ? "A report photo" : `${failed} report photos`} couldn't be sent after reconnecting. ${failed === 1 ? "It is" : "They are"} still saved on this phone.`,
          { label: "Save to phone", onClick: () => void saveToPhone(waiting) }
        );
      }
    };
    void flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);
}

/** What waits, for a page that shows it, kept up to date. */
export function usePendingPhotos(): { photos: PendingPhoto[]; refresh: () => void } {
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const refresh = useCallback(() => {
    void all().then(setPhotos);
  }, []);
  useEffect(() => {
    void Promise.resolve().then(refresh);
    window.addEventListener(PENDING_CHANGED, refresh);
    return () => window.removeEventListener(PENDING_CHANGED, refresh);
  }, [refresh]);
  return { photos, refresh };
}
