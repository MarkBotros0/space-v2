import bcrypt from "bcryptjs";
import type { UserRole } from "@space/shared";

import { db } from "../../db/client";

export interface VerifiedUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<VerifiedUser | null> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return null;
  if (user.deletedAt) return null;
  if (!user.passwordHash) return null; // invite not yet accepted

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
  };
}
