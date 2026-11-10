// apps/backend/src/lib/queries/dashboard.ts
import { db } from "../../../db/client";
import { mergeActivity, type ActivityRow } from "../../dashboard-figures";
import { RECENT_ACTIVITY_LIMIT } from "../../../../../../packages/shared/src/index";
import { liveAssignment, liveSeason, liveUser } from "../../db/live";

/*
 * GET /api/v1/me/dashboard — spec 19 §7. Every figure here is a CALL to the
 * function that owns it; nothing is re-derived (ruling C4). The query count
 * is constant per variant: it does not grow with the cohort, the number of
 * groups, or the number of seasons (spec §7 "Query budget").
 */

/** Active, non-graduated, non-deleted students — the at-risk cohort's people (D17, D18). */
const FEED_STUDENT = { role: "STUDENT" as const, ...liveUser, graduationYear: null };

/** The live community-wide season: it runs alone, so "this season" is this one. */
const LIVE_WIDE_SEASON = { isCommunityWide: true, status: "ACTIVE" as const, ...liveSeason };

/**
 * An alumnus studying there. They are in the feed for that season's rows only:
 * what they did in a regular season before they graduated stays out, as it does
 * for every other alumnus.
 */
const FEED_STUDYING_ALUMNUS = {
  role: "STUDENT" as const,
  ...liveUser,
  graduationYear: { not: null },
  seasonEnrollments: { some: { status: "ACTIVE" as const, season: LIVE_WIDE_SEASON } },
};

/**
 * The mentor's feed: cross-season by design (a mentor reads every student,
 * `canReadAllStudents`), stated here rather than inherited from a page that
 * forgot to filter (spec §4 item 3). Three bounded reads, merged in memory.
 * The at-risk list is NOT here: it is GET /reports/engagement (D17).
 */
export async function loadMentorDashboard() {
  const openAssignment = { ...liveAssignment, season: liveSeason };
  const submissionAuthor = [
    { studentUser: FEED_STUDENT },
    { studentUser: FEED_STUDYING_ALUMNUS, assignment: { season: LIVE_WIDE_SEASON } },
  ];
  const [marks, submitted, reviewedRows] = await Promise.all([
    db.attendance.findMany({
      where: {
        session: { season: liveSeason },
        OR: [
          { studentUser: FEED_STUDENT },
          { studentUser: FEED_STUDYING_ALUMNUS, session: { season: LIVE_WIDE_SEASON } },
        ],
      },
      orderBy: [{ markedAt: "desc" }, { id: "desc" }],
      take: RECENT_ACTIVITY_LIMIT,
      select: {
        id: true,
        status: true,
        markedAt: true,
        studentUserId: true,
        studentUser: { select: { name: true } },
        session: { select: { title: true } },
      },
    }),
    db.submission.findMany({
      where: {
        status: { in: ["SUBMITTED", "REVIEWED", "RETURNED"] },
        submittedAt: { not: null },
        assignment: openAssignment,
        OR: submissionAuthor,
      },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      take: RECENT_ACTIVITY_LIMIT,
      select: {
        id: true,
        publicId: true,
        submittedAt: true,
        studentUserId: true,
        studentUser: { select: { name: true } },
        assignment: { select: { title: true } },
      },
    }),
    db.submission.findMany({
      where: {
        status: { in: ["REVIEWED", "RETURNED"] },
        reviewedAt: { not: null },
        assignment: openAssignment,
        OR: submissionAuthor,
      },
      orderBy: [{ reviewedAt: "desc" }, { id: "desc" }],
      take: RECENT_ACTIVITY_LIMIT,
      select: {
        id: true,
        publicId: true,
        reviewedAt: true,
        studentUserId: true,
        studentUser: { select: { name: true } },
        assignment: { select: { title: true } },
      },
    }),
  ]);

  const rows: ActivityRow[] = [
    ...marks.map((m) => ({
      key: `att:${m.id}`,
      kind: "attendance" as const,
      at: m.markedAt,
      studentUserId: m.studentUserId,
      studentName: m.studentUser.name,
      subjectTitle: m.session.title,
      attendanceStatus: m.status,
      submissionPublicId: null,
    })),
    ...submitted.flatMap((s) =>
      s.submittedAt === null
        ? []
        : [
            {
              key: `sub:${s.id}`,
              kind: "submitted" as const,
              at: s.submittedAt,
              studentUserId: s.studentUserId,
              studentName: s.studentUser.name,
              subjectTitle: s.assignment.title,
              attendanceStatus: null,
              submissionPublicId: s.publicId,
            },
          ],
    ),
    // A review is its own event at reviewedAt (D18). v1 showed "received
    // feedback" at submittedAt, so a review written today on an old
    // submission never surfaced (R54).
    ...reviewedRows.flatMap((s) =>
      s.reviewedAt === null
        ? []
        : [
            {
              key: `rev:${s.id}`,
              kind: "reviewed" as const,
              at: s.reviewedAt,
              studentUserId: s.studentUserId,
              studentName: s.studentUser.name,
              subjectTitle: s.assignment.title,
              attendanceStatus: null,
              submissionPublicId: s.publicId,
            },
          ],
    ),
  ];

  return { variant: "MENTOR" as const, recentActivity: mergeActivity(rows, RECENT_ACTIVITY_LIMIT) };
}
