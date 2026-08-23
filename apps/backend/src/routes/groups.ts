import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
import { canAccessGroup } from "../lib/permissions";
import { requireAuth, requireUser } from "../middleware/require-auth";

export const groupsRouter = Router();

groupsRouter.use(requireAuth);

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
