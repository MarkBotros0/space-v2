import { db } from "../../../db/client";
import { dayFromDate } from "../../org-time";
import { currentSeasonEnrollmentSelect } from "../students/current-season";
import { liveUser } from "../../db/live";

// ---------------------------------------------------------------------------
// Own profile — v1 app/student/profile/page.tsx, app/alumni/profile/page.tsx
// ---------------------------------------------------------------------------

interface MyProfileRow {
  name: string;
  email: string;
  avatarPath: string | null;
  graduationYear: number | null;
  activeSeasonTitle: string | null;
  university: string | null;
  faculty: string | null;
  universityGraduationYear: number | null;
  phone: string | null;
  dateOfBirth: string | null;
}

/**
 * Deliberately NOT GET /students/:id with id = self (spec 06 §7): `notes` is
 * not in this select at all, so no future flag can leak it (R23, R71).
 */
export async function loadMyProfile(userId: number): Promise<MyProfileRow | null> {
  const row = await db.user.findFirst({
    where: { id: userId, ...liveUser },
    select: {
      name: true,
      email: true,
      avatarPath: true,
      graduationYear: true,
      phone: true,
      dateOfBirth: true,
      studentProfile: {
        select: {
          university: true,
          faculty: true,
          universityGraduationYear: true,
        },
      },
      seasonEnrollments: currentSeasonEnrollmentSelect,
    },
  });
  if (!row) return null;
  const p = row.studentProfile;
  return {
    name: row.name,
    email: row.email,
    avatarPath: row.avatarPath,
    graduationYear: row.graduationYear,
    activeSeasonTitle: row.seasonEnrollments[0]?.season.title ?? null,
    university: p?.university ?? null,
    faculty: p?.faculty ?? null,
    universityGraduationYear: p?.universityGraduationYear ?? null,
    // Account-level (User) since 2026-11-06.
    phone: row.phone,
    // A calendar date stored at UTC midnight (Plan 11 Decision 11).
    dateOfBirth: dayFromDate(row.dateOfBirth),
  };
}
