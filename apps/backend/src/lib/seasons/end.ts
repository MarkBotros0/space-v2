import type { EndSeasonRequest } from "@space/shared";

import { db } from "../../db/client";
import { ApiError } from "../api-error";
import { seasonPeopleIds } from "../auth/season-people";
import { markSessionsStale } from "../auth/session-validity";
import { liveSeason, liveUser } from "../db/live";
import { loadSeasonEndCheck } from "../queries/season-end";
import { lockPeople, lockSeason } from "../roles";
import { graduatePassed } from "../students/graduation";

const rosterChanged = () => new ApiError("season_unfinished", "The roster changed; check the season again.", 409);

/**
 * End a season in one transaction: complete it, give every ACTIVE student a
 * PASSED / NOT_PASSED result, graduate those who passed if it is a graduating
 * season, and mark everyone's sessions stale so the finished season drops out of
 * their scopes and a graduate's next token says alumnus. The season's row is
 * locked first, so its flag is read as End will act on it, and a seat
 * write goes in wholly before this or sees the season finished. It is claimed
 * with a conditional update, so of two concurrent Ends exactly one proceeds, and
 * the blocker check runs after the claim, on the data the claim protects, as does
 * the comparison with `reviewed`, what the staff member was shown.
 *
 * A refusal is an ApiError thrown inside the transaction, which rolls the claim
 * and anything after it back (it replaced the route's EndRefused, step 4.6).
 * `reasons` maps each student named in notPassed to their trimmed reason.
 */
export async function endSeasonNow(
  id: number,
  actorId: number,
  reviewed: EndSeasonRequest["reviewed"],
  reasons: Map<number, string | null>,
  year: number,
  now: Date,
): Promise<{ season: { id: number; code: string; status: string }; graduated: number[] }> {
  return db.$transaction(
    async (tx) => {
      await lockSeason(tx, id, "update");
      const claimed = await tx.season.updateMany({
        where: { id, status: "ACTIVE", ...liveSeason },
        data: { status: "COMPLETED", updatedById: actorId },
      });
      if (claimed.count === 0) {
        throw new ApiError("season_not_active", "Only an active season can be ended.", 409);
      }
      const check = await loadSeasonEndCheck(id, now, tx);
      const { submissions, quizAttempts, attendance } = check.blockers;
      if (submissions.length + quizAttempts.length + attendance.length > 0) {
        throw new ApiError("season_unfinished", "The season still has work to finish.", 409);
      }
      const activeIds = new Set(check.students.map((s) => s.userId));
      // Graduating can't be undone, and everyone not named in notPassed passes:
      // End only goes ahead on what the staff member was actually shown.
      const reviewedIds = new Set(reviewed.userIds);
      if (
        reviewed.graduatesOnPass !== check.graduatesOnPass ||
        reviewedIds.size !== activeIds.size ||
        [...activeIds].some((uid) => !reviewedIds.has(uid))
      ) {
        throw rosterChanged();
      }
      if ([...reasons.keys()].some((uid) => !activeIds.has(uid))) {
        throw new ApiError("bad_request", "notPassed names a student who is not active in this season.", 400);
      }

      // Season, people, rows: the same order as a graduation or a correction, which
      // hold the person and then write the row. A person is seated only under the
      // season's lock, so this list can't grow.
      const people = await seasonPeopleIds(tx, id);
      await lockPeople(tx, people);

      const passedIds = [...activeIds].filter((uid) => !reasons.has(uid));
      const stamp = { status: "COMPLETED" as const, completedAt: now, resultSetAt: now };
      const completed = await tx.seasonEnrollment.updateManyAndReturn({
        where: { seasonId: id, status: "ACTIVE", studentUserId: { in: passedIds } },
        data: { ...stamp, result: "PASSED", resultReason: null },
        select: { studentUserId: true },
      });
      for (const [uid, reason] of reasons) {
        await tx.seasonEnrollment.updateMany({
          where: { seasonId: id, status: "ACTIVE", studentUserId: uid },
          data: { ...stamp, result: "NOT_PASSED", resultReason: reason },
        });
      }
      // A deleted account is neither passed nor failed: close its enrolment with no result.
      await tx.seasonEnrollment.updateMany({
        where: { seasonId: id, status: "ACTIVE", studentUser: { deletedAt: { not: null } } },
        data: { status: "COMPLETED", completedAt: now },
      });
      // A live student enrolled between the check and here was never reviewed: refuse.
      const unreviewed = await tx.seasonEnrollment.count({
        where: { seasonId: id, status: "ACTIVE", studentUser: liveUser },
      });
      if (unreviewed > 0) {
        throw rosterChanged();
      }
      // Only those whose row was completed just now: someone who left it while End
      // waited for them didn't pass. Under the people's locks, since a seat write
      // elsewhere reads graduationYear under them.
      const graduated = check.graduatesOnPass
        ? await graduatePassed(
            tx,
            completed.map((c) => c.studentUserId),
            year,
          )
        : [];
      // Stamped now, not at the transaction's start: a token refreshed after that
      // start still carries the old grants and must fall before the cut-off.
      await markSessionsStale(tx, people, new Date());
      const row = await tx.season.findUniqueOrThrow({
        where: { id },
        select: { id: true, code: true, status: true },
      });
      return { season: row, graduated };
    },
    { timeout: 30_000 },
  );
}
