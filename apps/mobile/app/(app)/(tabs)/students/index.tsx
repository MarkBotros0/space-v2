import { useLocalSearchParams, useRouter } from "expo-router";
import type { StudentListStatus } from "@space/shared";

import { StudentDirectory } from "../../../../src/screens/students-list/student-directory";
import { useSessionStore, useIsSuper } from "../../../../src/store/session";
import { Button } from "../../../../src/design/ui";

/** `?show=alumni|dropped` opens the list on that filter (owner, 2026-11-07: they are filters, not pages). */
function parseShow(raw: unknown): StudentListStatus {
  return raw === "alumni" || raw === "dropped" ? raw : "active";
}

export default function StudentsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ show?: string; absent?: string }>();
  const isSuper = useIsSuper();
  // A mentor's people are their Community of members, students and alumni alike (owner, 2026-11-07).
  const isMentor = useSessionStore((s) => s.user?.role === "MENTOR");
  // LEADER is included: their nav has no /students tab, but the endpoint
  // narrows them to their groups' members, and the route stays reachable by
  // navigation (spec 06 §9's leader-roster decision, answered "yes, scoped").
  return (
    <StudentDirectory
      status={parseShow(params.show)}
      // The mentor's Home card "Absent lately" opens the list on it.
      absentLately={params.absent === "1"}
      allowedRoles={["SUPER", "ADMIN", "MENTOR", "LEADER"]}
      title={isMentor ? "Community" : "Students"}
      // Creation is SUPER-only (Plan 7's POST /students).
      headerAction={isSuper ? <Button onPress={() => router.push("/students/new")}>New student</Button> : null}
    />
  );
}
