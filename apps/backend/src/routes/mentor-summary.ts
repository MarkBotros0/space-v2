import { Router } from "express";

import { db } from "../db/client";
import { apiOk, forbidden } from "../lib/api-response";
import { countDueFollowUps } from "../lib/follow-ups";
import { noteVisibilityWhere } from "../lib/permissions";
import { writtenWithin } from "../lib/queries/notes";
import { listStudents } from "../lib/queries/students";
import { requireAuth, requireUser } from "../middleware/require-auth";
import { studentListQuerySchema, type MentorSummary } from "../../../../packages/shared/src/index";

/** "This week" on the mentor's Home is the last seven days. */
const NOTES_WINDOW_DAYS = 7;

/**
 * `GET /me/mentor-summary`: the four numbers on the mentor's Home (owner,
 * 2026-11-07), each the total of the list its card opens, so the two never
 * disagree: follow-ups due, Students filtered "Absent lately", notes visible to
 * them from the last 7 days, and Students. Nothing season-shaped.
 */
export const mentorSummaryRouter = Router();

mentorSummaryRouter.get("/mentor-summary", requireAuth, async (req, res) => {
  const user = requireUser(req);
  if (user.role !== "MENTOR") return forbidden(res);

  const base = studentListQuerySchema.parse({ limit: 1 });
  const visible = noteVisibilityWhere(user);
  const [followUpsDue, absent, all, notesThisWeek] = await Promise.all([
    countDueFollowUps(user.userId),
    listStudents(user, { ...base, absentLately: "1" }),
    listStudents(user, base),
    visible === null
      ? Promise.resolve(0)
      : db.engagementNote.count({
          where: { AND: [visible, { studentUser: { deletedAt: null } }, writtenWithin(NOTES_WINDOW_DAYS)] },
        }),
  ]);
  const summary: MentorSummary = {
    followUpsDue,
    absentLately: absent?.total ?? 0,
    notesThisWeek,
    students: all?.total ?? 0,
  };
  return apiOk(res, summary);
});
