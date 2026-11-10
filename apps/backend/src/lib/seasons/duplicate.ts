import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { liveAssignment, liveSeason } from "../db/live";
import { newPublicId } from "../public-id";

type Tx = Prisma.TransactionClient;

const SOURCE_SELECT = {
  program: true,
  requiredProgram: true,
  graduatesOnPass: true,
  isCommunityWide: true,
  description: true,
  startDate: true,
  absenceBudgetMinutes: true,
  absenceWeightMinutes: true,
  groups: { select: { id: true, name: true, description: true } },
  sessions: {
    select: {
      id: true,
      title: true,
      startsAt: true,
      durationMinutes: true,
      location: true,
      youtubeUrl: true,
      description: true,
      recurrenceGroupId: true,
    },
  },
  assignments: {
    where: liveAssignment,
    select: {
      title: true,
      description: true,
      dueAt: true,
      isAllGroups: true,
      type: true,
      forumMinWords: true,
      forumAllowComments: true,
      forumPostToRead: true,
      maxFileSizeMb: true,
      allowedMimeCategories: true,
      sessionId: true,
      targets: { select: { groupId: true } },
    },
  },
} satisfies Prisma.SeasonSelect;

/** The season to copy, with what a copy takes from it. D6: v1 had no deletedAt guard and would clone a deleted season. */
export function loadDuplicateSource(id: number) {
  return db.season.findFirst({ where: { id, ...liveSeason }, select: SOURCE_SELECT });
}

export type DuplicateSource = NonNullable<Awaited<ReturnType<typeof loadDuplicateSource>>>;
type Target = { code: string; year: number; startDate: Date; endDate: Date };

/**
 * POST /seasons/:id/duplicate's transaction (step 4.6, BE-002: split into one
 * function per kind of row, statements in the same order). Batching: a clone
 * whose new id nothing needs goes in ONE createMany; only groups an assignment
 * targets and sessions an assignment points at are created row by row, because
 * their new ids must be mapped back and createManyAndReturn's row order is not
 * part of its contract (see lib/students/create.ts). Assignment targets go in
 * one createMany at the end. A lost code race surfaces as Prisma's unique
 * violation, which the route maps.
 */
export async function cloneSeason(
  source: DuplicateSource,
  target: Target,
  actorId: number,
): Promise<{ id: number; code: string }> {
  const offsetMs = target.startDate.getTime() - source.startDate.getTime();
  const shift = (d: Date) => new Date(d.getTime() + offsetMs);
  return db.$transaction(
    async (tx) => {
      const season = await tx.season.create({
        data: {
          code: target.code,
          title: `${source.program} ${target.year}`,
          program: source.program,
          requiredProgram: source.requiredProgram,
          graduatesOnPass: source.graduatesOnPass,
          isCommunityWide: source.isCommunityWide,
          year: target.year,
          description: source.description,
          startDate: target.startDate,
          endDate: target.endDate,
          status: "DRAFT",
          absenceBudgetMinutes: source.absenceBudgetMinutes,
          absenceWeightMinutes: source.absenceWeightMinutes,
          createdById: actorId,
          updatedById: actorId,
        },
        select: { id: true, code: true },
      });
      const groupIdMap = await cloneGroups(tx, source, season.id);
      const sessionIdMap = await cloneSessions(tx, source, season.id, shift);
      await cloneAssignments(tx, source, season.id, shift, { groupIdMap, sessionIdMap }, actorId);
      return season;
    },
    // A season with a full term of sessions is hundreds of inserts — well past
    // the 5 s interactive-transaction default (roster and imports raise it the same way).
    { timeout: 30_000 },
  );
}

