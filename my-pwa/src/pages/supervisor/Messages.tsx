import { useState } from "react";
import ComposeMessage from "../../components/ComposeMessage";
import MessagesList from "../../components/MessagesList";
import { Button } from "../../components/ui";
import SupervisorLayout from "../../layouts/SupervisorLayout";
import { useAccount } from "../../lib/session";
import { useCoordinatorContact } from "./useCoordinatorContact";

/** Talk, Messages (PSU redesign 10): the supervisor's threads, and a message to the OJT coordinator. */
export default function SupervisorMessages() {
  const supervisor = useAccount("supervisor");
  const coordinator = useCoordinatorContact(supervisor?.supervisor_id, true);
  const [writing, setWriting] = useState(false);
  return (
    <SupervisorLayout
      title="Messages"
      actions={
        coordinator ? (
          <Button icon="mail" onClick={() => setWriting(true)}>
            Message the coordinator
          </Button>
        ) : undefined
      }
    >
      <MessagesList role="supervisor" />
      {writing && coordinator && (
        <ComposeMessage
          role="supervisor"
          to={{ role: "coordinator", id: coordinator.coordinator_id, name: coordinator.name, email: coordinator.email }}
          subject="A question about our interns"
          onClose={() => setWriting(false)}
        />
      )}
    </SupervisorLayout>
  );
}
