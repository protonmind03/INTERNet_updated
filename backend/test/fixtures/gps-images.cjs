// Images that carry the camera details a phone writes into a photo, GPS position included,
// built byte by byte so the tests do not depend on any image library or photo file.
//
//   jpegWithGps()  SOI, APP0 (JFIF), APP1 (Exif with a GPS block), APP1 (XMP), APP13 (IPTC), the picture
//   pngWithGps()   IHDR, eXIf (the same Exif block), tEXt, iTXt, IDAT, IEND
//   webpWithGps()  RIFF/WEBP with VP8X (flags saying EXIF and XMP follow), VP8L, EXIF, XMP
// Each also returns `secrets`: strings that must not survive in a cleaned file.
const zlib = require("node:zlib");

/** An Exif (TIFF) block whose GPS block says 16° 1' 23" N, 120° 13' 51" E. */
function exifWithGps() {
  const tiff = Buffer.alloc(110);
  tiff.write("MM", 0, "latin1");
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4); // IFD0 at 8
  tiff.writeUInt16BE(1, 8); // one entry
  tiff.writeUInt16BE(0x8825, 10); // GPSInfo
  tiff.writeUInt16BE(4, 12); // LONG
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt32BE(26, 18); // the GPS block at 26
  tiff.writeUInt32BE(0, 22); // no next IFD
  tiff.writeUInt16BE(4, 26); // four GPS entries
  const entry = (at, tag, type, count, value) => {
    tiff.writeUInt16BE(tag, at);
    tiff.writeUInt16BE(type, at + 2);
    tiff.writeUInt32BE(count, at + 4);
    if (typeof value === "string") tiff.write(value, at + 8, "latin1");
    else tiff.writeUInt32BE(value, at + 8);
  };
  entry(28, 0x0001, 2, 2, "N\0"); // GPSLatitudeRef
  entry(40, 0x0002, 5, 3, 78); // GPSLatitude, three rationals at 78
  entry(52, 0x0003, 2, 2, "E\0"); // GPSLongitudeRef
  entry(64, 0x0004, 5, 3, 78); // GPSLongitude (same values, enough for a test)
  tiff.writeUInt32BE(0, 76);
  [[16, 1], [1, 1], [23, 1]].forEach(([n, d], i) => {
    tiff.writeUInt32BE(n, 78 + i * 8);
    tiff.writeUInt32BE(d, 82 + i * 8);
  });
  return Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
}

const segment = (marker, body) => {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([head, body]);
};

function jpegWithGps() {
  const jfif = segment(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1"));
  const exif = segment(0xe1, exifWithGps());
  const xmp = segment(0xe1, Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><exif:GPSLatitude>16,1.38N</exif:GPSLatitude><exif:GPSLongitude>120,13.85E</exif:GPSLongitude></x:xmpmeta>', "latin1"));
  const iptc = segment(0xed, Buffer.from("Photoshop 3.0\08BIM\x04\x04\0\0\0\0\0\x0cLingayen PSU", "latin1"));
  const table = segment(0xdb, Buffer.alloc(65, 1));
  const picture = Buffer.concat([Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]), Buffer.from("PICTURE-DATA-UNCHANGED"), Buffer.from([0xff, 0xd9])]);
  const kept = Buffer.concat([Buffer.from([0xff, 0xd8]), jfif, table, picture]);
  return {
    file: Buffer.concat([Buffer.from([0xff, 0xd8]), jfif, exif, xmp, iptc, table, picture]),
    kept,
    secrets: ["Exif", "GPSLatitude", "xmpmeta", "8BIM", "Lingayen"],
  };
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const pngChunk = (type, body) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "latin1");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, tail]);
};

function pngWithGps() {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const header = pngChunk("IHDR", ihdr);
  const data = pngChunk("IDAT", zlib.deflateSync(Buffer.from([0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 255, 255, 0])));
  const end = pngChunk("IEND", Buffer.alloc(0));
  return {
    file: Buffer.concat([signature, header, pngChunk("eXIf", exifWithGps().subarray(6)), pngChunk("tEXt", Buffer.from("Location\0Lingayen PSU", "latin1")), pngChunk("iTXt", Buffer.from("XML:com.adobe.xmp\0\0\0\0\0<exif:GPSLatitude>16,1.38N</exif:GPSLatitude>", "latin1")), data, end]),
    kept: Buffer.concat([signature, header, data, end]),
    secrets: ["eXIf", "Lingayen", "GPSLatitude", "tEXt", "iTXt"],
  };
}

function webpWithGps() {
  const riffChunk = (type, body) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, "latin1");
    head.writeUInt32LE(body.length, 4);
    return Buffer.concat([head, body, body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  };
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x08 | 0x04; // EXIF and XMP follow
  const picture = riffChunk("VP8L", Buffer.from("/PICTURE-DATA-UNCHANGED", "latin1"));
  const body = Buffer.concat([riffChunk("VP8X", vp8x), picture, riffChunk("EXIF", exifWithGps().subarray(6)), riffChunk("XMP ", Buffer.from("<exif:GPSLatitude>16,1.38N</exif:GPSLatitude>", "latin1"))]);
  const head = Buffer.alloc(12);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(body.length + 4, 4);
  head.write("WEBP", 8, "latin1");
  return { file: Buffer.concat([head, body]), secrets: ["EXIF", "XMP ", "GPSLatitude"] };
}

module.exports = { jpegWithGps, pngWithGps, webpWithGps, exifWithGps };
