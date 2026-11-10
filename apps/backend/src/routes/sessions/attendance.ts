import type { Request, Response } from "express";

import { db } from "../../db/client";
import { AttendanceStatus } from "../../generated/prisma/enums";
import { apiOk, apiError, forbidden } from "../../lib/api-response";
import { saveAttendanceEntries } from "../../lib/sessions/attendance-save";
import { flagLowAttendance } from "../../lib/attendance-notifications";
import { bestEffort } from "../../lib/best-effort";
import { attendanceScopeFor } from "../../lib/permissions";
import { loadAttendanceRoster } from "../../lib/queries/sessions";
import { requireUser } from "../../middleware/require-auth";
import { saveAttendanceRequestSchema } from "../../../../../packages/shared/src/index";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { parseOr400 } from "../../lib/http/validate";

export async function getAttendance(req: Request, res: Response) {
  const user = requireUser(req);
  const sessionId = idParam(res, req.params.id, "session");
  if (sessionId === null) return;

  // attendanceScopeFor, not canAccessSeason: the roster carries every enrolled
  // student's name and email, so reading it is staff-only — and a leader sees
  // only their own groups, which is what the scope narrows.
  const scope = await attendanceScopeFor(user, sessionId);
  if (scope === null) return forbidden(res);

  const roster = await loadAttendanceRoster(sessionId, scope.kind === "groups" ? scope.groupIds : undefined);
  if (roster === null) return notFound(res, "Session");

  return apiOk(res, { roster });
}

export async function saveAttendance(req: Request, res: Response) {
  const user = requireUser(req);
  const sessionId = idParam(res, req.params.id, "session");
  if (sessionId === null) return;

  const scope = await attendanceScopeFor(user, sessionId);
  if (scope === null) return forbidden(res);

  const parsed = parseOr400(saveAttendanceRequestSchema, req.body, res, "Invalid attendance entries.");
  if (parsed === null) return;

  // Narrowing the roster on the read only hides the other students; without
  // this, a leader who knows a studentUserId can still write that student's
  // attendance. Membership resolves through SeasonEnrollment.groupId, the
  // authority (ruling C9), not its GroupStudent mirror.
  //
  // The season scope (admin, SUPER) is checked too: without it an admin's
  // save accepted any user id at all — a student of another season, a
  // leader — and wrote an attendance row for them.
  let seasonId: number;
  if (scope.kind === "groups") {
    seasonId = scope.seasonId;
  } else {
    const session = await db.session.findUnique({
      where: { id: sessionId },
      select: { seasonId: true },
    });
    if (!session) return notFound(res, "Session");
    seasonId = session.seasonId;
  }
  const submittedIds = [...new Set(parsed.entries.map((e) => e.studentUserId))];
  const inScope = await db.seasonEnrollment.findMany({
    where: {
      seasonId,
      studentUserId: { in: submittedIds },
      ...(scope.kind === "groups" ? { groupId: { in: scope.groupIds } } : {}),
    },
    select: { studentUserId: true },
  });
  if (inScope.length !== submittedIds.length) {
    return scope.kind === "groups"
      ? apiError(res, "forbidden", "You don't lead all of those students.", 403)
      : apiError(res, "not_enrolled", "Every student must be enrolled in this session's season.", 400);
  }

  // What each row said before this save, so the low-attendance alert fires
  // only on a change TO absent — re-saving an unchanged roster must not
  // notify everyone again.
  const before = await db.attendance.findMany({
    where: { sessionId, studentUserId: { in: submittedIds } },
    select: { studentUserId: true, status: true },
  });
  const previousStatus = new Map(before.map((a) => [a.studentUserId, a.status]));

  await saveAttendanceEntries(sessionId, parsed.entries, user.userId);

  // The attendance rows are committed. A notification failure after that point
  // must not tell the leader their marking failed (spec D6).
  const newlyAbsent = parsed.entries.filter(
    (e) => e.status === AttendanceStatus.ABSENT && previousStatus.get(e.studentUserId) !== AttendanceStatus.ABSENT,
  );
  if (newlyAbsent.length > 0) {
    await bestEffort("notify:LOW_ATTENDANCE_FLAG", () => flagLowAttendance(sessionId, newlyAbsent));
  }

  return apiOk(res, { saved: parsed.entries.length });
}
