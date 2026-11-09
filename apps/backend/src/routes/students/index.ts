import { Router } from "express";

import { requireAuth } from "../../middleware/require-auth";
import { createEnrollment, restoreEnrollment, updateEnrollment } from "./enrollments";
import { resendStudentInvite } from "./invite";
import { deleteStudent, graduateStudent } from "./lifecycle";
import { createStudent, updateStudent } from "./profile";
import { getStudent, getStudentAttendance, getStudentList, getStudentSubmissions } from "./reads";

/**
 * Students: the role-scoped list and detail, the two history sub-resources,
 * profile writes, enrollments, graduation, invite re-sends and soft delete. This file is the
 * route table, in registration order; handlers live beside it.
 */
export const studentsRouter = Router();

studentsRouter.use(requireAuth);

studentsRouter.get("/", getStudentList);
studentsRouter.get("/:id", getStudent);
studentsRouter.get("/:id/attendance", getStudentAttendance);
studentsRouter.get("/:id/submissions", getStudentSubmissions);
studentsRouter.post("/", createStudent);
studentsRouter.patch("/:id", updateStudent);
studentsRouter.post("/:id/enrollments", createEnrollment);
studentsRouter.patch("/:id/enrollments/:seasonId", updateEnrollment);
studentsRouter.post("/:id/enrollments/:seasonId/restore", restoreEnrollment);
studentsRouter.post("/:id/graduate", graduateStudent);
studentsRouter.post("/:id/invite", resendStudentInvite);
studentsRouter.delete("/:id", deleteStudent);
