import { Router, type Request, type Response } from "express";

import { db } from "../db/client";
import { apiOk, apiError, forbidden } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
import { canAccessGroup } from "../lib/permissions";
import { listMyGroups, loadGroupImpact } from "../lib/queries/groups";
import { validateGroupWrite } from "../lib/groups/membership";
import { deleteGroup, updateGroup } from "../lib/groups/writes";
import { seasonParticipant } from "../lib/queries/season-participants";
import { isAdminOfSeason } from "../lib/rbac";
import { groupUpdateRequestSchema } from "../../../../packages/shared/src/index";
import { requireAuth, requireUser } from "../middleware/require-auth";
import { idParam } from "../lib/http/params";
import { notFound } from "../lib/http/not-found";
import { parseOr400 } from "../lib/http/validate";
import { liveUser } from "../lib/db/live";

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
  const id = idParam(res, req.params.id, "group");
  if (id === null) return;

  const group = await db.group.findUnique({ where: { id }, select: { seasonId: true } });
  if (!group) return notFound(res, "Group");

  if (!isAdminOfSeason(user, group.seasonId)) return forbidden(res);

  const parsed = parseOr400(groupUpdateRequestSchema, req.body, res, "Invalid group body.");
  if (parsed === null) return;

  const { studentIds } = parsed;
  const refusal = await validateGroupWrite(group.seasonId, { name: parsed.name, studentIds: studentIds ?? [] }, id);
  if (refusal) return apiError(res, refusal.code, refusal.message, 409);

  await updateGroup(id, group.seasonId, parsed);

  return apiOk(res, { id });
});

groupsRouter.get("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "group");
  if (id === null) return;

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
        where: { ...seasonParticipant, studentUser: liveUser },
        select: {
          seasonId: true,
          studentUser: { select: { id: true, name: true, email: true } },
        },
        orderBy: { studentUser: { name: "asc" } },
      },
    },
  });
  if (!group) return notFound(res, "Group");

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
    notFound(res, "Group");
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

  const orphanedStudentIds = await deleteGroup(id);
  return apiOk(res, { deleted: true, orphanedStudentIds });
});
