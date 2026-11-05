import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";

/**
 * Finds the account for a typed sign-in address. An exact match wins (v1's
 * behaviour); otherwise a case-insensitive match is used, but only when it is
 * unique. Accounts created from the app store the address lowercased, so a
 * phone keyboard that capitalises "Foo@x.com" must still find "foo@x.com";
 * two rows differing only in case (possible in the shared v1 data) are
 * ambiguous and match neither.
 */
export async function findUserByEmail<S extends Prisma.UserSelect>(
  email: string,
  select: S,
): Promise<Prisma.UserGetPayload<{ select: S }> | null> {
  const exact = await db.user.findUnique({ where: { email }, select });
  if (exact) return exact;
  const loose = await db.user.findMany({
    where: { email: { equals: email.trim(), mode: "insensitive" } },
    select,
    take: 2,
  });
  return loose.length === 1 ? (loose[0] ?? null) : null;
}
