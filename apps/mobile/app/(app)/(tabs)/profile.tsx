import { isStudyingAlumnus } from "@space/shared";

import { AccountProfile } from "../../../src/screens/profile/account-profile";
import { AlumniProfile } from "../../../src/screens/profile/alumni-profile";
import { StudentProfile } from "../../../src/screens/profile/student-profile";
import { useSessionStore } from "../../../src/store/session";

export default function ProfileScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const graduationYear = useSessionStore((s) => s.scopes?.graduationYear ?? null);
  const activeSeasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  // Three components, not one with branches: each calls different hooks, and
  // a role change remounts cleanly instead of reordering hooks.
  if (role === "STUDENT") {
    const studying = isStudyingAlumnus({ role, graduationYear, activeSeasonId });
    return graduationYear !== null && !studying ? <AlumniProfile /> : <StudentProfile />;
  }
  return <AccountProfile />;
}
