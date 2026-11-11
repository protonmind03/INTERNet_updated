import AnnouncementList from "../../components/AnnouncementList";
import SupervisorLayout from "../../layouts/SupervisorLayout";

export default function SupervisorAnnouncements() {
  return (
    <SupervisorLayout title="Announcements">
      <AnnouncementList role="supervisor" />
    </SupervisorLayout>
  );
}
