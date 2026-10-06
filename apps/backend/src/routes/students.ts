import { Router } from "express";

import { apiOk, apiError } from "../lib/api-response";
import { listStudents } from "../lib/queries/students";
import { studentListQuerySchema } from "../../../../packages/shared/src/index";
import { requireAuth, requireUser } from "../middleware/require-auth";

export const studentsRouter = Router();

studentsRouter.use(requireAuth);

/**
 * One endpoint, three list surfaces: ?status=active|alumni|dropped. This is
 * also why no /students/alumni literal route exists to be shadowed by (or to
 * shadow) "/:id". Scope is per-role (spec 06 §4.1); dropped rows are
 * enrollment-keyed (R43).
 */
studentsRouter.get("/", async (req, res) => {
  const user = requireUser(req);
  const parsed = studentListQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid query.", 400);

  const result = await listStudents(user, parsed.data);
  if (result === null) return apiError(res, "forbidden", "You don't have access to this.", 403);
  return apiOk(res, result);
});
