import { isStudyingAlumnus } from "@space/shared";

import { useSessionStore } from "../../store/session";

/**
 * Which academic record the profile shows. A student (or an alumnus studying in a
 * community-wide season) edits university, faculty and graduation year; an
 * alumnus reads them; staff have none.
 */
type ProfileKind = "student" | "alumni" | "staff";

export function useProfileKind(): ProfileKind {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const graduationYear = useSessionStore((s) => s.scopes?.graduationYear ?? null);
  const activeSeasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  if (role !== "STUDENT") return "staff";
  if (graduationYear === null) return "student";
  return isStudyingAlumnus({ role, graduationYear, activeSeasonId }) ? "student" : "alumni";
}
