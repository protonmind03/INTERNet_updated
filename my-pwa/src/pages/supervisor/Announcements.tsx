import AnnouncementList from "../../components/AnnouncementList";
import SupervisorLayout from "../../layouts/SupervisorLayout";

export default function SupervisorAnnouncements() {
  return (
    <SupervisorLayout title="Announcements" subtitle="What the OJT coordinator has announced.">
      <AnnouncementList role="supervisor" />
    </SupervisorLayout>
  );
}
