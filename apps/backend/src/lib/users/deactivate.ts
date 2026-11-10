import { db } from "../../db/client";
import { ApiError } from "../api-error";
import { invalidateSessions } from "../auth/session-validity";
import { revokeAllRefreshTokensForUser } from "../auth/tokens";
import { isLastActiveSuper, lockActiveSuperIds } from "../super-guard";

/**
 * POST /users/:id/deactivate's write. The existence check, the last-SUPER
 * guard and the write share one transaction, and the guard locks the SUPER
 * rows (Decision 16): an earlier draft counted outside any transaction, so a
 * concurrent demotion could slip between the count and the write. Both
 * refusals are thrown before anything is written.
 */
export async function deactivateAccount(id: number, deletedAt: Date): Promise<void> {
  await db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) throw new ApiError("not_found", "User not found.", 404);
    if (target.role === "SUPER") {
      const activeSuperIds = await lockActiveSuperIds(tx);
      if (isLastActiveSuper(activeSuperIds, id)) {
        throw new ApiError("last_super", "This is the only active SUPER account.", 409);
      }
    }
    await tx.user.update({ where: { id }, data: { deletedAt } });
    // D6: deactivation revokes — v1 left the refresh path live for 30 days.
    // Live access tokens end too (Plan 18 M13).
    await revokeAllRefreshTokensForUser(tx, id);
    await invalidateSessions(tx, id);
  });
}
