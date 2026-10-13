import { BlobServiceClient } from "@azure/storage-blob";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Express } from "express";

/*
|--------------------------------------------------------------------------
| WHERE UPLOADED FILES ARE KEPT
|--------------------------------------------------------------------------
|
| Time-in photos, task attachments, evidence and documents are private:
| they are only ever read back through a route that checks who is asking.
| They are kept in one of three places, chosen by the host's settings:
|
|   a bucket        an S3-compatible object store. Cloudflare R2 is the one
|                   this was written for: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
|                   R2_SECRET_ACCESS_KEY and R2_BUCKET, all four.
|   Azure Blob      AZURE_STORAGE_CONNECTION_STRING (and optionally
|                   AZURE_STORAGE_CONTAINER).
|   the server's    when neither is set. PRIVATE_UPLOAD_DIR lets a host
|   own disk        point it at a persistent volume.
|
| Only one of the first two may be set. A new file goes to the place that
| is set. A file is READ from there first and from the disk second, so
| switching a running system over to a bucket does not lose sight of the
| files uploaded before: they are still found on the disk until they are
| copied across (scripts/copy-uploads-to-bucket.ts).
|
*/

// PRIVATE_UPLOAD_DIR lets a host point local storage at a persistent volume.
const localDirectory = path.resolve(
  process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), "private-uploads")
);
const legacyDirectory = path.resolve(process.cwd(), "uploads");
const legacyDocumentsDirectory = path.resolve(
  __dirname,
  "..",
  "..",
  "private-uploads",
  "documents"
);
const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** A place outside this server that keeps files. `read` answers null when it has no such file. */
type RemoteStore = {
  kind: "bucket" | "azure";
  save: (fileName: string, data: Buffer, contentType: string) => Promise<void>;
  read: (fileName: string) => Promise<{ buffer: Buffer; contentType?: string } | null>;
  remove: (fileName: string) => Promise<void>;
};

type Env = NodeJS.ProcessEnv;

const BUCKET_SETTINGS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;

/**
 * The bucket's settings, null when none is set. Throws when only some are:
 * a half-set bucket would silently keep files on the disk instead.
 * R2_ENDPOINT replaces the address worked out from the account, for
 * another S3-compatible store or a test.
 */
export function bucketSettings(env: Env = process.env) {
  const present = BUCKET_SETTINGS.filter((name) => (env[name] || "").trim());
  if (present.length === 0) return null;
  if (present.length !== BUCKET_SETTINGS.length) {
    const missing = BUCKET_SETTINGS.filter((name) => !present.includes(name));
    throw new Error(
      `File storage in a bucket needs all four of ${BUCKET_SETTINGS.join(", ")}. Missing: ${missing.join(", ")}.`
    );
  }
  const account = env.R2_ACCOUNT_ID!.trim();
  return {
    endpoint: (env.R2_ENDPOINT || "").trim() || `https://${account}.r2.cloudflarestorage.com`,
    accessKeyId: env.R2_ACCESS_KEY_ID!.trim(),
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!.trim(),
    bucket: env.R2_BUCKET!.trim(),
  };
}

const notFound = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const { name, $metadata, statusCode } = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
    statusCode?: number;
  };
  return name === "NoSuchKey" || name === "NotFound" || $metadata?.httpStatusCode === 404 || statusCode === 404;
};

/** A bucket on an S3-compatible store. Exported so a test can point one at a stand-in. */
export function bucketStore(settings: NonNullable<ReturnType<typeof bucketSettings>>): RemoteStore {
  const client = new S3Client({
    // The SDK wants a region; R2 does not use one.
    region: "auto",
    endpoint: settings.endpoint,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
    // The bucket goes in the path, not the host name: one address serves every bucket.
    forcePathStyle: true,
    // Only the checksums the store itself asks for. Newer SDKs add their own
    // to every request by default, which not every S3-compatible store accepts.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return {
    kind: "bucket",
    async save(fileName, data, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: settings.bucket, Key: fileName, Body: data, ContentType: contentType })
      );
    },
    async read(fileName) {
      try {
        const found = await client.send(new GetObjectCommand({ Bucket: settings.bucket, Key: fileName }));
        if (!found.Body) return null;
        return {
          buffer: Buffer.from(await found.Body.transformToByteArray()),
          contentType: found.ContentType,
        };
      } catch (error) {
        if (notFound(error)) return null;
        throw error;
      }
    },
    async remove(fileName) {
      // Removing a file that is not there is not an error on an S3 store.
      await client.send(new DeleteObjectCommand({ Bucket: settings.bucket, Key: fileName }));
    },
  };
}

