import { Router, type Request, type Response } from "express";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { markSessionsStale } from "../lib/auth/session-validity";
import { parseId } from "../lib/parse-id";
import { canAccessGroup } from "../lib/permissions";
import {
  applyLeaderChange,
  listMyGroups,
  loadGroupImpact,
  planLeaderChange,
  setGroupStudents,
  validateGroupWrite,
} from "../lib/queries/groups";
import { seasonParticipant } from "../lib/queries/season-participants";
import { isAdminOfAnySeason, isAdminOfSeason } from "../lib/rbac";
import { freeAlumni, lockPeople, lockSeason, refusalStatus } from "../lib/roles";
import { groupUpdateRequestSchema } from "../../../../packages/shared/src/index";
import { requireAuth, requireUser } from "../middleware/require-auth";
import { forbidden } from "./respond";

export const groupsRouter = Router();

groupsRouter.use(requireAuth);

/**
 * The groups this caller is personally in, across every season.
 *
 * `packages/shared/src/navigation.ts` gives LEADER a `/groups` tab as their
 * first tab, and until now nothing could serve it: v1 answered this with a
 * query written inside the page, one of five group reads that never reached its
 * REST layer. Registered before "/:id" — a single-segment literal would
 * otherwise be shadowed by the parameter route.
 */
groupsRouter.get("/", async (req, res) => {
  const user = requireUser(req);
  const groups = await listMyGroups(user);
  return apiOk(res, { groups });
});

/**
 * Edit a group: its name, description, leaders and roster.
 *
 * Season-admin power. Leading a group does not confer the right to change who
 * else leads it — that would let a leader add themselves to another group's
 * leadership, and a GroupLeader row is a claim in the token.
 */
groupsRouter.patch("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid group id.", 400);

  const group = await db.group.findUnique({ where: { id }, select: { seasonId: true } });
  if (!group) return apiError(res, "not_found", "Group not found.", 404);

  if (!isAdminOfSeason(user, group.seasonId)) return forbidden(res);

  const parsed = groupUpdateRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid group body.", 400);

  const { leaderIds, studentIds } = parsed.data;
  const refusal = await validateGroupWrite(
    group.seasonId,
    { name: parsed.data.name, studentIds: studentIds ?? [] },
    id,
  );
  if (refusal) return apiError(res, refusal.code, refusal.message, 409);

  const seatRefusal = await db.$transaction(async (tx) => {
    let change = null;
    if (leaderIds !== undefined) {
      const plan = await planLeaderChange(tx, group.seasonId, id, leaderIds);
      if (plan.refusal) return plan.refusal;
      change = plan.change;
    }
    await tx.group.update({
      where: { id },
      // Absent keeps it, null clears it: `PATCH { name }` is a rename.
      data: { name: parsed.data.name, description: parsed.data.description },
    });
    if (change) await applyLeaderChange(tx, id, change);
    if (studentIds !== undefined) await setGroupStudents(tx, group.seasonId, id, studentIds);
    return null;
  });
  if (seatRefusal) return apiError(res, seatRefusal.code, seatRefusal.message, refusalStatus(seatRefusal));

  return apiOk(res, { id });
});

/**
 * Leader picker for the group form, until the form moves to
 * GET /seasons/:id/staff-candidates and this goes.
 */
