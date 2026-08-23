import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
import { canAccessGroup } from "../lib/permissions";
import { listMyGroups, setGroupStudents, validateGroupWrite } from "../lib/queries/groups";
import { isAdminOfSeason } from "../lib/rbac";
import { groupWriteRequestSchema } from "../../../../packages/shared/src/index";
import { requireAuth, requireUser } from "../middleware/require-auth";

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

  if (!isAdminOfSeason(user, group.seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const parsed = groupWriteRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid group body.", 400);

  const refusal = await validateGroupWrite(group.seasonId, parsed.data, id);
  if (refusal) return apiError(res, refusal.code, refusal.message, 409);

  await db.$transaction(async (tx) => {
    await tx.group.update({
      where: { id },
      data: { name: parsed.data.name, description: parsed.data.description ?? null },
    });
    await tx.groupLeader.deleteMany({
      where: { groupId: id, userId: { notIn: parsed.data.leaderIds } },
    });
    if (parsed.data.leaderIds.length > 0) {
      await tx.groupLeader.createMany({
        data: parsed.data.leaderIds.map((userId) => ({ groupId: id, userId })),
        skipDuplicates: true,
      });
    }
    await setGroupStudents(tx, group.seasonId, id, parsed.data.studentIds);
  });

  return apiOk(res, { id });
});

groupsRouter.get("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid group id.", 400);

  if (!(await canAccessGroup(user, id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

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
      students: {
        select: { studentUser: { select: { id: true, name: true, email: true } } },
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
    students: group.students.map((s) => member(s.studentUser)),
  });
});
