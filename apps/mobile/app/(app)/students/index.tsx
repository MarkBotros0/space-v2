import { useRouter } from "expo-router";

import { StudentList } from "../../../src/components/StudentList";
import { useSessionStore } from "../../../src/store/session";
import { Button } from "../../../src/ui";

export default function StudentsScreen() {
  const router = useRouter();
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  // LEADER is included: their nav has no /students tab, but the endpoint
  // narrows them to their groups' members, and the route stays reachable by
  // navigation (spec 06 §9's leader-roster decision, answered "yes, scoped").
  return (
    <StudentList
      status="active"
      allowedRoles={["SUPER", "ADMIN", "MENTOR", "LEADER"]}
      title="Students"
      // Creation is SUPER-only (Plan 7's POST /students).
      headerAction={
        isSuper ? <Button title="New student" onPress={() => router.push("/students/new")} /> : null
      }
    />
  );
}
