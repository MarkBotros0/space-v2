import type { Prisma } from "../../generated/prisma/client";
import {
  partDone,
  submitBlockerLine,
  type AssignmentPart,
  type PartWork,
} from "../../../../../packages/shared/src/index";
import { loadWorkIndex, PART_SELECT, partWorksFor, toAssignmentPart } from "../queries/assignments/part-work";

type Tx = Prisma.TransactionClient;

/** Where one student stands on one assignment, read inside a write's transaction. */
interface WorkStanding {
  /** Submit's rule: every part done, videos included. */
  everyPartDone: boolean;
  /** How many parts are not done yet (the reminder's "2 parts left"). */
  partsLeft: number;
  /** Every essay reviewed; an assignment with no essay counts as reviewed. */
  essaysReviewed: boolean;
  /** Submit's refusal in words ("Finish … to submit"); null when nothing blocks. */
  blocker: string | null;
  /** The student's work on each part, in order. */
  works: PartWork[];
}

/**
 * Done for the stored standing. A handed-in essay (waiting review or reviewed)
 * stays done whatever its word range says now: a range changed after the
 * hand-in never reopens it (spec, "Admin changes after students started").
 * Everything else is the shared rule Submit's button follows.
 */
function doneForStanding(part: AssignmentPart, work: PartWork | undefined): boolean {
  const status = work?.essay?.reviewStatus;
  if (part.kind === "ESSAY" && (status === "SUBMITTED" || status === "REVIEWED")) return true;
  return partDone(part, work);
}

function standingFrom(parts: AssignmentPart[], works: PartWork[]): WorkStanding {
  const left = parts.filter(
    (p) =>
      !doneForStanding(
        p,
        works.find((w) => w.partId === p.id),
      ),
  ).length;
  const everyPartDone = parts.length > 0 && left === 0;
  return {
    everyPartDone,
    partsLeft: left,
    essaysReviewed: works.filter((w) => w.kind === "ESSAY").every((w) => w.essay?.reviewStatus === "REVIEWED"),
    blocker: everyPartDone ? null : (submitBlockerLine(parts, works) ?? "Finish every part to submit"),
    works,
  };
}

/** Each student's standing on one assignment, from one read of its parts and work. */
export async function workStandings(
  tx: Tx,
  assignmentId: number,
  studentUserIds: number[],
): Promise<Map<number, WorkStanding>> {
  const rows = await tx.assignmentPart.findMany({
    where: { assignmentId },
    orderBy: { position: "asc" },
    select: PART_SELECT,
  });
  const index = await loadWorkIndex(
    rows.map((p) => p.id),
    studentUserIds,
    tx,
  );
  const parts = rows.map(toAssignmentPart);
  return new Map(
    studentUserIds.map((id) => [id, standingFrom(parts, partWorksFor(rows, id, index, { forStaff: false }))]),
  );
}

/** One student's standing on one assignment. */
export async function workStanding(tx: Tx, assignmentId: number, studentUserId: number): Promise<WorkStanding> {
  const standing = (await workStandings(tx, assignmentId, [studentUserId])).get(studentUserId);
  if (!standing) throw new Error("workStandings returned no row for the student it was asked about");
  return standing;
}

/**
 * After an edit that changes what "every part done" means (a video reset, a
 * part removed), puts each submitted student's stored standing right: one who
 * no longer has every part done is reopened (`submittedAt` and `completedAt`
 * cleared, so the assignment is back in their To do and the reminder applies);
 * one with every part done and every essay reviewed is complete. The caller
 * holds the Assignment FOR UPDATE and the Submissions FOR UPDATE. Returns how
 * many were reopened.
 */
export async function settleSubmitted(tx: Tx, assignmentId: number, now: Date): Promise<number> {
  const submitted = await tx.submission.findMany({
    where: { assignmentId, submittedAt: { not: null } },
    select: { id: true, studentUserId: true, completedAt: true },
  });
  if (submitted.length === 0) return 0;
  const standings = await workStandings(
    tx,
    assignmentId,
    submitted.map((s) => s.studentUserId),
  );
  const reopen: number[] = [];
  const complete: number[] = [];
  const incomplete: number[] = [];
  for (const s of submitted) {
    const standing = standings.get(s.studentUserId);
    if (!standing?.everyPartDone) reopen.push(s.id);
    else if (standing.essaysReviewed && s.completedAt === null) complete.push(s.id);
    else if (!standing.essaysReviewed && s.completedAt !== null) incomplete.push(s.id);
  }
  if (reopen.length > 0) {
    await tx.submission.updateMany({ where: { id: { in: reopen } }, data: { submittedAt: null, completedAt: null } });
  }
  if (complete.length > 0)
    await tx.submission.updateMany({ where: { id: { in: complete } }, data: { completedAt: now } });
  if (incomplete.length > 0) {
    await tx.submission.updateMany({ where: { id: { in: incomplete } }, data: { completedAt: null } });
  }
  return reopen.length;
}
