/**
 * The preflight's review lists. They are information for the owner, not rule
 * violations: nothing here blocks `--apply`. They name people by account id, the
 * same as the violations do, and print no other personal data.
 *
 * An alumnus is a person with a `graduationYear`, whatever their stored role.
 */
import { db } from "../src/db/client";

export interface SeatRow {
  userId: number;
  seasonId: number;
  row: "admin" | "leader";
}

export interface ReviewLists {
  /** Stored ADMIN or LEADER with no graduationYear: `roles:convert` refuses these. */
  storedStaffWithoutGraduationYear: { userId: number; role: string }[];
  /** Live seat holders (ACTIVE season) with no graduationYear. Staff must be alumni. */
  staffNotAlumni: SeatRow[];
  /** Seat rows in a DRAFT season. They count for nothing until it starts. */
  draftSeatHolders: SeatRow[];
  /** Stored STUDENTs holding live seats: their role comes from the rows already. */
  storedStudentsHoldingSeats: { withGraduationYear: SeatRow[]; withoutGraduationYear: SeatRow[] };
}

const LIVE_USER = { deletedAt: null };
const userSelect = { role: true, graduationYear: true } as const;

interface Seat extends SeatRow {
  role: string;
  graduationYear: number | null;
}

async function readSeats(status: "ACTIVE" | "DRAFT"): Promise<Seat[]> {
  const season = { status, deletedAt: null };
  const [admins, leaders] = await Promise.all([
    db.seasonAdmin.findMany({
      where: { season, user: LIVE_USER },
      select: { userId: true, seasonId: true, user: { select: userSelect } },
    }),
    db.groupLeader.findMany({
      where: { group: { season }, user: LIVE_USER },
      select: { userId: true, user: { select: userSelect }, group: { select: { seasonId: true } } },
    }),
  ]);
  return [
    ...admins.map((r) => ({ userId: r.userId, seasonId: r.seasonId, row: "admin" as const, ...r.user })),
    ...leaders.map((r) => ({ userId: r.userId, seasonId: r.group.seasonId, row: "leader" as const, ...r.user })),
  ];
}

const asRow = ({ userId, seasonId, row }: Seat): SeatRow => ({ userId, seasonId, row });
const permanent = (s: Seat) => s.role === "SUPER" || s.role === "MENTOR";

export async function findReviewLists(): Promise<ReviewLists> {
  const [storedStaff, live, draft] = await Promise.all([
    db.user.findMany({
      where: { role: { in: ["ADMIN", "LEADER"] }, graduationYear: null, ...LIVE_USER },
      select: { id: true, role: true },
      orderBy: { id: "asc" },
    }),
    readSeats("ACTIVE"),
    readSeats("DRAFT"),
  ]);
  const students = live.filter((s) => s.role === "STUDENT");
  return {
    storedStaffWithoutGraduationYear: storedStaff.map((u) => ({ userId: u.id, role: u.role })),
    staffNotAlumni: live.filter((s) => !permanent(s) && s.graduationYear === null).map(asRow),
    draftSeatHolders: draft.map(asRow),
    storedStudentsHoldingSeats: {
      withGraduationYear: students.filter((s) => s.graduationYear !== null).map(asRow),
      withoutGraduationYear: students.filter((s) => s.graduationYear === null).map(asRow),
    },
  };
}

/** Prisma's "column or table does not exist": the database isn't migrated as far as this code. */
function isMissingSchema(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err.code === "P2022" || err.code === "P2021");
}

export async function printReviewLists(log: (...args: unknown[]) => void): Promise<void> {
  try {
    const lists = await findReviewLists();
    log("Review lists (information, not violations; they never block --apply):", JSON.stringify(lists, null, 2));
  } catch (err) {
    if (!isMissingSchema(err)) throw err;
    log("Review lists are unknown: this database isn't migrated far enough to read them.");
  }
}
