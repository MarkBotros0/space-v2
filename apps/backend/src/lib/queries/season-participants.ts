import type { Prisma } from "../../generated/prisma/client";

/**
 * "The season's participants": who a staff roster, count or report lists.
 *
 * ACTIVE in a live season (DRAFT or ACTIVE); ACTIVE and COMPLETED in a finished
 * one (COMPLETED or ARCHIVED). WITHDRAWN never. End season makes every enrolment
 * COMPLETED, so filtering on ACTIVE alone blanks out every finished season, and
 * a Super could not correct anything in it. COMPLETED in a live season stays out:
 * that student graduated part-way and has left the live roster.
 *
 * A where fragment rather than a lookup, so one query carries it wherever the
 * season is: spread it into a `SeasonEnrollmentWhereInput`, alongside the
 * caller's own filters (it sets `OR`, so don't add another `OR` next to it).
 *
 * NOT for "is this student live?": that is `hasActiveEnrollment` and the token's
 * `activeSeasonId`. NOT for who to notify, or who holds a season open at End:
 * nobody in a finished season is told anything, and those stay ACTIVE-only.
 */
export const seasonParticipant: Prisma.SeasonEnrollmentWhereInput = {
  OR: [{ status: "ACTIVE" }, { status: "COMPLETED", season: { status: { in: ["COMPLETED", "ARCHIVED"] } } }],
};

/**
 * Who the group form and the roster grid can list: the participants who are
 * still live STUDENT users. A former student who now serves, or a deleted
 * account, keeps their place in a past group's history but can't be picked, so
 * nothing written from those lists may touch them: "not in the list" says
 * nothing about someone the list could never show.
 */
export const seasonRosterMember: Prisma.SeasonEnrollmentWhereInput = {
  ...seasonParticipant,
  studentUser: { role: "STUDENT", deletedAt: null },
};
