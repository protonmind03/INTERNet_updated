import { useCallback, useRef, useState, type ReactNode } from "react";
import { PsuSeal } from "../brand";
import { enablePush } from "../lib/pushDevice";
import { onboardingKey, shouldShowOnboarding, type OnboardingRole } from "../lib/onboarding";
import { useScrollPane } from "../lib/useScrollPane";
import { Button, Modal } from "./ui";

/*
|--------------------------------------------------------------------------
| THE FIRST OPEN OF AN INSTALLED APP (Iteration 23)
|--------------------------------------------------------------------------
|
| Four slides per role, the first time the role's app is opened from the
| Home Screen (standalone), once per role on each device (localStorage,
| internet.onboarding.{role}.v1). Skip ends it at any slide. The slides are
| a sideways row (.inb-snap-row): swiped on a phone, or Next and Back.
|
| Nothing here asks for a permission by itself: the notification slide
| asks only when its button is tapped.
|
*/

type Slide = { title: string; text: string; fragment: ReactNode; primer?: "push" };

function Chip({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "quiet" }) {
  return (
    <span
      className={`inline-flex min-h-8 items-center rounded-full px-3 text-[13px] font-semibold ${
        tone === "primary" ? "bg-(--role-primary) text-(--role-on-primary)" : "bg-(--role-surface) text-(--role-ink) ring-1 ring-inset ring-(--land-line)"
      }`}
    >
      {children}
    </span>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <ul className="m-0 list-none divide-y divide-(--land-line) overflow-hidden rounded-xl bg-white p-0 text-sm ring-1 ring-(--land-line)">
      {rows.map(([left, right], index) => (
        <li key={index} className="flex items-center justify-between gap-3 px-3 py-2.5">
          <span className="font-semibold text-(--role-ink)">{left}</span>
          <span className="text-(--land-muted)">{right}</span>
        </li>
      ))}
    </ul>
  );
}

const SLIDES: Record<OnboardingRole, Slide[]> = {
  student: [
    {
      title: "Your day in four taps",
      text: "Time in, Lunch break, End break and Time out: the big button always shows the next one.",
      fragment: (
        <div className="flex flex-wrap gap-2">
          <Chip>Time in</Chip>
          <Chip tone="quiet">Lunch break</Chip>
          <Chip tone="quiet">End break</Chip>
          <Chip tone="quiet">Time out</Chip>
        </div>
      ),
    },
    {
      title: "The camera check and your privacy",
      text: "A few on-screen movements confirm it is you, and only your supervisor and coordinator see the photo.",
      fragment: (
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="quiet">Turn your head left</Chip>
          <Chip>Camera check passed</Chip>
        </div>
      ),
    },
    {
      title: "No signal? It still counts",
      text: "With no connection, your steps wait on the phone and are sent when the signal returns.",
      fragment: <Rows rows={[["Time in · 7:58 AM", "Waiting to send"], ["Lunch break · 12:01 PM", "Waiting to send"]]} />,
    },
    {
      title: "Turn on reminders",
      text: "Get a notification when your supervisor verifies a day or a task needs you.",
      fragment: <Rows rows={[["Day verified", "Tuesday"], ["New task", "Due Friday"]]} />,
      primer: "push",
    },
  ],
  supervisor: [
    {
      title: "Your review queue",
      text: "Time-ins, tasks, documents and absences wait in one queue until you verify them.",
      fragment: <Rows rows={[["Trainee 1", "Time in · Photo"], ["Trainee 2", "Task"], ["Trainee 3", "Absence"]]} />,
    },
    {
      title: "Verify, or reject photo or day",
      text: "Verify a good day; reject only the photo to ask for a retake, or reject the whole day.",
      fragment: (
        <div className="flex flex-wrap gap-2">
          <Chip>Verify</Chip>
          <Chip tone="quiet">Reject photo</Chip>
          <Chip tone="quiet">Reject day</Chip>
        </div>
      ),
    },
    {
      title: "Record a time-in in person",
      text: "When a trainee's phone cannot, record their time-in yourself; it is marked as made in person.",
      fragment: <Rows rows={[["Trainee 1 · 8:02 AM", "Recorded in person"]]} />,
    },
    {
      title: "Notifications",
      text: "Get a notification when a day or a task is waiting for your review.",
      fragment: <Rows rows={[["2 days waiting", "Today"], ["Task submitted", "Yesterday"]]} />,
      primer: "push",
    },
  ],
  coordinator: [
    {
      title: "The Action list",
      text: "The dashboard's Action list puts what needs you today first, with a link to each item.",
      fragment: <Rows rows={[["Flagged logs", "2"], ["Appeals", "1"], ["Requirements to check", "4"]]} />,
    },
    {
      title: "Filters and saved views",
      text: "Filter any list by program, company or status, and save the view to open it again.",
      fragment: (
        <div className="flex flex-wrap gap-2">
          <Chip>Program: BSIT</Chip>
          <Chip tone="quiet">Status: Active</Chip>
          <Chip tone="quiet">Save view</Chip>
        </div>
      ),
    },
    {
      title: "Flagged logs and appeals",
      text: "Logs the system flags and trainees' appeals come to you to settle, with the photo and history.",
      fragment: <Rows rows={[["Time in flagged", "Camera check"], ["Appeal", "Rejected photo"]]} />,
    },
    {
      title: "What is switched on",
      text: "System status shows which features are on, such as push, email and the camera check.",
      fragment: <Rows rows={[["Push notifications", "On"], ["Email", "On"], ["Camera check", "On"]]} />,
    },
  ],
};

