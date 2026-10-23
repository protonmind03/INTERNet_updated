import MessagesList from "../../components/MessagesList";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";

/** Talk, Messages (PSU redesign 11): the coordinator's message threads. A new message starts from a person's page. */
export default function CoordinatorMessages() {
  return (
    <CoordinatorLayout title="Messages">
      <MessagesList role="coordinator" />
    </CoordinatorLayout>
  );
}
