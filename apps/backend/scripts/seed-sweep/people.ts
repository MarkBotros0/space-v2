import bcrypt from "bcryptjs";

import { db } from "../../src/db/client";
import { fromToday, SWEEP_PASSWORD } from "./shared";

type Role = "SUPER" | "ADMIN" | "LEADER" | "STUDENT" | "MENTOR";

/** Every role's user, the two seasons, the group and its enrolments. */
export async function seedPeople() {
  const passwordHash = await bcrypt.hash(SWEEP_PASSWORD, 10);
  const user = (
    key: string,
    name: string,
    role: Role,
    graduationYear?: number,
  ) =>
    db.user.create({
      data: { email: `${key}@sweep.jpc.test`, name, role, passwordHash, graduationYear },
    });

  const superUser = await user("super", "Sara Super", "SUPER");
  const admin = await user("admin", "Adam Admin", "ADMIN");
  const leader = await user("leader", "Lina Leader", "LEADER");
  const mentor = await user("mentor", "Mina Mentor", "MENTOR");
  const student = await user("student", "Samir Student", "STUDENT");
  const classmate = await user("student2", "Salma Student", "STUDENT");
  const alumni = await user("alumni", "Aya Alumni", "STUDENT", fromToday(-365).getUTCFullYear());

  const year = new Date().getUTCFullYear();
  const pastSeason = await db.season.create({
    data: {
      code: `gbv-${year - 1}`,
      title: `GBV ${year - 1}`,
      program: "GBV",
      year: year - 1,
      status: "COMPLETED",
      startDate: fromToday(-500),
      endDate: fromToday(-380),
      createdById: superUser.id,
    },
  });
  const season = await db.season.create({
    data: {
      code: `gbv-${year}`,
      title: `GBV ${year}`,
      program: "GBV",
      year,
      description: "Fake season for the UI sweep.",
      status: "ACTIVE",
      startDate: fromToday(-30),
      endDate: fromToday(90),
      createdById: superUser.id,
    },
  });
  await db.seasonAdmin.create({
    data: { seasonId: season.id, userId: admin.id, assignedById: superUser.id },
  });

  const group = await db.group.create({
    data: { seasonId: season.id, name: "Group A", description: "Tuesday evening group" },
  });
  await db.groupLeader.create({ data: { groupId: group.id, userId: leader.id } });
  for (const s of [student, classmate]) {
    await db.groupStudent.create({ data: { groupId: group.id, seasonId: season.id, studentUserId: s.id } });
    await db.seasonEnrollment.create({
      // Joined at the season start, so the reports trend counts them for its past sessions.
      data: { studentUserId: s.id, seasonId: season.id, groupId: group.id, status: "ACTIVE", enrolledAt: fromToday(-30) },
    });
    await db.studentProfile.create({
      data: { userId: s.id, university: "Cairo University", year: "3" },
    });
  }
  await db.seasonEnrollment.create({
    data: {
      studentUserId: alumni.id,
      seasonId: pastSeason.id,
      status: "COMPLETED",
      enrolledAt: fromToday(-500),
      completedAt: fromToday(-380),
    },
  });
  await db.studentProfile.create({
    data: { userId: alumni.id, university: "Ain Shams University" },
  });

  return { user, superUser, admin, leader, mentor, student, classmate, alumni, season, pastSeason };
}

export type SweepPeople = Awaited<ReturnType<typeof seedPeople>>;
