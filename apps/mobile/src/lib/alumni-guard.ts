import { navFor, type NavItem } from "@space/shared";

/** Detail routes that belong to a student-only destination (not themselves in any nav). */
const STUDENT_ONLY_DETAIL_SEGMENTS: readonly string[] = ["assignment", "quiz"];

const hrefsOf = (items: NavItem[]) => items.map((item) => item.href);

/**
 * v1's role-layout.tsx sent an alumnus out of the active-student area to the
 * read-only portal. Flat routes have no such area, so the student-only
 * destinations are derived from the two navs (REG-81): whatever a STUDENT's
 * tabs/sidebar reach that an ALUMNI's do not. Computed from `navFor`, never
 * re-listed by hand.
 */
function studentOnlySegments(): ReadonlySet<string> {
  const student = navFor({ role: "STUDENT", graduationYear: null });
  const alumni = navFor({ role: "STUDENT", graduationYear: 2000 });
  const alumniHrefs = new Set([...hrefsOf(alumni.tabs), ...hrefsOf(alumni.sidebar)]);
  const only = [...hrefsOf(student.tabs), ...hrefsOf(student.sidebar)]
    .filter((href) => !alumniHrefs.has(href))
    .map((href) => href.slice(1).split("/")[0] ?? "");
  return new Set([...only, ...STUDENT_ONLY_DETAIL_SEGMENTS]);
}

const BLOCKED = studentOnlySegments();

/** `segments` as expo-router's useSegments() returns them, e.g. ["(app)", "assignments"]. */
export function isBlockedForAlumni(segments: readonly string[]): boolean {
  const first = segments.find((s) => !(s.startsWith("(") && s.endsWith(")")));
  return first !== undefined && BLOCKED.has(first);
}
