import { createHash } from "node:crypto";

import { db } from "../../src/db/client";
import type { SweepPeople } from "./people";
import { fromToday } from "./shared";

// Rows for the super, mentor and alumni sweeps (super-, mentor- and
// alumni-scenarios). Seeded after every other scenario, so the ids the
// student, leader and admin flows name (users 1-8, session 1, group 1,
// event 1) never move.

/** Users in every account state, an alumni-only event, a super's note and notifications. */
export async function seedSuperScenario({ user, superUser, student, season }: SweepPeople): Promise<void> {
  const year = new Date().getUTCFullYear();
  // Users list badges: pending (never invited), invited (a live invite) and
  // inactive (deactivated). Not students, so no student list or count moves.
  await db.user.create({
    data: {
      email: "pending@sweep.jpc.test",
      name: "Peter Pending",
      role: "MENTOR",
      graduationYear: year - 3,
    },
  });
  const invited = await db.user.create({
    data: {
      email: "invited@sweep.jpc.test",
      name: "Ivy Invited",
      role: "LEADER",
      graduationYear: year - 2,
    },
  });
  await db.inviteToken.create({
    data: {
      // Only a digest is ever stored; nobody holds the raw token, so the invite
      // can't be accepted, only shown.
      token: createHash("sha256").update("sweep-invite-ivy").digest("hex"),
      userId: invited.id,
      invitedById: superUser.id,
      expiresAt: fromToday(5),
    },
  });
  const offboarded = await user("offboarded", "Omar Offboarded", "LEADER", year - 4);
  await db.user.update({ where: { id: offboarded.id }, data: { deletedAt: fromToday(-20) } });

  await db.engagementNote.create({
    data: {
      studentUserId: student.id,
      authorUserId: superUser.id,
      seasonId: season.id,
      body: "Asked about serving next season; worth a conversation.",
      visibility: "ADMINS",
      followUpFlagged: true,
    },
  });
  await db.notification.createMany({
    data: [
      {
        userId: superUser.id,
        type: "LOW_ATTENDANCE_FLAG",
        title: "Salma Student is low on attendance budget",
        link: "/students",
      },
      {
        userId: superUser.id,
        type: "SUBMISSION_RECEIVED",
        title: "New submission: Opening night reflection",
        link: "/students",
        readAt: fromToday(-2),
      },
    ],
  });
}

/** Notes the mentor wrote, a follow-up for them and notifications. */
export async function seedMentorScenario({ mentor, student, classmate, alumni, season, pastSeason }: SweepPeople): Promise<void> {
  await db.engagementNote.createMany({
    data: [
      {
        studentUserId: student.id,
        authorUserId: mentor.id,
        seasonId: season.id,
        body: "Met for coffee. Struggling with the reading load; suggested a study partner.",
        visibility: "MENTORS",
        followUpFlagged: true,
      },
      {
        studentUserId: classmate.id,
        authorUserId: mentor.id,
        seasonId: season.id,
        body: "Doing well. Interested in leading a group next year.",
        visibility: "MENTORS",
      },
      {
        studentUserId: alumni.id,
        authorUserId: mentor.id,
        seasonId: pastSeason.id,
        body: "Graduated strong. Keep in touch about the alumni reunion.",
        visibility: "MENTORS",
      },
    ],
  });
  await db.notification.createMany({
    data: [
      {
        userId: mentor.id,
        type: "MENTOR_FOLLOWUP",
        title: "Follow-up flagged for Samir Student",
        body: "A leader asked a mentor to check in.",
        link: "/students",
      },
      {
        userId: mentor.id,
        type: "LOW_ATTENDANCE_FLAG",
        title: "Salma Student was late to Opening night",
        link: "/students",
        readAt: fromToday(-3),
      },
    ],
  });
}

/**
 * The alumnus's graduated season with a group, a curriculum and attendance,
 * so My History shows a real row; an alumni-only event; notifications.
 */
export async function seedAlumniScenario({ superUser, leader, alumni, pastSeason }: SweepPeople): Promise<void> {
  const group = await db.group.create({
    data: { seasonId: pastSeason.id, name: "Group Z", description: "Last year's Thursday group" },
  });
  await db.groupLeader.create({ data: { groupId: group.id, userId: leader.id } });
  await db.seasonEnrollment.updateMany({
    where: { studentUserId: alumni.id, seasonId: pastSeason.id },
    data: { groupId: group.id },
  });
  const finale = await db.session.findFirstOrThrow({
    where: { seasonId: pastSeason.id, title: "Last year's finale" },
  });
  const firstWeek = await db.session.create({
    data: { seasonId: pastSeason.id, title: "Week 1: Foundations", startsAt: fromToday(-480), location: "Hall B" },
  });
  const secondWeek = await db.session.create({
    data: { seasonId: pastSeason.id, title: "Week 2: Community", startsAt: fromToday(-470), location: "Hall B" },
  });
  await db.attendance.createMany({
    data: [
      { sessionId: firstWeek.id, studentUserId: alumni.id, status: "PRESENT", markedById: leader.id },
      { sessionId: secondWeek.id, studentUserId: alumni.id, status: "ABSENT", markedById: leader.id },
      { sessionId: finale.id, studentUserId: alumni.id, status: "PRESENT", markedById: leader.id },
    ],
  });

  await db.jpcEvent.create({
    data: {
      title: "Alumni reunion dinner",
      date: fromToday(21),
      description: "Fake alumni-only event for the UI sweep.",
      visibility: "ALUMNI_ONLY",
      createdById: superUser.id,
    },
  });
  await db.notification.createMany({
    data: [
      {
        userId: alumni.id,
        type: "SESSION_RESCHEDULED",
        title: "Alumni reunion dinner moved to a Friday",
        body: "Same place, one day later.",
        link: "/calendar",
      },
      {
        userId: alumni.id,
        type: "SESSION_CANCELLED",
        title: "Alumni coffee morning cancelled",
        readAt: fromToday(-30),
      },
    ],
  });
}
