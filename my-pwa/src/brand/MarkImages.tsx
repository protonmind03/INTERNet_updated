import { useState } from "react";
import PsuSeal from "./PsuSeal";
import { getCollegeMark, getMajorMark, getMark, getProgramMark, markSrc, type PsuMark } from "./psuMarks";

/*
|--------------------------------------------------------------------------
| COLLEGE AND PROGRAM MARKS
|--------------------------------------------------------------------------
|
| internet-revisions, Section 2. A college's seal, or a program's (or a
| BSEd major's) student organisation logo, from the shipped set
| (brand/psuMarks.ts). Where there is no image, or it fails to load, a
| neutral monogram disc stands in: the short code on the role's tint, never
| a made-up logo. Marks are drawn as they are: no filter, outline or
| recolouring.
|
*/

type MarkProps = {
  /** Diameter in CSS px. */
  size: number;
  /** What the image is, for screen readers; "" when the same name is written beside it. */
  alt: string;
  className?: string;
};

/** The neutral stand-in: the short code on the role's tint. */
export function Monogram({ code, size, alt, className = "" }: { code: string } & MarkProps) {
  const letters = code.replace(/[^A-Za-z0-9]/g, "").slice(0, 5).toUpperCase() || "PSU";
  return (
    <span
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      className={`inline-grid shrink-0 place-items-center rounded-full bg-psu-100 font-bold text-psu-800 ring-1 ring-inset ring-psu-600/20 ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size / (letters.length > 3 ? 4.2 : 3.2))) }}
    >
      {letters}
    </span>
  );
}

/** A mark from the registry, or the monogram when there is none or its image fails. */
export function MarkImage({ mark, fallbackCode, size, alt, className = "" }: { mark: PsuMark | null; fallbackCode: string } & MarkProps) {
  const [failed, setFailed] = useState(false);
  if (!mark || failed) return <Monogram code={fallbackCode} size={size} alt={alt} className={className} />;
  if (mark.key === "psu-seal") return <PsuSeal size={size} clearSpace={false} decorative={!alt} className={className} />;
  const round = mark.shape === "round";
  return (
    <img
      src={markSrc(mark.key, size)}
      width={size}
      height={size}
      alt={alt}
      decoding="async"
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      className={`shrink-0 object-contain ${round ? "rounded-full" : "rounded-md bg-white"} ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** A college's seal: by its stored mark key, else by its short name. */
export function CollegeMark({ shortName, markKey, ...props }: { shortName: string | null | undefined; markKey?: string | null } & MarkProps) {
  const mark = getMark(markKey) ?? getCollegeMark(shortName);
  return <MarkImage mark={mark} fallbackCode={shortName || "PSU"} {...props} />;
}

/**
 * A program's organisation mark, or a BSEd major's: by the stored mark key,
 * else by short code (and major). With no organisation mark, the program's
 * monogram.
 */
export function ProgramMark({
  shortCode,
  major,
  markKey,
  ...props
}: { shortCode: string | null | undefined; major?: string | null; markKey?: string | null } & MarkProps) {
  const mark = getMark(markKey) ?? getMajorMark(shortCode, major) ?? getProgramMark(shortCode);
  return <MarkImage mark={mark} fallbackCode={shortCode || "PSU"} {...props} />;
}
