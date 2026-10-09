import { useRouter } from "expo-router";

import { StudentList } from "../../../src/components/StudentList";
import { useSessionStore } from "../../../src/store/session";
import { Button } from "../../../src/ui";

export default function StudentsScreen() {
  const router = useRouter();
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  // No LEADER: v1 had no leader students list (06-students R28); a leader
  // reaches their students through My groups.
  return (
    <StudentList
      status="active"
      allowedRoles={["SUPER", "ADMIN", "MENTOR"]}
      title="Students"
      // Creation is SUPER-only (Plan 7's POST /students).
      headerAction={
        isSuper ? <Button title="New student" onPress={() => router.push("/students/new")} /> : null
      }
    />
  );
}
