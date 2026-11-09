import { useLocalSearchParams } from "expo-router";

import { seasonParam } from "../../../src/lib/season-param";
import { NotAvailable } from "../../../src/screens/attention/not-available";
import { StudentsAtRisk } from "../../../src/screens/attention/at-risk-list";
import { useRole } from "../../../src/store/session";

/** Opened from Today's "N students at risk" (ADMIN, SUPER). */
export default function AttentionAtRiskScreen() {
  const role = useRole();
  const seasonId = seasonParam(useLocalSearchParams<{ seasonId?: string }>().seasonId);
  if (role !== "ADMIN" && role !== "SUPER") return <NotAvailable title="Students at risk" />;
  return <StudentsAtRisk seasonId={seasonId} />;
}