/** R57/R61: name and description only — no GroupLeader, no GroupStudent. Returns old id → new id for targeted groups. */
async function cloneGroups(tx: Tx, source: DuplicateSource, seasonId: number): Promise<Map<number, number>> {
  const targetedGroupIds = new Set(
    source.assignments.filter((a) => !a.isAllGroups).flatMap((a) => a.targets.map((t) => t.groupId)),
  );
  const groupData = (g: DuplicateSource["groups"][number]) => ({ seasonId, name: g.name, description: g.description });
  const groupIdMap = new Map<number, number>();
  const unmappedGroups = source.groups.filter((g) => !targetedGroupIds.has(g.id));
  if (unmappedGroups.length > 0) {
    await tx.group.createMany({ data: unmappedGroups.map(groupData) });
  }
  for (const g of source.groups.filter((g) => targetedGroupIds.has(g.id))) {
    const clone = await tx.group.create({ data: groupData(g), select: { id: true } });
    groupIdMap.set(g.id, clone.id);
  }
  return groupIdMap;
}

/** Returns old id → new id for sessions an assignment points at. */
async function cloneSessions(
  tx: Tx,
  source: DuplicateSource,
  seasonId: number,
  shift: (d: Date) => Date,
): Promise<Map<number, number>> {
  const linkedSessionIds = new Set(
    source.assignments.map((a) => a.sessionId).filter((id): id is number => id !== null),
  );
  // Divergence (spec 02 D5, ruling C10): one FRESH id per source series.
  const recurrenceIdMap = new Map<string, string>();
  const freshRecurrenceId = (old: string): string => {
    const existing = recurrenceIdMap.get(old);
    if (existing) return existing;
    const minted = newPublicId();
    recurrenceIdMap.set(old, minted);
    return minted;
  };
  const sessionData = (s: DuplicateSource["sessions"][number]) => ({
    seasonId,
    title: s.title,
    startsAt: shift(s.startsAt),
    durationMinutes: s.durationMinutes,
    location: s.location,
    youtubeUrl: s.youtubeUrl,
    description: s.description,
    recurrenceGroupId: s.recurrenceGroupId ? freshRecurrenceId(s.recurrenceGroupId) : null,
  });
  const sessionIdMap = new Map<number, number>();
  const unmappedSessions = source.sessions.filter((s) => !linkedSessionIds.has(s.id));
  if (unmappedSessions.length > 0) {
    await tx.session.createMany({ data: unmappedSessions.map(sessionData) });
  }
  for (const s of source.sessions.filter((s) => linkedSessionIds.has(s.id))) {
    const clone = await tx.session.create({ data: sessionData(s), select: { id: true } });
    sessionIdMap.set(s.id, clone.id);
  }
  return sessionIdMap;
}

/** R60: only remappable targets; an unmappable one is dropped. */
function remappedTargets(
  a: DuplicateSource["assignments"][number],
  assignmentId: number,
  groupIdMap: Map<number, number>,
): { assignmentId: number; groupId: number }[] {
  if (a.isAllGroups) return [];
  return a.targets.flatMap((t) => {
    const groupId = groupIdMap.get(t.groupId);
    return groupId === undefined ? [] : [{ assignmentId, groupId }];
  });
}

async function cloneAssignments(
  tx: Tx,
  source: DuplicateSource,
  seasonId: number,
  shift: (d: Date) => Date,
  maps: { groupIdMap: Map<number, number>; sessionIdMap: Map<number, number> },
  actorId: number,
): Promise<void> {
  const targetRows: { assignmentId: number; groupId: number }[] = [];
  for (const a of source.assignments) {
    const clone = await tx.assignment.create({
      data: {
        seasonId,
        // R59: remapped to the cloned session, never the source's.
        sessionId: a.sessionId ? (maps.sessionIdMap.get(a.sessionId) ?? null) : null,
        title: a.title,
        description: a.description,
        dueAt: a.dueAt ? shift(a.dueAt) : null,
        isAllGroups: a.isAllGroups,
        type: a.type,
        forumMinWords: a.forumMinWords,
        forumAllowComments: a.forumAllowComments,
        forumPostToRead: a.forumPostToRead,
        maxFileSizeMb: a.maxFileSizeMb,
        allowedMimeCategories: a.allowedMimeCategories,
        createdById: actorId,
        updatedById: actorId,
      },
      select: { id: true },
    });
    targetRows.push(...remappedTargets(a, clone.id, maps.groupIdMap));
  }
  if (targetRows.length > 0) await tx.assignmentTarget.createMany({ data: targetRows });
}
