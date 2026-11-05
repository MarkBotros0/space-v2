import { navFor, type NavItem } from "@space/shared";

/**
 * Student-only routes the student's nav no longer names: the detail routes, and
 * /assignments and /quizzes, which a student opens through Work (P2-1) but which
 * stay in the staff navs, so the derivation below cannot see them.
 */
const STUDENT_ONLY_SEGMENTS: readonly string[] = ["assignment", "assignments", "quiz", "quizzes"];

const hrefsOf = (items: NavItem[]) => items.map((item) => item.href);

/**
 * v1's role-layout.tsx sent an alumnus out of the active-student area to the
 * read-only portal. Flat routes have no such area, so the student-only
 * destinations are derived from the two navs (REG-81): whatever a STUDENT's
 * tabs/sidebar reach that an ALUMNI's do not, computed from `navFor`. Only the
 * routes those navs cannot show are listed by hand, in STUDENT_ONLY_SEGMENTS.
 */
function studentOnlySegments(): ReadonlySet<string> {
  const student = navFor({ role: "STUDENT", graduationYear: null });
  const alumni = navFor({ role: "STUDENT", graduationYear: 2000 });
  const alumniHrefs = new Set([...hrefsOf(alumni.tabs), ...hrefsOf(alumni.sidebar)]);
  const only = [...hrefsOf(student.tabs), ...hrefsOf(student.sidebar)]
    .filter((href) => !alumniHrefs.has(href))
    .map((href) => href.slice(1).split("/")[0] ?? "");
  return new Set([...only, ...STUDENT_ONLY_SEGMENTS]);
}

const BLOCKED = studentOnlySegments();

/** `segments` as expo-router's useSegments() returns them, e.g. ["(app)", "(tabs)", "work"] or ["(app)", "quiz", "[id]"]. */
export function isBlockedForAlumni(segments: readonly string[]): boolean {
  const first = segments.find((s) => !(s.startsWith("(") && s.endsWith(")")));
  return first !== undefined && BLOCKED.has(first);
}
