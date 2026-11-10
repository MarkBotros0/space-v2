import type { StudentListItem } from "@space/shared";
import type { Prisma } from "../../../generated/prisma/client";
import type { SessionUser } from "../../auth/tokens";
import { staffRosterWhere } from "../../permissions";
import { currentSeasonEnrollmentSelect } from "./current-season";
import { currentMembershipSelect } from "./current-group";

export interface StudentListResult {
  students: StudentListItem[];
  nextCursor: number | null;
  total: number;
}

export const emptyList = (): StudentListResult => ({ students: [], nextCursor: null, total: 0 });

export function searchFilter(q: string | undefined): Prisma.UserWhereInput {
  if (!q) return {};
  return {
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { studentProfile: { university: { contains: q, mode: "insensitive" } } },
    ],
  };
}

/**
 * The two per-row season facts, limited to the seasons this caller may read:
 * staff never see a group or a season they don't serve in, as with the detail.
 */
export function currentFactsSelect(user: SessionUser) {
  const roster = staffRosterWhere(user) ?? {};
  return {
    seasonEnrollments: {
      ...currentSeasonEnrollmentSelect,
      where: { ...currentSeasonEnrollmentSelect.where, ...roster },
    },
    // Advisory current group — the one question GroupStudent may answer (C9).
    groupStudentMemberships: { ...currentMembershipSelect({ name: true }), where: roster },
  };
}

export function listSelect(user: SessionUser) {
  return {
    id: true,
    name: true,
    email: true,
    avatarPath: true,
    graduationYear: true,
    studentProfile: {
      select: {
        university: true,
        faculty: true,
        universityGraduationYear: true,
      },
    },
    ...currentFactsSelect(user),
  } as const;
}

export type ListRow = Prisma.UserGetPayload<{ select: ReturnType<typeof listSelect> }>;

export function toListItem(u: ListRow): StudentListItem {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatarPath: u.avatarPath,
    university: u.studentProfile?.university ?? null,
    faculty: u.studentProfile?.faculty ?? null,
    universityGraduationYear: u.studentProfile?.universityGraduationYear ?? null,
    graduationYear: u.graduationYear,
    activeSeasonTitle: u.seasonEnrollments[0]?.season.title ?? null,
    currentGroupName: u.groupStudentMemberships[0]?.group.name ?? null,
    droppedEnrollment: null,
  };
}
