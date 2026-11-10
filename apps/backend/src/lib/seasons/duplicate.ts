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
      reminderEnabled: true,
      reminderDays: true,
      reminderAnchor: true,
      reminderTime: true,
      parts: {
        orderBy: { position: "asc" },
        select: {
          position: true,
          kind: true,
          title: true,
          youtubeId: true,
          youtubeUrl: true,
          durationSeconds: true,
          blockSkipping: true,
          prompt: true,
          minWords: true,
          maxWords: true,
          maxFileSizeMb: true,
          allowedMimeCategories: true,
          postToRead: true,
          allowComments: true,
          videoQuestions: {
            select: { atSeconds: true, prompt: true, options: true, correctIndex: true, points: true },
          },
        },
      },
    },
  },
} satisfies Prisma.SeasonSelect;

/** The season to copy, with what a copy takes from it. D6: v1 had no deletedAt guard and would clone a deleted season. */
export function loadDuplicateSource(id: number) {
  return db.season.findFirst({ where: { id, ...liveSeason }, select: SOURCE_SELECT });
}

type DuplicateSource = NonNullable<Awaited<ReturnType<typeof loadDuplicateSource>>>;
type Target = { code: string; year: number; startDate: Date; endDate: Date };

/**
 * POST /seasons/:id/duplicate's transaction (step 4.6, BE-002: split into one
 * function per kind of row, statements in the same order). Groups and sessions
 * go in one createMany each: an assignment is for the whole season and names
 * neither, so no new id needs mapping back. Each assignment is created with its
 * parts and their timed questions. A lost code race surfaces as Prisma's
 * unique violation, which the route maps.
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
      await cloneGroups(tx, source, season.id);
      await cloneSessions(tx, source, season.id, shift);
      await cloneAssignments(tx, source, season.id, shift, actorId);
      return season;
    },
    // A season with a full term of sessions is hundreds of inserts — well past
    // the 5 s interactive-transaction default (roster and imports raise it the same way).
    { timeout: 30_000 },
  );
}

/** R57/R61: name and description only — no GroupLeader, no GroupStudent. */
async function cloneGroups(tx: Tx, source: DuplicateSource, seasonId: number): Promise<void> {
  if (source.groups.length === 0) return;
  await tx.group.createMany({
    data: source.groups.map((g) => ({ seasonId, name: g.name, description: g.description })),
  });
}

async function cloneSessions(tx: Tx, source: DuplicateSource, seasonId: number, shift: (d: Date) => Date) {
  if (source.sessions.length === 0) return;
  // Divergence (spec 02 D5, ruling C10): one FRESH id per source series.
  const recurrenceIdMap = new Map<string, string>();
  const freshRecurrenceId = (old: string): string => {
    const existing = recurrenceIdMap.get(old);
    if (existing) return existing;
    const minted = newPublicId();
    recurrenceIdMap.set(old, minted);
    return minted;
  };
  await tx.session.createMany({
    data: source.sessions.map((s) => ({
      seasonId,
      title: s.title,
      startsAt: shift(s.startsAt),
      durationMinutes: s.durationMinutes,
      location: s.location,
      youtubeUrl: s.youtubeUrl,
      description: s.description,
      recurrenceGroupId: s.recurrenceGroupId ? freshRecurrenceId(s.recurrenceGroupId) : null,
    })),
  });
}

/**
 * Each live assignment with its settings, its parts in order and each video's
 * timed questions; no student work. The copy lands in a DRAFT season, which
 * nobody is reminded in, so `remindAt` stays unset until it is next saved.
 */
async function cloneAssignments(
  tx: Tx,
  source: DuplicateSource,
  seasonId: number,
  shift: (d: Date) => Date,
  actorId: number,
): Promise<void> {
  for (const { parts, dueAt, ...a } of source.assignments) {
    await tx.assignment.create({
      data: {
        ...a,
        seasonId,
        dueAt: dueAt ? shift(dueAt) : null,
        createdById: actorId,
        updatedById: actorId,
        parts: {
          create: parts.map(({ videoQuestions, ...part }) => ({
            ...part,
            videoQuestions: { create: videoQuestions.map((q) => ({ ...q, createdById: actorId })) },
          })),
        },
      },
      select: { id: true },
    });
  }
}
