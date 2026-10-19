import { useCallback, useEffect, useRef, useState } from "react";
import { BRAND } from "../brand";
import { Button } from "./ui";
import { withoutCameraDetails } from "../lib/image";
import { useMediaQuery } from "../lib/useMediaQuery";

/*
|--------------------------------------------------------------------------
| SIGNATURE PAD
|--------------------------------------------------------------------------
|
| Iteration 20. The trainee signs once with a finger, a stylus or a mouse;
| the signature is printed above "Signature over printed name of the
| trainee" on their Time Record. It is an image of their handwriting, not a
| cryptographic signature.
|
| Pointer events give one path per stroke, smoothed with quadratic curves
| through the midpoints. The output is the stroke paths as SVG path data
| (for crisp print) and a 600 x 200 transparent PNG (the fallback). An empty
| pad is refused. Keyboard users, and anyone who would rather, may upload an
| image of their signature instead: it is redrawn on the device (which drops
| what the camera wrote into the file) and fitted into the same 600 x 200.
|
*/

import { PAD_HEIGHT, PAD_WIDTH, strokePath, type SignatureOutput } from "../lib/signature";

type Point = { x: number; y: number };

/** Draws stroke paths onto a canvas of the pad's size, in ink. */
function drawPaths(canvas: HTMLCanvasElement, paths: string[], ink: string) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.scale(canvas.width / PAD_WIDTH, canvas.height / PAD_HEIGHT);
  context.strokeStyle = ink;
  context.lineWidth = 3.2;
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const path of paths) context.stroke(new Path2D(path));
  context.restore();
}

export default function SignaturePad({
  onSave,
  saving = false,
  onCancel,
}: {
  onSave: (output: SignatureOutput) => Promise<void> | void;
  saving?: boolean;
  onCancel?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const current = useRef<Point[] | null>(null);
  const [error, setError] = useState("");
  const portrait = useMediaQuery("(orientation: portrait) and (max-width: 640px)");
  // The ink: the role's ink colour where the page has one.
  const ink = useRef<string>(BRAND.ink);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const found = getComputedStyle(canvas).getPropertyValue("--role-ink").trim();
    if (found) ink.current = found;
  }, []);

  const redraw = useCallback(
    (extra?: Point[]) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      drawPaths(canvas, extra && extra.length > 0 ? [...paths, strokePath(extra)] : paths, ink.current);
    },
    [paths]
  );

  useEffect(() => {
    redraw();
  }, [redraw]);

  const pointAt = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * PAD_WIDTH,
      y: ((event.clientY - box.top) / box.height) * PAD_HEIGHT,
    };
  };

  const down = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    current.current = [pointAt(event)];
    setError("");
    redraw(current.current);
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!current.current) return;
    // Every coalesced point, so a quick stroke stays smooth.
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    const box = event.currentTarget.getBoundingClientRect();
    for (const each of events) {
      current.current.push({
        x: ((each.clientX - box.left) / box.width) * PAD_WIDTH,
        y: ((each.clientY - box.top) / box.height) * PAD_HEIGHT,
      });
    }
    redraw(current.current);
  };
  const up = () => {
    const stroke = current.current;
    current.current = null;
    if (stroke && stroke.length > 0) setPaths((list) => [...list, strokePath(stroke)]);
  };

  const save = async () => {
    if (paths.length === 0) {
      setError("The pad is empty. Sign on it first, or upload an image of your signature.");
      return;
    }
    const output = document.createElement("canvas");
    output.width = PAD_WIDTH;
    output.height = PAD_HEIGHT;
    drawPaths(output, paths, ink.current);
    await onSave({ svg_paths: paths.join(" "), png: output.toDataURL("image/png") });
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      setError("Choose a PNG or JPEG image of your signature.");
      return;
    }
    try {
      const clean = await withoutCameraDetails(file, 1200);
      const bitmap = await createImageBitmap(clean);
      const output = document.createElement("canvas");
      output.width = PAD_WIDTH;
      output.height = PAD_HEIGHT;
      const context = output.getContext("2d");
      if (!context) throw new Error("no canvas");
      const scale = Math.min(PAD_WIDTH / bitmap.width, PAD_HEIGHT / bitmap.height);
      const width = bitmap.width * scale;
      const height = bitmap.height * scale;
      context.drawImage(bitmap, (PAD_WIDTH - width) / 2, (PAD_HEIGHT - height) / 2, width, height);
      bitmap.close();
      await onSave({ svg_paths: "", png: output.toDataURL("image/png"), uploaded: true });
    } catch {
      setError("That image could not be read. Try another one.");
    }
  };

  return (
    <div className="space-y-3">
      {portrait && (
        <p className="text-sm text-slate-600" role="note">
          Turn your phone sideways for more room.
        </p>
      )}
      <canvas
        ref={canvasRef}
        width={PAD_WIDTH}
        height={PAD_HEIGHT}
        role="img"
        aria-label={paths.length === 0 ? "Signature pad, empty. Draw with a finger, stylus or mouse." : `Signature pad, ${paths.length} strokes drawn.`}
        className="signature-pad block aspect-[3/1] w-full touch-none rounded-xl border-2 border-dashed border-slate-300 bg-white"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
      <p className="sr-only" aria-live="polite">
        {paths.length === 0 ? "" : `${paths.length} strokes`}
      </p>
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon="refresh" disabled={paths.length === 0 || saving} onClick={() => setPaths((list) => list.slice(0, -1))}>
          Undo
        </Button>
        <Button variant="secondary" icon="trash" disabled={paths.length === 0 || saving} onClick={() => setPaths([])}>
          Clear
        </Button>
        <Button icon="check" busy={saving} onClick={() => void save()}>
          Save signature
        </Button>
        {onCancel && (
          <Button variant="secondary" disabled={saving} onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg text-sm font-semibold text-psu-700 underline-offset-2 focus-within:outline-2 focus-within:outline-psu-600 hover:underline">
        <input
          type="file"
          accept="image/png,image/jpeg"
          className="sr-only"
          disabled={saving}
          onChange={(event) => {
            void upload(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        Upload an image of your signature instead
      </label>
    </div>
  );
}
