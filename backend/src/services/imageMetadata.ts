/*
|--------------------------------------------------------------------------
| TAKING THE METADATA OUT OF AN UPLOADED IMAGE
|--------------------------------------------------------------------------
|
| A photo from a phone's camera carries more than the picture: the phone's
| make, the time it was taken and often the place, as GPS coordinates. The
| app re-encodes images on the device before upload, which drops all of it,
| but a request can come from somewhere that does not. So every image is
| also cleaned here, before it is stored.
|
| Only the containers' metadata blocks are taken out; the picture's own
| bytes are copied unchanged, so nothing is re-compressed and nothing can
| come out looking different.
|
|   JPEG  APP1 (Exif and XMP, where the GPS tags live) and APP13 (IPTC)
|         segments. APP0 (JFIF) and APP2 (the colour profile) stay.
|   PNG   eXIf, tEXt, zTXt and iTXt chunks.
|   WebP  EXIF and XMP chunks, with the header's flags for them cleared.
|
| Anything else, or a file this cannot read to the end, is returned as it
| came: the upload's own type checks still apply to it. PDFs and Office
| files are stored as sent.
|
*/

const JPEG_DROP = new Set([0xe1, 0xed]);
const PNG_DROP = new Set(["eXIf", "tEXt", "zTXt", "iTXt"]);
const WEBP_DROP = new Set(["EXIF", "XMP "]);

function stripJpeg(input: Buffer): Buffer | null {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return null;
  const parts: Buffer[] = [input.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= input.length) {
    if (input[offset] !== 0xff) return null;
    const marker = input[offset + 1];
    // Padding between segments.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    // Start of scan: from here on it is the picture itself, copied as it is.
    if (marker === 0xda) {
      parts.push(input.subarray(offset));
      return Buffer.concat(parts);
    }
    // Markers that carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      parts.push(input.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    const length = input.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > input.length) return null;
    if (!JPEG_DROP.has(marker)) parts.push(input.subarray(offset, end));
    offset = end;
  }
  return null;
}

function stripPng(input: Buffer): Buffer | null {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (input.length < 8 || !input.subarray(0, 8).equals(signature)) return null;
  const parts: Buffer[] = [signature];
  let offset = 8;
  while (offset + 12 <= input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.toString("latin1", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > input.length) return null;
    // Each chunk carries its own checksum, so dropping one leaves the others valid.
    if (!PNG_DROP.has(type)) parts.push(input.subarray(offset, end));
    offset = end;
    if (type === "IEND") return Buffer.concat(parts);
  }
  return null;
}

function stripWebp(input: Buffer): Buffer | null {
  if (input.length < 12 || input.toString("latin1", 0, 4) !== "RIFF" || input.toString("latin1", 8, 12) !== "WEBP") return null;
  const parts: Buffer[] = [];
  let offset = 12;
  let dropped = false;
  while (offset + 8 <= input.length) {
    const type = input.toString("latin1", offset, offset + 4);
    const length = input.readUInt32LE(offset + 4);
    // Chunks are padded to an even length.
    const end = offset + 8 + length + (length % 2);
    if (end > input.length + 1) return null;
    const chunk = Buffer.from(input.subarray(offset, Math.min(end, input.length)));
    if (WEBP_DROP.has(type)) dropped = true;
    else {
      // The extended header says which extra chunks follow: say there are none of these.
      if (type === "VP8X" && chunk.length > 8) chunk[8] &= ~(0x08 | 0x04);
      parts.push(chunk);
    }
    offset = end;
  }
  if (!dropped && parts.every((part) => part.toString("latin1", 0, 4) !== "VP8X")) return input;
  const body = Buffer.concat(parts);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(body.length + 4, 4);
  header.write("WEBP", 8, "latin1");
  return Buffer.concat([header, body]);
}

/**
 * The image with its metadata taken out, or the same bytes when it is not
 * a JPEG, PNG or WebP this can read to the end.
 */
export function stripImageMetadata(input: Buffer): Buffer {
  try {
    const cleaned =
      input[0] === 0xff ? stripJpeg(input) : input[0] === 0x89 ? stripPng(input) : input[0] === 0x52 ? stripWebp(input) : null;
    return cleaned ?? input;
  } catch {
    return input;
  }
}
