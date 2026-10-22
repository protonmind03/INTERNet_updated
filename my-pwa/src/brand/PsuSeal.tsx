import { SEAL } from "./tokens";

/*
| PSU redesign (internet-revisions, Section 2): the seal is the shipped
| psu-seal.png (public/brand/psu, transparent, cut to its circle): the
| 128 px copy is kept for offline use, the 512 px one loads when drawn
| large. Served from the site's own address, so the landing page and the
| app draw the same file.
*/
const seal128 = "/brand/psu/psu-seal@128.png";
const seal512 = "/brand/psu/psu-seal.png";

/*
|--------------------------------------------------------------------------
| THE PANGASINAN STATE UNIVERSITY SEAL
|--------------------------------------------------------------------------
|
| Iteration 19. INTERNet is a system proposal for Pangasinan State
| University, Lingayen Campus, and shows the university's seal. The rules
| (also shown on /brand-preview, Seal panel) are kept here, so no page can
| break them:
|
|   - never recoloured, cropped, rotated, outlined, shadowed or overlaid:
|     the image is drawn as it is, with no filter, transform or shadow;
|   - clear space of a quarter of its diameter on every side (the margin
|     below);
|   - at least 24 CSS px on screen (smaller sizes are raised to 24) and
|     12 mm in print;
|   - on dark chrome it sits on a white disc 112% of its size (`onDark`).
|
| The file is the full-colour seal on white. The white outside the circle
| is background, not seal, so the image is clipped to its circle; that is
| what lets the white disc show the seal's own edge on dark chrome.
|
*/

type PsuSealProps = {
  /** Diameter in CSS px; at least SEAL.minPx. */
  size: number;
  /** On dark chrome: sit on a white disc 112% of the seal's size. */
  onDark?: boolean;
  /** Keep the quarter-diameter clear space around it (default). Off where the layout already gives it room. */
  clearSpace?: boolean;
  className?: string;
  /** Decorative uses (a watermark beside the same seal shown elsewhere) pass true. */
  decorative?: boolean;
};

/** The smallest file that stays sharp at this size on a 2x screen. */
function sourceFor(size: number): string {
  return size * 2 <= 128 ? seal128 : seal512;
}

export default function PsuSeal({ size, onDark = false, clearSpace = true, className = "", decorative = false }: PsuSealProps) {
  const diameter = Math.max(SEAL.minPx, Math.round(size));
  const disc = onDark ? Math.round(diameter * SEAL.discRatio) : diameter;
  const margin = clearSpace ? Math.round(diameter * SEAL.clearSpace) : 0;
  const image = (
    <img
      src={sourceFor(diameter)}
      srcSet={`${seal128} 128w, ${seal512} 512w`}
      sizes={`${diameter}px`}
      width={diameter}
      height={diameter}
      alt={decorative ? "" : "Pangasinan State University seal"}
      decoding="async"
      draggable={false}
      className="psu-seal"
      style={{ width: diameter, height: diameter }}
    />
  );
  return (
    <span
      className={`psu-seal-frame ${onDark ? "psu-seal-frame--disc" : ""} ${className}`}
      style={{ width: disc, height: disc, margin }}
      aria-hidden={decorative || undefined}
    >
      {image}
    </span>
  );
}
