import bcrypt from "bcryptjs";
import { db } from "../../db/client";
import { findUserByEmail } from "./find-user-by-email";

export interface VerifiedUser {
  id: number;
  email: string;
  name: string;
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<VerifiedUser | null> {
  const user = await findUserByEmail(email, {
    id: true,
    email: true,
    name: true,
    deletedAt: true,
    passwordHash: true,
  });
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
  };
}
