import type { Prisma } from "../../generated/prisma/client";
// Relative, not "@space/shared" — same emit trap routes/auth.ts documents.
import { roleRequiresAlumnus, type UpdateUserBody } from "../../../../../packages/shared/src/index";

import { ApiError } from "../api-error";
import { derivedRoleOf } from "../auth/scopes";
import { invalidateSessions, markSessionsStale } from "../auth/session-validity";
import { revokeAllRefreshTokensForUser } from "../auth/tokens";
import { liveSeasonRole, lockPeople } from "../roles";
import { isLastActiveSuper, lockActiveSuperIds } from "../super-guard";

type Tx = Prisma.TransactionClient;

export const isSeasonRole = (role: unknown): role is "ADMIN" | "LEADER" => role === "ADMIN" || role === "LEADER";

type RoleChange = {
  actorId: number;
  id: number;
  body: UpdateUserBody;
  target: { name: string; role: string };
  currentRole: string;
  lockedSuperIds: number[] | null;
};

/** Throws the first rule a role change breaks; writes nothing. */
async function refuseRoleChange(
  tx: Tx,
  { actorId, id, body, target, currentRole, lockedSuperIds }: RoleChange,
): Promise<void> {
  // D7 rec 1: you cannot change your own role — the lockout guard v1's
  // updateUserAction lacked (R50). Renaming yourself stays allowed.
  if (id === actorId) {
    throw new ApiError("cannot_change_own_role", "You can't change your own role.", 409);
  }

  // D7 rec 3: SUPER is never a mis-tapped picker item.
  if (body.role === "SUPER" && body.confirmSuper !== true) {
    throw new ApiError("confirm_super_required", "Granting SUPER requires explicit confirmation.", 400);
  }

  // D7 rec 2: never demote the last SUPER. The active SUPER rows are LOCKED
  // (Decision 16), not merely counted — a count alone lets two concurrent
  // demotions both pass under READ COMMITTED.
  if (target.role === "SUPER") {
    const activeSuperIds = lockedSuperIds ?? (await lockActiveSuperIds(tx));
    if (isLastActiveSuper(activeSuperIds, id)) {
      throw new ApiError("last_super", "This is the only active SUPER account.", 409);
    }
  }

  // SUPER and MENTOR hold no seasons. A derived ADMIN or LEADER can't become
  // a STUDENT here either: the rows are the role, so saving would change nothing.
  if (body.role !== "STUDENT" || isSeasonRole(currentRole)) {
    const held = await liveSeasonRole(tx, id);
    if (held) {
      throw new ApiError(
        "has_season_role",
        `${target.name} has a role in ${held.seasonTitle}. Remove them from that season first.`,
        409,
      );
    }
  }
}

/**
 * PATCH /users/:id's write, inside the caller's transaction (refactor BE-001).
 * Every refusal is thrown as an ApiError before anything is written, so the
 * rollback undoes nothing. Returns what the route audits.
 */
export async function updateUserInTx(
  tx: Tx,
  actorId: number,
  id: number,
  body: UpdateUserBody,
): Promise<{ roleChanged: boolean; yearCorrected: boolean }> {
  // A SUPER's demotion locks every SUPER before this person alone: two
  // demotions each holding their own row and waiting on the other's would deadlock.
  const before = await tx.user.findUnique({ where: { id }, select: { role: true } });
  const lockedSuperIds = before?.role === "SUPER" && body.role !== "SUPER" ? await lockActiveSuperIds(tx) : null;

  await lockPeople(tx, [id]);
  const target = await tx.user.findUnique({
    where: { id },
    select: { id: true, name: true, role: true, deletedAt: true, graduationYear: true },
  });
  // REG-104: a deactivated account is not an edit target. GET and reactivate
  // still reach it; only this write refuses.
  if (!target || target.deletedAt !== null) {
    throw new ApiError("not_found", "User not found.", 404);
  }

  // Against the role the form was shown, not the stored one: a stored ADMIN
  // with only finished rows reads STUDENT, and saving that changes nothing.
  // No role at all (a derived ADMIN or LEADER's form) is no change either.
  const currentRole = await derivedRoleOf(tx, target);
  const roleChanged = body.role !== undefined && body.role !== currentRole;

  // The schema can't check the year of a role it wasn't sent: that is the held one.
  if (body.role === undefined && body.graduationYear === null && roleRequiresAlumnus(currentRole)) {
    throw new ApiError("bad_request", "Required for this role.", 400);
  }

  if (roleChanged) await refuseRoleChange(tx, { actorId, id, body, target, currentRole, lockedSuperIds });

  // A stored student's year is their alumni status, and Graduate is what changes
  // that: its gate, its audit line, its enrolment completion. Correcting one year
  // to another isn't a change of status. Moving off STUDENT sets the year that
  // role needs.
  const staysStudent = target.role === "STUDENT" && (!roleChanged || body.role === "STUDENT");
  if (staysStudent && (target.graduationYear === null) !== (body.graduationYear === null)) {
    throw new ApiError("use_graduate", "Use Graduate. A graduation year can't be added or cleared here.", 409);
  }
  const yearCorrected = staysStudent && target.graduationYear !== body.graduationYear;

  // A move to STUDENT finally gets a profile (R46: v1 left promoted users
  // with a null activeSeasonId forever).
  if (roleChanged && body.role === "STUDENT") {
    await tx.studentProfile.upsert({
      where: { userId: id },
      update: {},
      create: { userId: id },
    });
  }

  await tx.user.update({
    where: { id },
    data: {
      name: body.name,
      graduationYear: body.graduationYear,
      ...(roleChanged ? { role: body.role } : {}),
    },
  });

  if (roleChanged) {
    // C7 made real: the claims baked into live tokens cannot outlive the
    // change. The refresh path dies now, and so do the access tokens
    // (Plan 18 M13) instead of within their 900s TTL.
    await revokeAllRefreshTokensForUser(tx, id);
    await invalidateSessions(tx, id);
  }
  // The year rides in the token; the next silent refresh picks up the right one.
  if (yearCorrected) await markSessionsStale(tx, [id]);

  return { roleChanged, yearCorrected };
}
