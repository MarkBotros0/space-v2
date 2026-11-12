import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiError, apiOk, forbidden } from "../../lib/api-response";
import type { SessionUser } from "../../lib/auth/tokens";
import { canViewStudent, pickScoredEnrollment } from "../../lib/permissions";
import { loadStudentProgress } from "../../lib/passing/student-progress";
import { findLiveSeason } from "../../lib/queries/seasons";
import { parseId } from "../../lib/parse-id";
import {
  listStudents,
  loadStudentAttendanceHistory,
  loadStudentDetail,
  loadStudentSubmissions,
  type StudentDetailView,
} from "../../lib/queries/students";
import { isMentor, isSuper } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import { studentListQuerySchema } from "../../../../../packages/shared/src/index";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { parseOr400 } from "../../lib/http/validate";
import { liveUser } from "../../lib/db/live";

/**
 * One endpoint, three list surfaces: ?status=active|alumni|dropped. This is
 * also why no /students/alumni literal route exists to be shadowed by (or to
 * shadow) "/:id". Scope is per-role (spec 06 §4.1); dropped rows are
 * enrollment-keyed (R43).
 */
export async function getStudentList(req: Request, res: Response) {
  const user = requireUser(req);
  const parsed = parseOr400(studentListQuerySchema, req.query, res, "Invalid query.");
  if (parsed === null) return;
  // A mentor's filter (owner, 2026-11-07): no other role has a caller for it.
  if (parsed.absentLately && user.role !== "MENTOR") return forbidden(res);

  const result = await listStudents(user, parsed);
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
  const id = idParam(res, req.params.id, "student");
  if (id === null) return;

  // The gate lives in the handler, not in a call-site convention (R70/C8).
  if (!(await canViewStudent(user, id))) return forbidden(res);

  const detail = await loadStudentDetail(id, detailViewFor(user, id), user);
  if (!detail) return notFound(res, "Student");
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
  const id = idParam(res, req.params.id, "student");
  if (id === null) return null;
  if (user.role === "STUDENT" || !(await canViewStudent(user, id))) {
    forbidden(res);
    return null;
  }
  const exists = await db.user.findFirst({
    where: { id, role: "STUDENT", ...liveUser },
    select: { id: true },
  });
  if (!exists) {
    notFound(res, "Student");
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

/**
 * A student's season progress, for staff (season passing): the three numbers, their assignments and
 * their quizzes. The season is picked and gated as the engagement card's (`pickScoredEnrollment`,
 * `?seasonId`); a student gets 403, their own record included, and so does a mentor, who sees nothing
 * season-shaped (docs/rules/mentor.md). No season to score, or a withdrawn enrolment: 404 `no_season`.
 */
export async function getStudentProgress(req: Request, res: Response) {
  const target = await resolveHistoryTarget(req, res);
  if (!target) return;
  if (isMentor(target.user)) return forbidden(res);
  const requested = parseId(typeof req.query.seasonId === "string" ? req.query.seasonId : undefined);
  const picked = await pickScoredEnrollment(target.user, target.id, requested);
  if (picked === "forbidden") return forbidden(res);
  const season =
    picked === "no_season" ? null : await findLiveSeason(picked.seasonId, { id: true, title: true, status: true });
  const progress = season ? await loadStudentProgress(target.user, season, target.id) : null;
  if (!progress) return apiError(res, "no_season", "This student has no season to score.", 404);
  return apiOk(res, progress);
}
