import { BlobServiceClient } from "@azure/storage-blob";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Express } from "express";

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
const containerName =
  process.env.AZURE_STORAGE_CONTAINER || "internet-private-files";
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const blobService = connectionString
  ? BlobServiceClient.fromConnectionString(connectionString)
  : null;
const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

if (!blobService) {
  console.warn(
    "Private file storage is using local disk. Configure AZURE_STORAGE_CONNECTION_STRING for durable Azure Blob Storage."
  );
}

export function newStoredFileName(originalName: string): string {
  const extension = path.extname(originalName).toLowerCase();
  return `${Date.now()}-${randomUUID().replace(/-/g, "").slice(0, 12)}${extension}`;
}

function isStoredFileName(fileName: string): boolean {
  return /^(?:\d+-[a-f0-9]{12}|\d+-\d+|[a-f0-9-]{36})\.[a-z0-9]{1,10}$/i.test(
    fileName
  );
}

export async function savePrivateFile(
  file: Express.Multer.File,
  fileName = newStoredFileName(file.originalname)
): Promise<string> {
  if (!isStoredFileName(fileName)) {
    throw new Error("Invalid private file name.");
  }

  if (blobService) {
    const container = blobService.getContainerClient(containerName);
    await container.createIfNotExists();
    const blob = container.getBlockBlobClient(fileName);
    await blob.uploadData(file.buffer, {
      blobHTTPHeaders: { blobContentType: file.mimetype },
    });
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

  if (blobService) {
    await blobService
      .getContainerClient(containerName)
      .getBlockBlobClient(fileName)
      .deleteIfExists();
  }

  for (const directory of [
    localDirectory,
    legacyDirectory,
    legacyDocumentsDirectory,
  ]) {
    try {
      await fs.unlink(path.join(directory, fileName));
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error;
      }
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

  if (blobService) {
    const blob = blobService.getContainerClient(containerName).getBlobClient(fileName);
    try {
      const properties = await blob.getProperties();
      return {
        buffer: await blob.downloadToBuffer(),
        contentType: properties.contentType,
      };
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("statusCode" in error) ||
        error.statusCode !== 404
      ) {
        throw error;
      }
    }
  }

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
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error;
      }
    }
  }

  const notFound = new Error("Private file not found.");
  Object.assign(notFound, { statusCode: 404 });
  throw notFound;
}

export function isAzureBlobStorageConfigured(): boolean {
  return blobService !== null;
}
