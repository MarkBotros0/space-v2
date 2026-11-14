import { useLocalSearchParams } from "expo-router";

import { StaffWork } from "../../../src/screens/staff-work";
import { useRole } from "../../../src/store/session";

/**
 * The Work tab (assignments and quizzes): ADMIN's (owner 2026-11-07) and, since 2026-11-14, the
 * LEADER's in place of Submissions, without New buttons. SUPER reaches it from More. `tab=quizzes`
 * opens on the quizzes (Home's "Quizzes to grade").
 */
export default function CourseworkScreen() {
  const role = useRole();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  return (
    <StaffWork
      canAuthor={role === "ADMIN" || role === "SUPER"}
      initialTab={tab === "quizzes" ? "quizzes" : tab === "assignments" ? "assignments" : undefined}
    />
  );
}
