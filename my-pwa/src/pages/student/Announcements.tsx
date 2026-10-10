import AnnouncementList from "../../components/AnnouncementList";
import StudentLayout from "../../layouts/StudentLayout";

export default function StudentAnnouncements() {
  return (
    <StudentLayout title="Announcements" subtitle="What your OJT coordinator has announced.">
      <AnnouncementList role="student" />
    </StudentLayout>
  );
}
