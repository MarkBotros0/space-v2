import type { Request, Response } from "express";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { apiOk, apiError } from "../../lib/api-response";
import { auditLog } from "../../lib/audit";
import { parseId } from "../../lib/parse-id";
import { graduatePerson } from "../../lib/queries/students/writes";
import { isSuper } from "../../lib/rbac";
import { isSeasonFinished, lockPeople, readSeatSeason, refusalStatus, type SeatRefusal } from "../../lib/roles";
import { requireUser } from "../../middleware/require-auth";
// Value import: relative path is mandatory here (CLAUDE.md's rootDir emit trap).
import { graduateSeasonRequestSchema } from "../../../../../packages/shared/src/index";

/** Why each of these people can't graduate from this season, in the order asked for. */
async function refusalsFor(
  tx: Prisma.TransactionClient,
  seasonId: number,
  userIds: number[],
): Promise<string[]> {
  const people = await tx.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, role: true, graduationYear: true, deletedAt: true },
  });
  const rows = await tx.seasonEnrollment.findMany({
    where: { seasonId, studentUserId: { in: userIds } },
    select: { studentUserId: true, status: true },
  });
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const statusById = new Map(rows.map((r) => [r.studentUserId, r.status]));

  return userIds.flatMap((id) => {
    const person = peopleById.get(id);
    if (!person) return ["Someone in this list wasn't found"];
    if (person.deletedAt || person.role !== "STUDENT") return [`${person.name} can't graduate`];
    if (person.graduationYear !== null) return [`${person.name} has already graduated`];
    const status = statusById.get(id);
    if (!status) return [`${person.name} wasn't in this season`];
    if (status === "WITHDRAWN") return [`${person.name} was dropped from this season`];
    return [];
  });
}

/** `"Mina wasn't in this season, and 2 others can't graduate"` */
function batchMessage(reasons: string[]): string {
  const rest = reasons.length - 1;
  if (rest === 0) return reasons[0]!;
  return `${reasons[0]!}, and ${rest} ${rest === 1 ? "other" : "others"} can't graduate`;
}

/**
 * `POST /seasons/:id/graduate`: SUPER only, from a finished season's list, all or
 * nothing. A finished season keeps every seat as it is: only `graduatePerson`'s
 * writes happen, and those touch a live enrolment elsewhere, not this season's
 * ended rows. A dropped person's row doesn't count as having been in the season.
 * Each person takes four statements, hence the longer timeout and the body's cap.
 */
export async function graduateSeasonPeople(req: Request, res: Response) {
  const user = requireUser(req);
  if (!isSuper(user)) return apiError(res, "forbidden", "Only a super admin can graduate people.", 403);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  const parsed = graduateSeasonRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", parsed.error.issues[0]?.message ?? "Invalid graduation body.", 400);
  }
  const { userIds, graduationYear } = parsed.data;

  const refusal = await db.$transaction(
    async (tx): Promise<SeatRefusal | null> => {
      const season = await readSeatSeason(tx, seasonId);
      if (!season) return { code: "not_found", message: "Season not found." };
      if (!isSeasonFinished(season)) {
        return { code: "season_not_finished", message: "Only people from a finished season can be graduated together." };
      }
      await lockPeople(tx, userIds);
      const reasons = await refusalsFor(tx, seasonId, userIds);
      if (reasons.length > 0) return { code: "people_unavailable", message: batchMessage(reasons) };
      for (const id of userIds) {
        // Checked under the lock above, and every graduation takes that lock.
        const outcome = await graduatePerson(tx, id, graduationYear);
        if (typeof outcome === "string") throw new Error(`Graduation lost its check: ${outcome}`);
      }
      return null;
    },
    { timeout: 60_000 },
  );
  if (refusal) return apiError(res, refusal.code, refusal.message, refusalStatus(refusal));

  for (const id of userIds) auditLog("student.graduate", user.userId, id, { season: seasonId });
  return apiOk(res, { graduated: userIds, graduationYear });
}
