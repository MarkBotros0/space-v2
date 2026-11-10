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
import { calendarBranchFor } from "../../../src/lib/calendar-branch";
import { audienceOf, useSessionStore } from "../../../src/store/session";

/**
 * /calendar — one route, every role (Decision D1). STUDENT/ALUMNI keep
 * Plan 4's pinned season; ADMIN gets a season switcher; SUPER and LEADER see
 * every season the server scopes them to, in an org-day window. MENTOR has
 * no calendar in its nav (spec 03 §9).
 */
export default function CalendarScreen() {
  const branch = useSessionStore((s) => calendarBranchFor(audienceOf(s), s.scopes?.groupLeaderIds ?? []));

  switch (branch) {
    case "UNAVAILABLE":
      return (
        <Screen title="Calendar">
          <EmptyState icon={CalendarIcon} title="Calendar" description="The calendar isn't available for your role." />
        </Screen>
      );
    case "LEADS_NOTHING":
      return (
        <Screen title="Calendar" subtitle="You don't lead any groups yet.">
          <EmptyState
            icon={CalendarIcon}
            title="No calendar"
            description="An admin will add you to a group when you're ready."
          />
        </Screen>
      );
    case "LEADER":
      return <LeaderCalendar />;
    case "SUPER":
      return <SuperCalendar />;
    case "ADMIN":
      return <AdminCalendar />;
    // navFor's rule (shared): a graduated student, unless studying; /events already answers them
    // with their alumni-only events.
    case "ALUMNI":
      return <AlumniCalendar />;
    case "STUDENT":
      return <StudentCalendar />;
  }
}