groupsRouter.get("/leader-options", async (req, res) => {
  const user = requireUser(req);
  if (!isAdminOfAnySeason(user)) return forbidden(res);
  const leaders = await db.user.findMany({
    where: freeAlumni,
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
  return apiOk(res, { leaders });
});

groupsRouter.get("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid group id.", 400);

  if (!(await canAccessGroup(user, id))) return forbidden(res);

  const group = await db.group.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      seasonId: true,
      season: { select: { code: true, title: true } },
      leaders: {
        select: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { user: { name: "asc" } },
      },
      // Members per SeasonEnrollment.groupId (ruling C9), never GroupStudent:
      // while that table was global (before Plan 18 M1), a past season's
      // group lost its members the moment they moved on.
      seasonEnrollments: {
        where: { ...seasonParticipant, studentUser: { deletedAt: null } },
        select: {
          seasonId: true,
          studentUser: { select: { id: true, name: true, email: true } },
        },
        orderBy: { studentUser: { name: "asc" } },
      },
    },
  });
  if (!group) return apiError(res, "not_found", "Group not found.", 404);

  // canAccessGroup admits a student to their own group, which is the right
  // call — they should be able to see who is in it. But the payload below is
  // v1's *staff* shape, and v1 never showed it to a student: their own group
  // card came from a separate query that selected no addresses. Withhold the
  // email rather than the whole endpoint, so the student view keeps working.
  const withEmail = user.role !== "STUDENT";
  const member = (u: { id: number; name: string | null; email: string }) =>
    withEmail ? u : { id: u.id, name: u.name };

  return apiOk(res, {
    id: group.id,
    name: group.name,
    description: group.description,
    seasonId: group.seasonId,
    seasonCode: group.season.code,
    seasonTitle: group.season.title,
    leaders: group.leaders.map((l) => member(l.user)),
    students: group.seasonEnrollments
      // A group belongs to one season; an enrolment of another season that
      // points at it is not a member of it.
      .filter((e) => e.seasonId === group.seasonId)
      .map((e) => member(e.studentUser)),
    canManage: isAdminOfSeason(user, group.seasonId),
  });
});

async function loadManagedGroup(req: Request, res: Response): Promise<number | null> {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) {
    apiError(res, "bad_request", "Invalid group id.", 400);
    return null;
  }
  const group = await db.group.findUnique({ where: { id }, select: { seasonId: true } });
  if (!group) {
    apiError(res, "not_found", "Group not found.", 404);
    return null;
  }
  if (!isAdminOfSeason(user, group.seasonId)) {
    forbidden(res);
    return null;
  }
  return id;
}

groupsRouter.get("/:id/impact", async (req, res) => {
  const id = await loadManagedGroup(req, res);
  if (id === null) return;
  return apiOk(res, await loadGroupImpact(id));
});

class GroupHasSoleTargetsError extends Error {
  constructor(readonly count: number) {
    super("group has sole-target assignments");
  }
}

/**
 * Delete a group — designed, not ported (ruling C12: v1's deleteGroupAction
 * has no caller, spec 05 R46). Refuses while any live assignment targets
 * only this group (R44 — it would become visible to nobody). Otherwise, in
 * one interactive transaction that RE-CHECKS that condition: leaders,
 * memberships and target rows go; every SeasonEnrollment pointing at the
 * group loses the pointer (all seasons — R43's FK SetNull made explicit);
 * the group is hard-deleted (Group has no deletedAt).
 */
groupsRouter.delete("/:id", async (req, res) => {
  const id = await loadManagedGroup(req, res);
  if (id === null) return;

  try {
    const orphanedStudentIds = await db.$transaction(async (tx) => {
      const { seasonId } = await tx.group.findUniqueOrThrow({ where: { id }, select: { seasonId: true } });
      await lockSeason(tx, seasonId, "share");
      const sole = await tx.assignment.findMany({
        where: { deletedAt: null, isAllGroups: false, targets: { some: { groupId: id } } },
        select: { _count: { select: { targets: true } } },
      });
      const soleCount = sole.filter((a) => a._count.targets === 1).length;
      if (soleCount > 0) throw new GroupHasSoleTargetsError(soleCount);

      const orphaned = await tx.seasonEnrollment.findMany({ where: { groupId: id }, select: { studentUserId: true } });
      const leaders = (await tx.groupLeader.findMany({ where: { groupId: id }, select: { userId: true } })).map(
        (l) => l.userId,
      );
      await lockPeople(tx, leaders);
      await tx.groupLeader.deleteMany({ where: { groupId: id } });
      await markSessionsStale(tx, leaders);
      await tx.groupStudent.deleteMany({ where: { groupId: id } });
      await tx.seasonEnrollment.updateMany({ where: { groupId: id }, data: { groupId: null } });
      await tx.assignmentTarget.deleteMany({ where: { groupId: id } });
      await tx.group.delete({ where: { id } });
      return orphaned.map((o) => o.studentUserId);
    });
    return apiOk(res, { deleted: true, orphanedStudentIds });
  } catch (err) {
    if (err instanceof GroupHasSoleTargetsError) {
      return apiError(
        res,
        "group_has_sole_targets",
        `${err.count} assignment(s) target only this group. Retarget them before deleting it.`,
        409,
      );
    }
    throw err;
  }
});
