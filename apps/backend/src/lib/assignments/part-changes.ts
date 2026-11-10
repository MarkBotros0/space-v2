import type { AssignmentPartInput } from "@space/shared";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import type { AssignmentPartKind } from "../../generated/prisma/enums";
// VALUE import: relative, like every runtime import of the shared package.
import { parseYouTubeId } from "../../../../../packages/shared/src/index";
import { ApiError } from "../api-error";

/** What planning an edit needs to know about a part already stored. */
interface PartRow {
  id: number;
  kind: AssignmentPartKind;
  youtubeId: string | null;
  minWords: number | null;
  maxWords: number | null;
}

export interface PartChangePlan {
  /** New parts, with the position each takes. */
  create: { position: number; input: AssignmentPartInput }[];
  /** Kept parts, rewritten in place (same id) at their new position. */
  update: { id: number; position: number; input: AssignmentPartInput }[];
  /** Stored parts the body no longer lists: they go, with the students' work on them. */
  remove: number[];
  /** Kept videos whose link now names another video: their progress and answers are reset. */
  resetVideo: number[];
  /** Kept essays whose word range changed: asked about, but handed-in essays stay handed in. */
  wordRangeChanged: number[];
  /** A part was added, so whoever had submitted has something left to do. */
  reopensSubmitted: boolean;
}

/**
 * Diffs an edit's parts against the stored ones. The body is the whole list in
 * order: a part with an `id` keeps its row (and the students' work on it),
 * one without is new, and a stored part left out is removed. An `id` this
 * assignment doesn't have is refused, and so is changing a part's kind, which
 * would leave the students' work on it meaning something else.
 *
 * A video counts as changed when its link names another YouTube video, not
 * when the same video is written another way. A changed essay word range is
 * asked about (spec, "Editing after students started") but applied as a plain
 * update: essays already handed in stay handed in.
 */
export function planPartChanges(existing: PartRow[], incoming: AssignmentPartInput[]): PartChangePlan {
  const stored = new Map(existing.map((p) => [p.id, p]));
  const plan: PartChangePlan = {
    create: [],
    update: [],
    remove: [],
    resetVideo: [],
    wordRangeChanged: [],
    reopensSubmitted: false,
  };
  const kept = new Set<number>();

  incoming.forEach((input, position) => {
    if (input.id === undefined) {
      plan.create.push({ position, input });
      return;
    }
    const row = stored.get(input.id);
    if (!row || kept.has(input.id)) {
      throw new ApiError("unknown_part", "One of these parts isn't part of this assignment.", 400);
    }
    if (row.kind !== input.kind) {
      throw new ApiError("bad_request", "A part can't change kind. Remove it and add a new one.", 400);
    }
    kept.add(input.id);
    plan.update.push({ id: input.id, position, input });
    if (input.kind === "VIDEO" && parseYouTubeId(input.youtubeUrl) !== row.youtubeId) {
      plan.resetVideo.push(input.id);
    }
    if (input.kind === "ESSAY" && (input.minWords !== row.minWords || input.maxWords !== row.maxWords)) {
      plan.wordRangeChanged.push(input.id);
    }
  });

  plan.remove = existing.filter((p) => !kept.has(p.id)).map((p) => p.id);
  plan.reopensSubmitted = plan.create.length > 0;
  return plan;
}

type Client = Prisma.TransactionClient | typeof db;

/**
 * How many students an edit touches: those with work on a removed part, on a
 * video being reset (an answered timed question counts as work on its video)
 * or on an essay whose word range changed, and, when a part is added, those
 * who had submitted. Each student once.
 */
export async function partChangeImpact(
  assignmentId: number,
  plan: PartChangePlan,
  client: Client = db,
): Promise<{ students: number }> {
  const touchedParts = [...plan.remove, ...plan.resetVideo, ...plan.wordRangeChanged];
  const students = new Set<number>();
  if (touchedParts.length > 0) {
    const [works, answers] = await Promise.all([
      client.assignmentPartWork.findMany({
        where: { partId: { in: touchedParts }, part: { assignmentId } },
        select: { studentUserId: true },
      }),
      client.sessionVideoQuestionResponse.findMany({
        where: { question: { assignmentPartId: { in: touchedParts }, assignmentPart: { assignmentId } } },
        select: { studentUserId: true },
      }),
    ]);
    for (const row of [...works, ...answers]) students.add(row.studentUserId);
  }
  if (plan.reopensSubmitted) {
    const submitted = await client.submission.findMany({
      where: { assignmentId, submittedAt: { not: null } },
      select: { studentUserId: true },
    });
    for (const row of submitted) students.add(row.studentUserId);
  }
  return { students: students.size };
}
