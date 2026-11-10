import { db } from "../../db/client";
// Relative, not "@space/shared" — same emit trap routes/auth.ts documents.
import type { CreateUserBody } from "../../../../../packages/shared/src/index";
import { issueInvite } from "../invites";

/**
 * POST /users' write. Spec 11 §7: creation and invitation are ONE operation.
 * passwordHash stays null — the column is nullable and null IS the activation
 * model (R14). No temp password exists to log, display, or share (D2). A lost
 * email race surfaces as Prisma's unique violation, which the route maps.
 */
export async function createInvitedUser(
  actorId: number,
  body: CreateUserBody,
): Promise<{ id: number; raw: string; expiresAt: Date }> {
  return db.$transaction(async (tx) => {
    const row = await tx.user.create({
      data: {
        name: body.name,
        email: body.email,
        role: body.role,
        graduationYear: body.graduationYear,
        passwordHash: null,
        ...(body.role === "STUDENT" ? { studentProfile: { create: {} } } : {}),
      },
      select: { id: true },
    });
    const invite = await issueInvite(tx, row.id, actorId);
    return { id: row.id, raw: invite.raw, expiresAt: invite.expiresAt };
  });
}
