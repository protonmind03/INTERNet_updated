/*
| Iteration 20: the signature pad's size and stroke paths (components/SignaturePad.tsx).
| No imports, so the tests can load it.
*/

export const PAD_WIDTH = 600;
export const PAD_HEIGHT = 200;

export type SignatureOutput = { svg_paths: string; png: string; uploaded?: boolean };

type Point = { x: number; y: number };

/** A stroke as SVG path data: quadratic curves through the midpoints of its points. */
export function strokePath(points: Point[]): string {
  const r = (value: number) => Math.round(value * 10) / 10;
  if (points.length === 0) return "";
  if (points.length === 1) {
    const [p] = points;
    return `M${r(p.x)} ${r(p.y)} L${r(p.x + 0.1)} ${r(p.y + 0.1)}`;
  }
  let d = `M${r(points[0].x)} ${r(points[0].y)}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const next = points[index + 1];
    d += ` Q${r(point.x)} ${r(point.y)} ${r((point.x + next.x) / 2)} ${r((point.y + next.y) / 2)}`;
  }
  const last = points[points.length - 1];
  return `${d} L${r(last.x)} ${r(last.y)}`;
}
