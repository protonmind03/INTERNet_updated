import MessagesList from "../../components/MessagesList";
import StudentLayout from "../../layouts/StudentLayout";

/** More, Messages (PSU redesign 7A3): the trainee's message threads. */
export default function StudentMessages() {
  return (
    <StudentLayout title="Messages">
      <MessagesList role="student" />
    </StudentLayout>
  );
}
