import type { ZodError } from "zod";
import type { AssignmentPartInput, AssignmentWriteBody } from "@space/shared";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
// VALUE import: relative, like every runtime import of the shared package.
import { parseYouTubeId } from "../../../../../packages/shared/src/index";
import { ApiError } from "../api-error";
import { liveAssignment } from "../db/live";
import { bestEffort } from "../best-effort";
import { notificationLink } from "../notification-target";
import { createNotificationsBulk } from "../notifications";
import { formatInOrgTime, orgWallClockToInstant } from "../org-time";
import { liveStudentIds } from "../queries/season-participants";
import { partChangeImpact, planPartChanges, type PartChangePlan } from "./part-changes";
import { resolveRemindAt } from "./reminder";

type Tx = Prisma.TransactionClient;

/**
 * The Assignment columns a write sets: everything except seasonId and the
 * audit columns, which differ between create and update. The deadline is
 * composed on the organisation's clock (ruling C2).
 */
function assignmentColumns(body: AssignmentWriteBody) {
  return {
    title: body.title,
    description: body.description,
    dueAt: body.dueDay === null ? null : orgWallClockToInstant(body.dueDay, body.dueTime),
    reminderEnabled: body.reminder.enabled,
    reminderDays: body.reminder.days,
    reminderAnchor: body.reminder.anchor,
    reminderTime: body.reminder.time,
  };
}

/**
 * Every per-kind column of a part, the other kinds' at their defaults, so an
 * update rewrites the whole row and nothing of an earlier shape survives.
 */
function partColumns(input: AssignmentPartInput) {
  const blank = {
    title: null,
    youtubeUrl: null,
    youtubeId: null,
    durationSeconds: null,
    blockSkipping: false,
    prompt: null,
    minWords: null,
    maxWords: null,
    maxFileSizeMb: null,
    allowedMimeCategories: [],
    postToRead: true,
    allowComments: false,
  };
  if (input.kind === "VIDEO") {
    const { title, youtubeUrl, durationSeconds, blockSkipping } = input;
    return {
      ...blank,
      kind: input.kind,
      title,
      youtubeUrl,
      youtubeId: parseYouTubeId(youtubeUrl),
      durationSeconds,
      blockSkipping,
    };
  }
  if (input.kind === "ESSAY") {
    const { prompt, minWords, maxWords, maxFileSizeMb, allowedMimeCategories } = input;
    return { ...blank, kind: input.kind, prompt, minWords, maxWords, maxFileSizeMb, allowedMimeCategories };
  }
  const { prompt, minWords, postToRead, allowComments } = input;
  return { ...blank, kind: input.kind, prompt, minWords, postToRead, allowComments };
}

async function remindAtFor(seasonId: number, columns: ReturnType<typeof assignmentColumns>): Promise<Date | null> {
  return resolveRemindAt({ seasonId, ...columns }, new Date());
}

/**
 * The single ASSIGNMENT_CREATED producer. Runs after the write has committed
 * (R65). Title and link are v1's exact strings (`assignment-actions.ts:87,91`;
 * ruling X1); the body's time is the organisation's wall clock (C2).
 * Best-effort: the assignment exists, so a notification failure must not
 * report the write as failed (spec D6, R86).
 */
async function notifyAssignmentCreated(
  assignment: { id: number; title: string; dueAt: Date | null },
  studentIds: number[],
): Promise<void> {
  if (studentIds.length === 0) return;
  await bestEffort("notify:ASSIGNMENT_CREATED", () =>
    createNotificationsBulk(studentIds, {
      type: "ASSIGNMENT_CREATED",
      title: `New assignment: ${assignment.title}`,
      body: assignment.dueAt ? `Due ${formatInOrgTime(assignment.dueAt)}` : undefined,
      link: notificationLink.studentAssignment(assignment.id),
    }),
  );
}

/**
 * POST /seasons/:id/assignments' write: the row and its parts commit together,
 * in the body's order. Then every live student of the season is told once
 * (an assignment is for the whole season; a draft's roster is not told).
 */
