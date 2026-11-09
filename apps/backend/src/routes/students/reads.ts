import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import type { SessionUser } from "../../lib/auth/tokens";
import { parseId } from "../../lib/parse-id";
import { canViewStudent } from "../../lib/permissions";
import {
  listStudents,
  loadStudentAttendanceHistory,
  loadStudentDetail,
  loadStudentSubmissions,
  type StudentDetailView,
} from "../../lib/queries/students";
import { isSuper } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import { studentListQuerySchema } from "../../../../../packages/shared/src/index";
import { forbidden } from "../respond";

/**
 * One endpoint, three list surfaces: ?status=active|alumni|dropped. This is
 * also why no /students/alumni literal route exists to be shadowed by (or to
 * shadow) "/:id". Scope is per-role (spec 06 §4.1); dropped rows are
 * enrollment-keyed (R43).
 */
export async function getStudentList(req: Request, res: Response) {
  const user = requireUser(req);
  const parsed = studentListQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid query.", 400);
  // A mentor's filter (owner, 2026-11-07): no other role has a caller for it.
  if (parsed.data.absentLately && user.role !== "MENTOR") return forbidden(res);

  const result = await listStudents(user, parsed.data);
  if (result === null) return forbidden(res);
  return apiOk(res, result);
}

/**
 * Which of the three §4.2 shapes this caller receives. SUPER and ADMIN read
 * everything; the subject reads their own personal data but never the
 * staff-only internal notes (R23), and a former student serving as an admin is
 * still the subject of their own record; MENTOR and LEADER get the narrow cut —
 * v1 delivered them the full object and relied on React props to not render
 * it (§4.2's LEADER column), which an endpoint cannot do.
 */
function detailViewFor(user: SessionUser, studentUserId: number): StudentDetailView {
  if (isSuper(user)) return "internal";
  if (user.userId === studentUserId) return "private";
  return user.role === "ADMIN" ? "internal" : "public";
}

export async function getStudent(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid student id.", 400);

  // The gate lives in the handler, not in a call-site convention (R70/C8).
  if (!(await canViewStudent(user, id))) return forbidden(res);

  const detail = await loadStudentDetail(id, detailViewFor(user, id), user);
  if (!detail) return apiError(res, "not_found", "Student not found.", 404);
  return apiOk(res, detail);
}

/**
 * The two history sub-resources (REG-83, v1's student record). Staff only — a
 * student gets neither, their own record included — and row-scoped by the same
 * rule as the detail's enrolments plus the narrower submission/attendance
 * gates (see canReadEnrollmentHistory). 403 before 404, as the detail does, so
 * an out-of-scope id and a missing one look the same to a scoped caller.
 */
async function resolveHistoryTarget(req: Request, res: Response): Promise<{ user: SessionUser; id: number } | null> {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) {
    apiError(res, "bad_request", "Invalid student id.", 400);
    return null;
  }
  if (user.role === "STUDENT" || !(await canViewStudent(user, id))) {
    forbidden(res);
    return null;
  }
  const exists = await db.user.findFirst({
    where: { id, role: "STUDENT", deletedAt: null },
    select: { id: true },
  });
  if (!exists) {
    apiError(res, "not_found", "Student not found.", 404);
    return null;
  }
  return { user, id };
}

export async function getStudentAttendance(req: Request, res: Response) {
  const target = await resolveHistoryTarget(req, res);
  if (!target) return;
  return apiOk(res, { history: await loadStudentAttendanceHistory(target.user, target.id) });
}

export async function getStudentSubmissions(req: Request, res: Response) {
  const target = await resolveHistoryTarget(req, res);
  if (!target) return;
  return apiOk(res, { submissions: await loadStudentSubmissions(target.user, target.id) });
}
