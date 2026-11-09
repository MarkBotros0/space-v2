import { Router } from "express";

import { requireAuth } from "../../middleware/require-auth";
import { getAttendance, saveAttendance } from "./attendance";
import { closeCheckIn, getCheckIn, openCheckIn, regenerateCheckIn, studentCheckIn } from "./check-in";
import { getSession, listSessionQuizzes, listSessions } from "./reads";
import { createSession, deleteSession, previewSeries, updateSession } from "./schedule";

/**
 * Sessions: the calendar and detail reads, scheduling writes (single and
 * recurring series), the attendance roster, and the check-in console. This
 * file is the route table, in registration order; handlers live beside it.
 */
export const sessionsRouter = Router();

sessionsRouter.use(requireAuth);

// Registered first: "/check-in" is a single-segment literal and would be
// shadowed by any single-segment parameter route (a future POST "/:id") that
// was registered ahead of it. Keep it at the top.
sessionsRouter.post("/check-in", studentCheckIn);

sessionsRouter.post("/", createSession);
sessionsRouter.get("/", listSessions);
sessionsRouter.get("/:id", getSession);
sessionsRouter.patch("/:id", updateSession);
sessionsRouter.delete("/:id", deleteSession);

sessionsRouter.get("/:id/attendance", getAttendance);
sessionsRouter.post("/:id/attendance", saveAttendance);

sessionsRouter.post("/:id/check-in-open", openCheckIn);
sessionsRouter.post("/:id/check-in-close", closeCheckIn);
sessionsRouter.get("/:id/series", previewSeries);
sessionsRouter.get("/:id/check-in", getCheckIn);
sessionsRouter.post("/:id/check-in-regenerate", regenerateCheckIn);
sessionsRouter.get("/:id/quizzes", listSessionQuizzes);
