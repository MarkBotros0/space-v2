import { db } from "../../db/client";
import { ApiError } from "../api-error";
import { invalidateSessions } from "../auth/session-validity";
import { revokeAllRefreshTokensForUser } from "../auth/tokens";
import { dateFromDay } from "../org-time";
import { isLastActiveSuper, lockActiveSuperIds } from "../super-guard";

/**
 * The account holder deletes their own account: the same soft delete as a
 * SUPER's deactivation (deletedAt on the user, every session revoked) plus this
 * account's push devices. User.deletedAt is the one flag (DB-010). Throws 404 for an account
 * already gone and 409 `last_super` for the last active SUPER; nothing is
 * written then.
 */
export async function deleteOwnAccount(userId: number, deletedAt: Date): Promise<void> {
  await db.$transaction(async (tx) => {
    const row = await tx.user.findUnique({ where: { id: userId }, select: { role: true, deletedAt: true } });
    if (!row || row.deletedAt) throw new ApiError("not_found", "Account not found.", 404);
    if (row.role === "SUPER") {
      const activeSuperIds = await lockActiveSuperIds(tx);
      if (isLastActiveSuper(activeSuperIds, userId)) {
        throw new ApiError("last_super", "You're the only active SUPER account, so it can't be deleted.", 409);
      }
    }
    await tx.user.update({ where: { id: userId }, data: { deletedAt } });
    await tx.deviceToken.deleteMany({ where: { userId } });
    await revokeAllRefreshTokensForUser(tx, userId);
    await invalidateSessions(tx, userId);
  });
}

/** A student's own profile fields. Prisma reads `undefined` as "leave the column alone", exactly PATCH. */
interface OwnProfileWrite {
  phone?: string | null;
  dateOfBirth?: string | null;
  university?: string | null;
  faculty?: string | null;
  universityGraduationYear?: number | null;
}

/**
 * Saves them in one transaction: phone and dateOfBirth on the User row, the rest
 * on the StudentProfile, upserted as Plan 7 does (v1's unconditional update threw
 * for a STUDENT with no profile row, spec 06 §2).
 */
export async function saveOwnProfile(userId: number, body: OwnProfileWrite): Promise<void> {
  const data = {
    university: body.university,
    faculty: body.faculty,
    universityGraduationYear: body.universityGraduationYear,
  };
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { phone: body.phone, dateOfBirth: dateFromDay(body.dateOfBirth) },
    });
    await tx.studentProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  });
}
