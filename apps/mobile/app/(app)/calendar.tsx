import { Calendar as CalendarIcon } from "lucide-react-native";
import { View } from "react-native";

import { PageTitle } from "../../src/design/layout/page-title";
import { ShellFrame } from "../../src/design/layout/shell-frame";
import { EmptyState } from "../../src/design/ui";
import { AlumniCalendar } from "../../src/screens/calendar/alumni-calendar";
import {
  AdminCalendar,
  LeaderCalendar,
  StudentCalendar,
  SuperCalendar,
} from "../../src/screens/calendar/season-calendars";
import { useSessionStore } from "../../src/store/session";

/**
 * /calendar — one route, every role (Decision D1). STUDENT/ALUMNI keep
 * Plan 4's pinned season; ADMIN gets a season switcher; SUPER and LEADER see
 * every season the server scopes them to, in an org-day window. MENTOR has
 * no calendar in its nav (spec 03 §9).
 */
export default function CalendarScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const isAlumnus = useSessionStore((s) => (s.scopes?.graduationYear ?? null) !== null);
  const leadsNothing = useSessionStore(
    (s) => s.user?.role === "LEADER" && (s.scopes?.groupLeaderIds.length ?? 0) === 0,
  );

  if (role === "MENTOR") {
    return (
      <ShellFrame>
        <EmptyState
          icon={CalendarIcon}
          title="Calendar"
          description="The calendar isn't available for your role."
        />
      </ShellFrame>
    );
  }
  if (leadsNothing) {
    return (
      <ShellFrame>
        <View className="flex-col gap-4">
          <PageTitle title="Calendar" subtitle="You don't lead any groups yet." />
          <EmptyState
            icon={CalendarIcon}
            title="No calendar"
            description="An admin will add you to a group when you're ready."
          />
        </View>
      </ShellFrame>
    );
  }
  if (role === "LEADER") return <LeaderCalendar />;
  if (role === "SUPER") return <SuperCalendar />;
  if (role === "ADMIN") return <AdminCalendar />;
  if (isAlumnus) return <AlumniCalendar />;
  return <StudentCalendar />;
}
