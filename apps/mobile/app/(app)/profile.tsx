import { AccountProfile } from "../../src/screens/profile/account-profile";
import { AlumniProfile } from "../../src/screens/profile/alumni-profile";
import { StudentProfile } from "../../src/screens/profile/student-profile";
import { useSessionStore } from "../../src/store/session";

export default function ProfileScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const graduationYear = useSessionStore((s) => s.scopes?.graduationYear ?? null);
  // Three components, not one with branches: each calls different hooks, and
  // a role change remounts cleanly instead of reordering hooks.
  if (role === "STUDENT") return graduationYear !== null ? <AlumniProfile /> : <StudentProfile />;
  return <AccountProfile />;
}
