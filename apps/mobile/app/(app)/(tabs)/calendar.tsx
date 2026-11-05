import { isAlumnus } from "@space/shared";
import { Calendar as CalendarIcon } from "lucide-react-native";

import { Screen } from "../../../src/design/layout/screen";
import { EmptyState } from "../../../src/design/ui";
import { AlumniCalendar } from "../../../src/screens/calendar/alumni-calendar";
import {
  AdminCalendar,
  LeaderCalendar,
  StudentCalendar,
  SuperCalendar,
} from "../../../src/screens/calendar/season-calendars";
import { useSessionStore } from "../../../src/store/session";

/**
 * /calendar — one route, every role (Decision D1). STUDENT/ALUMNI keep
 * Plan 4's pinned season; ADMIN gets a season switcher; SUPER and LEADER see
 * every season the server scopes them to, in an org-day window. MENTOR has
 * no calendar in its nav (spec 03 §9).
 */
export default function CalendarScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  // navFor's rule (shared): a graduated student.
  const alumnus = useSessionStore(
    (s) =>
      s.user != null &&
      isAlumnus({ role: s.user.role, graduationYear: s.scopes?.graduationYear ?? null }),
  );
  const leadsNothing = useSessionStore(
    (s) => s.user?.role === "LEADER" && (s.scopes?.groupLeaderIds.length ?? 0) === 0,
  );

  if (role === "MENTOR") {
    return (
      <Screen title="Calendar">
        <EmptyState
          icon={CalendarIcon}
          title="Calendar"
          description="The calendar isn't available for your role."
        />
      </Screen>
    );
  }
  if (leadsNothing) {
    return (
      <Screen title="Calendar" subtitle="You don't lead any groups yet.">
        <EmptyState
          icon={CalendarIcon}
          title="No calendar"
          description="An admin will add you to a group when you're ready."
        />
      </Screen>
    );
  }
  if (role === "LEADER") return <LeaderCalendar />;
  if (role === "SUPER") return <SuperCalendar />;
  if (role === "ADMIN") return <AdminCalendar />;
  if (alumnus) return <AlumniCalendar />;
  return <StudentCalendar />;
}
