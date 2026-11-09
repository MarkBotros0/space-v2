import bcrypt from "bcryptjs";
import { z } from "zod";

import { db } from "../../src/db/client";
// Relative, like every value import of packages/shared in this backend.
import { passwordSchema } from "../../../../packages/shared/src/user";

/** What the operator types. Same email and password rules as the app. */
export const superAdminInputSchema = z.object({
  email: z.string().trim().toLowerCase().email("Must be a valid email."),
  name: z.string().trim().min(1, "Name is required.").max(120, "At most 120 characters."),
  password: passwordSchema,
});

export type CreateSuperAdminResult =
  | { ok: true; id: number; email: string }
  | { ok: false; error: string };

/** Same cost as password reset (lib/auth/password-reset.ts). */
const BCRYPT_COST = 12;

/**
 * Creates one SUPER account with a password the operator chose. This is the
 * only way into a freshly migrated, empty database: everyone else is then
 * created or invited from the app. Refuses an address that already exists in
 * any letter case, so it can never overwrite or take over an account.
 */
export async function createSuperAdmin(raw: unknown): Promise<CreateSuperAdminResult> {
  const parsed = superAdminInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join(" ") };
  }
  const { email, name, password } = parsed.data;

  const existing = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return { ok: false, error: `An account for ${email} already exists.` };

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const user = await db.user.create({
    data: { email, name, role: "SUPER", passwordHash },
    select: { id: true, email: true },
  });
  return { ok: true, id: user.id, email: user.email };
}
