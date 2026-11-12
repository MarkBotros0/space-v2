import type { EndSeasonRequest, PassCriteria } from "@space/shared";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { ApiError } from "../api-error";
import { seasonPeopleIds } from "../auth/season-people";
import { markSessionsStale } from "../auth/session-validity";
import { deletedOnly, liveSeason, liveUser } from "../db/live";
import { passCriteriaData } from "../passing/criteria";
import { loadSeasonEndRoster } from "../queries/season-end";
import { lockPeople, lockSeason } from "../roles";
import { graduatePassed } from "../students/graduation";
import { scoreForEnd, type EndScore } from "./end-scores";

const rosterChanged = () => new ApiError("season_unfinished", "The roster changed; check the season again.", 409);

/** What End was asked: what the staff member was shown, who does not pass and why, notes on passers, the criteria. */
interface EndRequest {
  reviewed: EndSeasonRequest["reviewed"];
  /** Each student named in notPassed, with their trimmed reason. */
  reasons: Map<number, string | null>;
  /** A trimmed note on a student who passes, kept as the result's reason. */
  notes: Map<number, string | null>;
  criteria: PassCriteria;
}

/**
 * End a season in one transaction: complete it, give every ACTIVE student a
 * PASSED / NOT_PASSED result with the score End computed, graduate those who
 * passed if it is a graduating season, and mark everyone's sessions stale so the
 * finished season drops out of their scopes and a graduate's next token says
 * alumnus. The season's row is locked first, so its flag is read as End will act
 * on it, and a seat write goes in wholly before this or sees the season finished.
 * It is claimed with a conditional update, so of two concurrent Ends exactly one
 * proceeds, and the blocker check runs after the claim, on the data the claim
 * protects, as does the comparison with `reviewed`, what the staff member was shown.
 *
 * The scores are recomputed after the people are locked (`scoreForEnd`): a student's
 * own write in flight holds their User row (a quiz write FOR NO KEY UPDATE, an insert's
 * foreign key FOR KEY SHARE) and nothing End holds, so End waits for it, and a score it
 * changed is refused like any other change since the preview. The season keeps the
 * criteria (`passCriteriaSetAt` = now); each completed row its score, numbers, whether
 * the result went against the score, and who set it.
 *
 * A refusal is an ApiError thrown inside the transaction, which rolls the claim
 * and anything after it back (it replaced the route's EndRefused, step 4.6).
 */
export async function endSeasonNow(
  id: number,
  actorId: number,
  request: EndRequest,
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
      const check = await loadSeasonEndRoster(id, now, tx);
      const { submissions, quizAttempts, attendance } = check.blockers;
      if (submissions.length + quizAttempts.length + attendance.length > 0) {
        throw new ApiError("season_unfinished", "The season still has work to finish.", 409);
      }
      const activeIds = check.students.map((s) => s.userId);
      checkReviewed(request, check.graduatesOnPass, new Set(activeIds));

      // Season, people, rows: the same order as a graduation or a correction, which
      // hold the person and then write the row. A person is seated only under the
      // season's lock, so this list can't grow.
      const people = await seasonPeopleIds(tx, id);
      await lockPeople(tx, people);

      const scores = await scoreForEnd(tx, id, activeIds, request, now);
      await tx.season.update({ where: { id }, data: passCriteriaData(request.criteria, now) });
      const completed = await writeResults(tx, { seasonId: id, actorId, now }, request, scores);
      // A deleted account is neither passed nor failed: close its enrolment with no result.
      await tx.seasonEnrollment.updateMany({
        where: { seasonId: id, status: "ACTIVE", studentUser: deletedOnly },
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
      const graduated = check.graduatesOnPass ? await graduatePassed(tx, completed, year) : [];
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

/**
 * Graduating can't be undone, and everyone not named in notPassed passes: End only
 * goes ahead on the flag and the students the staff member was actually shown.
 */
function checkReviewed(request: EndRequest, graduatesOnPass: boolean, activeIds: Set<number>): void {
  const reviewedIds = new Set(request.reviewed.userIds);
  if (
    request.reviewed.graduatesOnPass !== graduatesOnPass ||
    reviewedIds.size !== activeIds.size ||
    [...activeIds].some((uid) => !reviewedIds.has(uid))
  ) {
    throw rosterChanged();
  }
  if ([...request.reasons.keys()].some((uid) => !activeIds.has(uid))) {
    throw new ApiError("bad_request", "notPassed names a student who is not active in this season.", 400);
  }
  if ([...request.notes.keys()].some((uid) => !activeIds.has(uid) || request.reasons.has(uid))) {
    throw new ApiError("bad_request", "passedNotes names a student who does not pass.", 400);
  }
}

/**
 * Each ACTIVE row gets its result, score and numbers, one row at a time (each has its own
 * score). A row no longer ACTIVE (its student left while End waited for them) is skipped.
 * Returns who passed on a row completed just now.
 */
async function writeResults(
  tx: Prisma.TransactionClient,
  at: { seasonId: number; actorId: number; now: Date },
  request: EndRequest,
  scores: Map<number, EndScore>,
): Promise<number[]> {
  const passed: number[] = [];
  for (const [uid, { score, numbers, meets }] of scores) {
    const passes = !request.reasons.has(uid);
    const written = await tx.seasonEnrollment.updateMany({
      where: { seasonId: at.seasonId, status: "ACTIVE", studentUserId: uid },
      data: {
        status: "COMPLETED",
        completedAt: at.now,
        resultSetAt: at.now,
        resultSetById: at.actorId,
        result: passes ? "PASSED" : "NOT_PASSED",
        resultReason: (passes ? request.notes.get(uid) : request.reasons.get(uid)) ?? null,
        passScore: score,
        passNumbers: numbers,
        resultAgainstScore: meets !== null && passes !== meets,
      },
    });
    if (passes && written.count > 0) passed.push(uid);
  }
  return passed;
}
