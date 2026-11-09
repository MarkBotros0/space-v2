import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";

/**
 * Finds the account for a typed sign-in address: trimmed and lowercased, then
 * one exact match on the unique email index. Every stored address is lowercase
 * (CHECK User_email_lowercase_check, migration 20261110080000), so a phone
 * keyboard that capitalises "Foo@x.com" still finds "foo@x.com", and two rows
 * can no longer differ only in case.
 */
export async function findUserByEmail<S extends Prisma.UserSelect>(
  email: string,
  select: S,
): Promise<Prisma.UserGetPayload<{ select: S }> | null> {
  return db.user.findUnique({ where: { email: email.trim().toLowerCase() }, select });
}