export async function createAssignment(
  seasonId: number,
  body: AssignmentWriteBody,
  actorId: number,
): Promise<{ id: number }> {
  const columns = assignmentColumns(body);
  const remindAt = await remindAtFor(seasonId, columns);
  const created = await db.assignment.create({
    data: {
      seasonId,
      ...columns,
      remindAt,
      createdById: actorId,
      updatedById: actorId,
      parts: { create: body.parts.map((input, position) => ({ position, ...partColumns(input) })) },
    },
    select: { id: true },
  });
  await notifyAssignmentCreated({ id: created.id, ...columns }, await liveStudentIds(seasonId));
  return created;
}

function confirmMessage(students: number): string {
  return students === 1 ? "This changes work 1 student has done." : `This changes work ${students} students have done.`;
}

/** Applies a confirmed plan's part changes. Returns how many submitted students were reopened. */
async function applyPartChanges(tx: Tx, assignmentId: number, plan: PartChangePlan): Promise<number> {
  if (plan.resetVideo.length > 0) {
    const resetWork = await tx.assignmentPartWork.findMany({
      where: { partId: { in: plan.resetVideo } },
      select: { studentUserId: true },
    });
    await tx.sessionVideoQuestionResponse.deleteMany({
      where: { question: { assignmentPartId: { in: plan.resetVideo } } },
    });
    await tx.assignmentPartWork.deleteMany({ where: { partId: { in: plan.resetVideo } } });
    // A reset video is no longer done, so nobody it touched has every part done.
    await tx.submission.updateMany({
      where: { assignmentId, studentUserId: { in: resetWork.map((w) => w.studentUserId) } },
      data: { completedAt: null },
    });
  }
  // A removed part's work, files, comments, questions and answers cascade with it.
  if (plan.remove.length > 0) {
    await tx.assignmentPart.deleteMany({ where: { id: { in: plan.remove }, assignmentId } });
  }
  for (const { id, position, input } of plan.update) {
    await tx.assignmentPart.update({ where: { id }, data: { position, ...partColumns(input) } });
  }
  if (plan.create.length === 0) return 0;
  await tx.assignmentPart.createMany({
    data: plan.create.map(({ position, input }) => ({ assignmentId, position, ...partColumns(input) })),
  });
  // A new part means nobody has every part done, and whoever had submitted has more to do.
  const reopened = await tx.submission.updateMany({
    where: { assignmentId, submittedAt: { not: null } },
    data: { submittedAt: null, completedAt: null },
  });
  await tx.submission.updateMany({ where: { assignmentId, completedAt: { not: null } }, data: { completedAt: null } });
  return reopened.count;
}

/**
 * PATCH /assignments/:id's write: a full replace of the fields and the parts,
 * in one transaction holding the assignment's row lock, so the impact counted
 * is the impact applied. An edit that changes students' work (a removed part,
 * a video's new link, an added part reopening submitted work) is refused with
 * 409 `needs_confirmation` and the student count until the body says
 * `confirm: true`. seasonId and createdById are never written here (R68).
 */
export async function replaceAssignment(
  id: number,
  body: AssignmentWriteBody,
  actorId: number,
): Promise<{ reopened: number }> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Assignment" WHERE "id" = ${id} FOR UPDATE`;
    // Re-read under the lock: a delete that landed after the route's check wins.
    const current = await tx.assignment.findFirst({
      where: { id, ...liveAssignment },
      select: { seasonId: true, parts: { select: { id: true, kind: true, youtubeId: true } } },
    });
    if (!current) throw new ApiError("not_found", "Assignment not found.", 404);
    const { seasonId, parts } = current;
    const plan = planPartChanges(parts, body.parts);
    const { students } = await partChangeImpact(id, plan, tx);
    if (students > 0 && body.confirm !== true) {
      throw new ApiError("needs_confirmation", confirmMessage(students), 409, { students });
    }
    const reopened = await applyPartChanges(tx, id, plan);
    const columns = assignmentColumns(body);
    await tx.assignment.update({
      where: { id },
      data: { ...columns, remindAt: await remindAtFor(seasonId, columns), updatedById: actorId },
    });
    return { reopened };
  });
}

/** The first schema issue as a sentence the client can show, prefixed with its field. */
export function bodyErrorMessage(err: ZodError, fallback: string): string {
  const issue = err.issues[0];
  if (!issue) return fallback;
  return issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message;
}
