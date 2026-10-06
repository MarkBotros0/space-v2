import { Router } from "express";

import { apiOk, apiError } from "../lib/api-response";
import type { SessionUser } from "../lib/auth/tokens";
import { parseId } from "../lib/parse-id";
import { canViewStudent } from "../lib/permissions";
import { listStudents, loadStudentDetail, type StudentDetailView } from "../lib/queries/students";
import { isSuper } from "../lib/rbac";
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

/**
 * Which of the three §4.2 shapes this caller receives. SUPER and ADMIN read
 * everything; the subject reads their own personal data but never the
 * staff-only internal notes (R23); MENTOR and LEADER get the narrow cut —
 * v1 delivered them the full object and relied on React props to not render
 * it (§4.2's LEADER column), which an endpoint cannot do.
 */
function detailViewFor(user: SessionUser, studentUserId: number): StudentDetailView {
  if (isSuper(user) || user.role === "ADMIN") return "internal";
  if (user.userId === studentUserId) return "private";
  return "public";
}

studentsRouter.get("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid student id.", 400);

  // The gate lives in the handler, not in a call-site convention (R70/C8).
  if (!(await canViewStudent(user, id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const detail = await loadStudentDetail(id, detailViewFor(user, id), user);
  if (!detail) return apiError(res, "not_found", "Student not found.", 404);
  return apiOk(res, detail);
});
