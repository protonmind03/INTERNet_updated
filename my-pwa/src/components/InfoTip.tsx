import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/*
|--------------------------------------------------------------------------
| THE "i" TOOLTIP
|--------------------------------------------------------------------------
|
| PSU redesign (hard rule): a tooltip appears only behind an "i" button,
| never on any other element. It opens after a 0.6 s hover or on keyboard
| focus, and closes when the pointer leaves, on blur, on Escape and on
| scroll. A tap toggles it, since a phone cannot hover. It holds one or two
| sentences; anything the user must know is in visible text instead.
|
| The button is 44 px to touch and draws an 18 px circled "i".
|
*/

const HOVER_DELAY_MS = 600;

export default function InfoTip({
  text,
  label = "More about this",
  className = "",
}: {
  /** One or two sentences. */
  text: string;
  /** What the button is named for screen readers, e.g. "About OJT hours". */
  label?: string;
  className?: string;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [place, setPlace] = useState<{ left: number; top: number; below: boolean } | null>(null);

  const show = useCallback(() => {
    const box = button.current?.getBoundingClientRect();
    if (!box) return;
    const below = box.top < 96;
    const width = Math.min(256, window.innerWidth - 24);
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, box.left + box.width / 2 - width / 2));
    setPlace({ left, top: below ? box.bottom + 6 : box.top - 6, below });
  }, []);
  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setPlace(null);
  }, []);

  useEffect(() => {
    if (!place) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, { capture: true, passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, { capture: true });
    };
  }, [place, hide]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-describedby={place ? id : undefined}
        aria-expanded={Boolean(place)}
        className={`inb-info ${className}`}
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse") return;
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(show, HOVER_DELAY_MS);
        }}
        onPointerLeave={hide}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) show();
        }}
        onBlur={hide}
        onClick={() => (place ? hide() : show())}
      >
        <span aria-hidden="true">i</span>
      </button>
      {place &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            className="inb-tip"
            style={{
              left: place.left,
              top: place.top,
              width: Math.min(256, window.innerWidth - 24),
              transform: place.below ? undefined : "translateY(-100%)",
            }}
          >
            {text}
          </span>,
          document.body
        )}
    </>
  );
}
