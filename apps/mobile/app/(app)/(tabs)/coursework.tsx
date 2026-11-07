import { StaffWork } from "../../../src/screens/staff-work";
import { useSessionStore } from "../../../src/store/session";

/** ADMIN's Work tab (assignments and quizzes, owner 2026-11-07); SUPER reaches it from More. */
export default function CourseworkScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  return <StaffWork canAuthor={role === "ADMIN" || role === "SUPER"} />;
}
