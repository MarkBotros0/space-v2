/**
 * Prisma's unique-constraint violation. Duck-typed on `code` rather than
 * `instanceof PrismaClientKnownRequestError` so callers need no value import
 * from the generated client. Spec 02 D15: read-then-write uniqueness checks
 * race; the loser's P2002 must become the same 409 the pre-check gives.
 */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}
