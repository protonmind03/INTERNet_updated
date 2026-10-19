import LivenessCamera from "../../components/LivenessCamera";
import { Button, Modal } from "../../components/ui";
import type { Prompt } from "../../lib/liveness/engine";

/*
| Iteration 22: on the strict level (after a rejected time-in photo), End
| break also runs the camera check, with the standard prompts. No photo is
| kept: only that the check passed. Skipping it still records End break;
| the supervisor sees that the check was not run.
*/

export type EndBreakChallenge = { ticket: string; prompts: Prompt[]; spare: Prompt | null; expiresAt: number };

export default function EndBreakCheck({
  challenge,
  onPassed,
  onSkip,
  onRenew,
}: {
  challenge: EndBreakChallenge;
  onPassed: (report: unknown) => void;
  onSkip: () => void;
  onRenew: () => void;
}) {
  return (
    <Modal
      open
      onClose={onSkip}
      title="Camera check for End break"
      description="Your account is on the stricter check for now. Follow the prompts; no photo is kept."
      footer={
        <Button variant="secondary" onClick={onSkip}>
          Skip the camera check
        </Button>
      }
    >
      <LivenessCamera
        key={challenge.ticket}
        prompts={challenge.prompts}
        spare={challenge.spare}
        strict={false}
        expiresAt={challenge.expiresAt}
        onRenew={onRenew}
        onPassed={(_photo, report) => onPassed(report)}
      />
    </Modal>
  );
}