const APP_NAME: Record<OnboardingRole, string> = {
  student: "INTERNet Trainee",
  supervisor: "INTERNet Supervisor",
  coordinator: "INTERNet Coordinator",
};

function PushPrimer({ role }: { role: OnboardingRole }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | string>("idle");
  const ask = async () => {
    setState("busy");
    try {
      await enablePush(role);
      setState("done");
    } catch (error) {
      setState(error instanceof Error ? error.message : "Notifications could not be turned on.");
    }
  };
  if (state === "done") return <p className="m-0 text-sm font-semibold text-(--status-success-ink)" role="status">Notifications are on for this device.</p>;
  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" onClick={() => void ask()} disabled={state === "busy"}>
        {role === "student" ? "Turn on reminders" : "Turn on notifications"}
      </Button>
      {state !== "idle" && state !== "busy" && (
        <p className="m-0 text-sm text-(--status-warning-ink)" role="status">
          {state}
        </p>
      )}
      <p className="m-0 text-[13px] text-(--land-muted)">You can change this later in Profile.</p>
    </div>
  );
}

export default function Onboarding({ role }: { role: OnboardingRole }) {
  const [open, setOpen] = useState(() => shouldShowOnboarding(role));
  const [index, setIndex] = useState(0);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const watch = useScrollPane<HTMLDivElement>();
  const slides = SLIDES[role];
  const last = index === slides.length - 1;

  const finish = useCallback(() => {
    try {
      localStorage.setItem(onboardingKey(role), new Date().toISOString());
    } catch {
      /* private mode: it shows again next time, which does no harm */
    }
    setOpen(false);
  }, [role]);

  const go = (next: number) => {
    const row = rowRef.current;
    const target = Math.max(0, Math.min(slides.length - 1, next));
    setIndex(target);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row?.scrollTo({ left: target * row.clientWidth, behavior: reduce ? "auto" : "smooth" });
  };

  if (!open) return null;
  const slide = slides[index];

  return (
    <Modal
      open
      onClose={finish}
      title={index === 0 ? `Welcome to ${APP_NAME[role]}` : slide.title}
      description={`${index + 1} of ${slides.length}`}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button variant="ghost" onClick={finish}>
            Skip
          </Button>
          <div className="flex gap-2">
            {index > 0 && (
              <Button variant="secondary" onClick={() => go(index - 1)}>
                Back
              </Button>
            )}
            <Button onClick={() => (last ? finish() : go(index + 1))}>{last ? "Start" : "Next"}</Button>
          </div>
        </div>
      }
    >
      <div
        ref={(element) => {
          rowRef.current = element;
          watch(element);
        }}
        data-axis="x"
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label={`About ${APP_NAME[role]}; swipe for more`}
        className="inb-snap-row onboarding-row"
        onScroll={(event) => {
          const row = event.currentTarget;
          setIndex(Math.round(row.scrollLeft / Math.max(1, row.clientWidth)));
        }}
      >
        {slides.map((item, i) => (
          <section
            key={item.title}
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${slides.length}: ${item.title}`}
            aria-hidden={i !== index || undefined}
            className="onboarding-slide flex w-full shrink-0 flex-col gap-4"
          >
            {i === 0 && <PsuSeal size={56} clearSpace={false} />}
            <h3 className="m-0 text-lg font-bold text-(--role-ink)">{item.title}</h3>
            <p className="m-0 text-[15px] leading-relaxed text-(--land-muted)">{item.text}</p>
            <div aria-hidden="true">{item.fragment}</div>
            {item.primer === "push" && i === index && <PushPrimer role={role} />}
          </section>
        ))}
      </div>
      <div className="mt-4 flex justify-center gap-1" role="group" aria-label="Slides">
        {slides.map((item, i) => (
          <button
            key={item.title}
            type="button"
            aria-label={`Slide ${i + 1}: ${item.title}`}
            aria-current={i === index ? "step" : undefined}
            onClick={() => go(i)}
            className="grid h-11 w-11 place-items-center rounded-full"
          >
            <span className={`h-2.5 rounded-full transition-all ${i === index ? "w-6 bg-(--role-primary)" : "w-2.5 bg-(--land-line)"}`} />
          </button>
        ))}
      </div>
    </Modal>
  );
}