function azureStore(connectionString: string, containerName: string): RemoteStore {
  const service = BlobServiceClient.fromConnectionString(connectionString);
  const container = () => service.getContainerClient(containerName);
  return {
    kind: "azure",
    async save(fileName, data, contentType) {
      await container().createIfNotExists();
      await container()
        .getBlockBlobClient(fileName)
        .uploadData(data, { blobHTTPHeaders: { blobContentType: contentType } });
    },
    async read(fileName) {
      const blob = container().getBlobClient(fileName);
      try {
        const properties = await blob.getProperties();
        return { buffer: await blob.downloadToBuffer(), contentType: properties.contentType };
      } catch (error) {
        if (notFound(error)) return null;
        throw error;
      }
    },
    async remove(fileName) {
      await container().getBlockBlobClient(fileName).deleteIfExists();
    },
  };
}

function chooseStore(env: Env = process.env): RemoteStore | null {
  const bucket = bucketSettings(env);
  const azure = (env.AZURE_STORAGE_CONNECTION_STRING || "").trim();
  if (bucket && azure) {
    throw new Error(
      "Both a bucket (R2_*) and Azure Blob Storage are configured for uploaded files. Set only one."
    );
  }
  if (bucket) return bucketStore(bucket);
  if (azure) return azureStore(azure, env.AZURE_STORAGE_CONTAINER || "internet-private-files");
  return null;
}

let remote = chooseStore();

/** For tests: put a stand-in store in place (or null for the disk). Returns the one it replaced. */
export function useRemoteStore(next: RemoteStore | null): RemoteStore | null {
  const previous = remote;
  remote = next;
  return previous;
}

/** The store outside this server that files go to, or null when they are kept on the disk. */
export function currentRemoteStore(): RemoteStore | null {
  return remote;
}

if (!remote) {
  console.warn(
    "Private file storage is using local disk. Configure the four R2_* settings (or AZURE_STORAGE_CONNECTION_STRING) for durable storage."
  );
}

export function newStoredFileName(originalName: string): string {
  const extension = path.extname(originalName).toLowerCase();
  return `${Date.now()}-${randomUUID().replace(/-/g, "").slice(0, 12)}${extension}`;
}

export function isStoredFileName(fileName: string): boolean {
  return /^(?:\d+-[a-f0-9]{12}|\d+-\d+|[a-f0-9-]{36})\.[a-z0-9]{1,10}$/i.test(
    fileName
  );
}

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

export async function savePrivateFile(
  file: Express.Multer.File,
  fileName = newStoredFileName(file.originalname)
): Promise<string> {
  if (!isStoredFileName(fileName)) {
    throw new Error("Invalid private file name.");
  }

  if (remote) {
    await remote.save(fileName, file.buffer, file.mimetype);
  } else {
    await fs.mkdir(localDirectory, { recursive: true });
    await fs.writeFile(path.join(localDirectory, fileName), file.buffer, {
      flag: "wx",
    });
  }

  return fileName;
}

export async function deletePrivateFile(fileName: string): Promise<void> {
  if (!isStoredFileName(fileName)) {
    throw new Error("Invalid private file name.");
  }

  if (remote) await remote.remove(fileName);

  for (const directory of [
    localDirectory,
    legacyDirectory,
    legacyDocumentsDirectory,
  ]) {
    try {
      await fs.unlink(path.join(directory, fileName));
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
}

export async function readPrivateFile(fileName: string): Promise<{
  buffer: Buffer;
  contentType?: string;
}> {
  if (!isStoredFileName(fileName)) {
    throw new Error("Invalid private file name.");
  }

  if (remote) {
    const found = await remote.read(fileName);
    if (found) return found;
  }

  // Not there (or there is no remote store): a file from before the switch is still on the disk.
  for (const directory of [
    localDirectory,
    legacyDirectory,
    legacyDocumentsDirectory,
  ]) {
    try {
      return {
        buffer: await fs.readFile(path.join(directory, fileName)),
        contentType: contentTypes[path.extname(fileName).toLowerCase()],
      };
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }

  const missing = new Error("Private file not found.");
  Object.assign(missing, { statusCode: 404 });
  throw missing;
}

/** Where a new file goes: "bucket", "azure" or "disk". */
export function fileStoreKind(): "bucket" | "azure" | "disk" {
  return remote?.kind ?? "disk";
}

/** The folder files are kept in when they are kept on the disk. */
export function localUploadDirectory(): string {
  return localDirectory;
}

/** The old name, kept for the callers that only ask "is it durable". */
export function isAzureBlobStorageConfigured(): boolean {
  return remote !== null;
}

/**
 * Writes a small file, reads it back and removes it, wherever files are
 * kept now. Throws with the store's own reason when a step fails.
 */
export async function checkFileStore(): Promise<void> {
  const fileName = `${Date.now()}-${randomUUID().replace(/-/g, "").slice(0, 12)}.png`;
  const content = Buffer.from(`INTERNet storage check ${fileName}`);
  await savePrivateFile({ buffer: content, mimetype: "image/png", originalname: fileName } as Express.Multer.File, fileName);
  try {
    const back = await readPrivateFile(fileName);
    if (!back.buffer.equals(content)) throw new Error("The file read back was not the file written.");
  } finally {
    await deletePrivateFile(fileName);
  }
}
