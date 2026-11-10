/**
 * The student list's words, per audience (refactor FE-061). Staff see students and their seasons;
 * a mentor sees members, never anything season-shaped (owner, 2026-11-07). Pure, so the
 * owner-ruled copy is pinned by tests and the list renders whatever this answers.
 */
import type { StudentListStatus } from "@space/shared";

import { NAV_ICONS } from "../../design/icons/nav-icon";
import type { StudentListView } from "../../hooks/use-students";

export type StudentListAudience = "staff" | "mentor";

const STAFF = {
  active: {
    icon: NAV_ICONS.students,
    emptyTitle: "No students yet",
    emptyDescription: "Students will appear here once they're enrolled.",
    subtitle: (n: number) => `${n} ${n === 1 ? "student" : "students"} in your seasons`,
  },
  alumni: {
    icon: NAV_ICONS.alumni,
    emptyTitle: "No alumni yet",
    emptyDescription: "Students you graduate will appear here.",
    subtitle: (n: number) => `${n} graduated ${n === 1 ? "student" : "students"} from your seasons`,
  },
  dropped: {
    icon: NAV_ICONS.dropped,
    emptyTitle: "No dropped students",
    emptyDescription: "Students who leave a season without graduating will show up here.",
    subtitle: (n: number) => `${n} ${n === 1 ? "student" : "students"} dropped from your seasons`,
  },
} as const;

/** A mentor's people are members, students and alumni alike; no "your seasons" (owner, 2026-11-07). */
function mentorSubtitle(n: number, absent: boolean): string {
  const people = `${n} ${n === 1 ? "member" : "members"}`;
  return absent ? `${people} absent lately` : people;
}

export interface StudentListCopy {
  icon: (typeof STAFF)[StudentListStatus]["icon"];
  searchLabel: string;
  /** The count line under the title, for the population under the current filters. */
  subtitle: (total: number) => string;
  emptyTitle: string;
  emptyDescription: string;
}

export function studentListCopy({
  audience,
  shown,
  view,
  q,
}: {
  audience: StudentListAudience;
  shown: StudentListStatus;
  view: StudentListView;
  q: string;
}): StudentListCopy {
  const staff = STAFF[shown];
  const mentor = audience === "mentor";
  const mentorActive = mentor && shown === "active";
  const filtered = q !== "" || view.groupId !== null || view.seasonId !== null || view.absentLately;
  return {
    icon: staff.icon,
    searchLabel: mentor ? "Search members" : "Search students",
    subtitle: mentor ? (n) => mentorSubtitle(n, view.absentLately) : staff.subtitle,
    emptyTitle: filtered ? "No matches" : mentorActive ? "No members yet" : staff.emptyTitle,
    emptyDescription: emptyDescription({ mentor, mentorActive, view, q, fallback: staff.emptyDescription }),
  };
}

/** The first that applies: the search, absent lately, the group, the season, else the list's own. */
function emptyDescription(p: {
  mentor: boolean;
  mentorActive: boolean;
  view: StudentListView;
  q: string;
  fallback: string;
}): string {
  if (p.q) return `No ${p.mentor ? "members" : "students"} match your search.`;
  if (p.view.absentLately) return "Nobody has missed their last two sessions.";
  if (p.view.groupId !== null) return "No students are in that group.";
  if (p.view.seasonId !== null) return "No students are in that season.";
  if (p.mentorActive) return "Members will appear here once they join a season.";
  return p.fallback;
}
