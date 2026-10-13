import { API_URL, withRoleAuth } from "./api";

/*
|--------------------------------------------------------------------------
| PICTURES ATTACHED TO AN ENTRY
|--------------------------------------------------------------------------
|
| Up to three pictures on a time-out note, a weekly report or a concern.
| The server's rules are in backend/src/routes/attachments.ts; this is how
| the app talks to it.
|
| A picture is always made ready first with preparePicture(): drawn onto
| a canvas at no more than 1600 pixels on its long side and saved again as
| a JPEG. Saving it again is what removes everything the camera wrote
| into the file beside the image itself, the place it was taken among it.
| A file the browser cannot draw (an iPhone's HEIC in most browsers) is
| refused with a sentence saying so; it is never sent as it is.
|
| Pictures need a connection. They are not kept on the phone for later:
| nothing with a photo in it ever is.
|
*/

export type PictureRole = "student" | "supervisor" | "coordinator";
export type PictureOwner = "attendance" | "journal" | "complaint";

export type Picture = {
  id: number;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  caption: string | null;
  position: number;
};

/** The most pictures one entry takes. The server says the same. */
export const MAX_PICTURES = 3;
const LONG_SIDE = 1600;
const MAX_BYTES = 4 * 1024 * 1024;

/** A picture chosen and made ready, not yet sent. */
export type PictureDraft = {
  key: string;
  file: File;
  /** An object URL for showing it. Revoke it when the draft goes. */
  preview: string;
  width: number;
  height: number;
  caption: string;
};

/**
 * Makes a chosen file ready to send: smaller, a JPEG, and with nothing in
 * it but the image. Throws an Error with a plain sentence when it cannot.
 */
export async function preparePicture(file: File): Promise<PictureDraft> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const heic = /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
    throw new Error(
      heic
        ? "This browser cannot open an iPhone HEIC photo. In the iPhone's Camera settings choose Formats, then Most Compatible, or send a screenshot of the photo."
        : `"${file.name}" is not a picture this browser can open. Choose a JPG or PNG.`
    );
  }
  try {
    const scale = Math.min(1, LONG_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot prepare pictures.");
    // A see-through PNG would turn black as a JPEG.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    let blob: Blob | null = null;
    // Lower the quality a step at a time until it is under the limit.
    for (const quality of [0.82, 0.7, 0.55]) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= MAX_BYTES) break;
    }
    if (!blob || blob.size > MAX_BYTES) {
      throw new Error(`"${file.name}" is too large to attach, even made smaller.`);
    }
    const name = `${file.name.replace(/\.[^.]+$/, "") || "picture"}.jpg`;
    const ready = new File([blob], name, { type: "image/jpeg" });
    return {
      key: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
      file: ready,
      preview: URL.createObjectURL(ready),
      width: canvas.width,
      height: canvas.height,
      caption: "",
    };
  } finally {
    bitmap.close();
  }
}

export type PictureList = { attachments: Picture[]; can_add: boolean; max: number };

export async function listPictures(role: PictureRole, owner: PictureOwner, ownerId: number): Promise<PictureList> {
  const response = await fetch(
    `${API_URL}/api/attachments?owner_type=${owner}&owner_id=${ownerId}`,
    withRoleAuth(role)
  );
  // A server from before pictures answers "not found": the entry simply has none.
  if (response.status === 404) return { attachments: [], can_add: false, max: MAX_PICTURES };
  const data = (await response.json().catch(() => ({}))) as Partial<PictureList> & { message?: string };
  if (!response.ok) throw new Error(data.message || "Could not load the pictures.");
  return { attachments: data.attachments ?? [], can_add: Boolean(data.can_add), max: data.max ?? MAX_PICTURES };
}

/** An object URL for one picture, fetched with the signed-in person's access. Revoke it after use. */
export async function pictureUrl(role: PictureRole, id: number): Promise<string> {
  const response = await fetch(`${API_URL}/api/attachments/${id}/file`, withRoleAuth(role));
  if (!response.ok) throw new Error("The picture could not be loaded.");
  return URL.createObjectURL(await response.blob());
}

/**
 * Sends one prepared picture. `onProgress` is told how much has gone, from
 * 0 to 100. XMLHttpRequest is used because fetch cannot report that.
 */
export function uploadPicture(
  role: "student" | "supervisor",
  owner: PictureOwner,
  ownerId: number,
  draft: PictureDraft,
  onProgress?: (percent: number) => void
): Promise<Picture> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("owner_type", owner);
    form.append("owner_id", String(ownerId));
    form.append("width", String(draft.width));
    form.append("height", String(draft.height));
    if (draft.caption.trim()) form.append("caption", draft.caption.trim());
    form.append("file", draft.file);

    const request = new XMLHttpRequest();
    request.open("POST", `${API_URL}/api/attachments`);
    const headers = new Headers(withRoleAuth(role).headers);
    headers.forEach((value, name) => request.setRequestHeader(name, value));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new TypeError("No connection. The picture was not sent."));
    request.onload = () => {
      let data: { message?: string; attachment?: Picture } = {};
      try {
        data = JSON.parse(request.responseText);
      } catch {
        /* Answered with something that is not JSON: treated as a failure below. */
      }
      if (request.status === 201 && data.attachment) {
        onProgress?.(100);
        resolve(data.attachment);
      } else {
        reject(new Error(data.message || "The picture could not be attached."));
      }
    };
    request.send(form);
  });
}

/**
 * Sends each draft in order. Returns how many went and the first reason one
 * did not, so the page can say "2 of 3 pictures were attached".
 */
export async function uploadPictures(
  role: "student" | "supervisor",
  owner: PictureOwner,
  ownerId: number,
  drafts: PictureDraft[],
  onProgress?: (key: string, percent: number) => void
): Promise<{ sent: number; failure: string }> {
  let sent = 0;
  for (const draft of drafts) {
    try {
      await uploadPicture(role, owner, ownerId, draft, (percent) => onProgress?.(draft.key, percent));
      sent += 1;
    } catch (error) {
      return { sent, failure: error instanceof Error ? error.message : "A picture could not be attached." };
    }
  }
  return { sent, failure: "" };
}

export async function removePicture(role: "student" | "supervisor", id: number): Promise<void> {
  const response = await fetch(`${API_URL}/api/attachments/${id}`, withRoleAuth(role, { method: "DELETE" }));
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message || "The picture could not be removed.");
  }
}

/**
 * True when the browser says the connection is a metered or slow one, so a
 * picture should be asked for rather than loaded by itself. Most browsers
 * do not say; then pictures load as usual.
 */
export function onCostlyConnection(): boolean {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; type?: string; effectiveType?: string };
  }).connection;
  if (!connection) return false;
  return Boolean(connection.saveData) || connection.type === "cellular" || /^(slow-)?2g$/.test(connection.effectiveType ?? "");
}
