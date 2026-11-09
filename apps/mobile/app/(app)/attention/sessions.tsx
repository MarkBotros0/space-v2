import { useLocalSearchParams } from "expo-router";

import { seasonParam } from "../../../src/lib/season-param";
import { NotAvailable } from "../../../src/screens/attention/not-available";
import { SessionsWithoutAttendance } from "../../../src/screens/attention/sessions-list";
import { useRole } from "../../../src/store/session";

/** Opened from Today's "N sessions with no attendance" (ADMIN, SUPER). */
export default function AttentionSessionsScreen() {
  const role = useRole();
  const seasonId = seasonParam(useLocalSearchParams<{ seasonId?: string }>().seasonId);
  if (role !== "ADMIN" && role !== "SUPER") return <NotAvailable title="Sessions with no attendance" />;
  return <SessionsWithoutAttendance role={role} seasonId={seasonId} />;
}
