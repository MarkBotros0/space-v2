// Community model, Build 2, Task 2: every user has zero or one active role.
// Spec "The core rule"; the refusal table is in the Build 2 plan.
import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import {
  activeRolesFor,
  describeActiveRole,
  lockPeople,
  seatRefusal,
  type ActiveRole,
  type Seat,
} from "../../lib/roles";
import { cleanupTestData, createTestSeason, createTestUser, type TestRole } from "./fixtures";

jest.setTimeout(60000);

// The database is remote, so the 5s default is too tight for a contended lock.
const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

type SeasonStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

const PERSON_FIELDS = { id: true, name: true, role: true, graduationYear: true, deletedAt: true } as const;

const makePerson = async (
  label: string,
  opts: { role?: TestRole; graduationYear?: number | null; name?: string; deleted?: boolean } = {},
) => {
  const { id } = await createTestUser(label, opts.role ?? "STUDENT");
  return db.user.update({
    where: { id },
    data: {
      name: opts.name ?? "Mina",
      graduationYear: opts.graduationYear === undefined ? 2020 : opts.graduationYear,
      deletedAt: opts.deleted ? new Date() : null,
    },
    select: PERSON_FIELDS,
  });
};
type Person = Awaited<ReturnType<typeof makePerson>>;

const makeSeason = async (status: SeasonStatus = "ACTIVE", title = "GBV 2026") => {
  const { id, code } = await createTestSeason({ status });
  await db.season.update({ where: { id }, data: { title } });
  return { id, code, status, title };
};
const makeAdmin = (userId: number, seasonId: number) => db.seasonAdmin.create({ data: { userId, seasonId } });
const makeLeader = async (userId: number, seasonId: number, name = "Group A") => {
  const group = await db.group.create({ data: { seasonId, name } });
  await db.groupLeader.create({ data: { userId, groupId: group.id } });
};
const enrol = (studentUserId: number, seasonId: number, status: "ACTIVE" | "WITHDRAWN" = "ACTIVE") =>
  db.seasonEnrollment.create({ data: { studentUserId, seasonId, status } });

/** Asks the rule without locking, since nothing here writes. A write follows `takeAdminSeat`. */
const refusalFor = (person: Person, seat: Seat) =>
  db.$transaction(async (tx) => {
    const active = (await activeRolesFor(tx, [person.id])).get(person.id);
    return seatRefusal(tx, person, seat, active);
  }, TX_OPTIONS);

const seatIn = (kind: Seat["kind"], season: { id: number; status: SeasonStatus }): Seat => ({
  kind,
  season: { id: season.id, status: season.status, isCommunityWide: false },
});

describe("seatRefusal", () => {
  it("refuses a deleted account first", async () => {
    const season = await makeSeason();
    const person = await makePerson("orr-deleted", { role: "SUPER", deleted: true });
    expect(await refusalFor(person, seatIn("admin", season))).toEqual({
      code: "user_inactive",
      message: "That account is deactivated.",
    });
  });

  it("refuses a stored SUPER", async () => {
    const season = await makeSeason();
    const person = await makePerson("orr-super", { role: "SUPER" });
    expect(await refusalFor(person, seatIn("student", season))).toEqual({
      code: "permanent_role",
      message: "Mina is a super admin and can't take a season role.",
    });
  });

  it("refuses a stored MENTOR", async () => {
    const season = await makeSeason();
    const person = await makePerson("orr-mentor", { role: "MENTOR" });
    expect(await refusalFor(person, seatIn("leader", season))).toEqual({
      code: "permanent_role",
      message: "Mina is a mentor and can't take a season role.",
    });
  });

  it("doesn't treat a stored ADMIN or LEADER as a permanent role", async () => {
    const season = await makeSeason();
    const storedAdmin = await makePerson("orr-stored-admin", { role: "ADMIN" });
    const storedLeader = await makePerson("orr-stored-leader", { role: "LEADER" });
    expect(await refusalFor(storedAdmin, seatIn("admin", season))).toBeNull();
    expect(await refusalFor(storedLeader, seatIn("leader", season))).toBeNull();
  });

  it.each(["admin", "leader"] as const)("refuses a non-alumnus the %s seat", async (kind) => {
    const season = await makeSeason();
    const person = await makePerson(`orr-not-alumnus-${kind}`, { graduationYear: null });
    expect(await refusalFor(person, seatIn(kind, season))).toEqual({
      code: "not_alumnus",
      message: "Only alumni can serve. Mina hasn't graduated.",
    });
  });

  it("refuses an alumnus a student seat, and lets a non-alumnus take one", async () => {
    const season = await makeSeason();
    const alumnus = await makePerson("orr-is-alumnus");
    const student = await makePerson("orr-student", { graduationYear: null });
    expect(await refusalFor(alumnus, seatIn("student", season))).toEqual({
      code: "is_alumnus",
      message: "Mina is an alumnus and can't join as a student.",
    });
    expect(await refusalFor(student, seatIn("student", season))).toBeNull();
  });

  it.each(["COMPLETED", "ARCHIVED"] as const)("refuses any seat in a finished season (%s)", async (status) => {
    const season = await makeSeason(status);
    const person = await makePerson(`orr-finished-${status}`);
    expect(await refusalFor(person, seatIn("admin", season))).toEqual({
      code: "season_finished",
      message: "This season has finished.",
    });
  });

  it("refuses an ACTIVE seat while leading in another ACTIVE season", async () => {
    const other = await makeSeason("ACTIVE", "GBV 2026");
    const target = await makeSeason("ACTIVE", "Discipleship 2026");
    const person = await makePerson("orr-active-elsewhere");
    await makeLeader(person.id, other.id);
    expect(await refusalFor(person, seatIn("admin", target))).toEqual({
      code: "already_in_role",
      message: "Mina is already leading a group in GBV 2026",
    });
  });

  it("refuses a student a second ACTIVE season", async () => {
    const other = await makeSeason("ACTIVE", "GBV 2026");
    const target = await makeSeason("ACTIVE", "Discipleship 2026");
    const person = await makePerson("orr-two-seasons", { graduationYear: null });
    await enrol(person.id, other.id);
    expect(await refusalFor(person, seatIn("student", target))).toEqual({
      code: "already_in_role",
      message: "Mina is already a student in GBV 2026",
    });
  });

  it("refuses a staff seat to a student of the same season", async () => {
    const season = await makeSeason("ACTIVE", "GBV 2026");
    const person = await makePerson("orr-student-here");
    await enrol(person.id, season.id);
    expect(await refusalFor(person, seatIn("leader", season))).toEqual({
      code: "already_in_role",
      message: "Mina is already a student in GBV 2026",
    });
  });

  it("refuses a student seat to an admin of the same season", async () => {
    const season = await makeSeason("ACTIVE", "GBV 2026");
    const person = await makePerson("orr-admin-here", { graduationYear: null });
    await makeAdmin(person.id, season.id);
    expect(await refusalFor(person, seatIn("student", season))).toEqual({
      code: "already_in_role",
      message: "Mina is already an admin of GBV 2026",
    });
  });

  it.each(["ACTIVE", "DRAFT"] as const)("refuses a second group in one %s season", async (status) => {
    const season = await makeSeason(status);
    const person = await makePerson(`orr-second-group-${status}`);
    await makeLeader(person.id, season.id);
    expect(await refusalFor(person, seatIn("leader", season))).toEqual({
      code: "leader_has_group",
      message: "Mina already leads a group in this season.",
    });
  });

  it("takes the first matching row of the table", async () => {
    const finished = await makeSeason("COMPLETED");
    const nonAlumnus = await makePerson("orr-order", { graduationYear: null });
    expect((await refusalFor(nonAlumnus, seatIn("admin", finished)))?.code).toBe("not_alumnus");
  });

  it("admin and leader in one season is allowed", async () => {
    const season = await makeSeason();
    const admin = await makePerson("orr-admin-leads");
    const leader = await makePerson("orr-leader-admins");
    await makeAdmin(admin.id, season.id);
    await makeLeader(leader.id, season.id);
    expect(await refusalFor(admin, seatIn("leader", season))).toBeNull();
    expect(await refusalFor(leader, seatIn("admin", season))).toBeNull();
  });

  it("a draft seat is allowed while active elsewhere", async () => {
    const active = await makeSeason("ACTIVE");
    const draft = await makeSeason("DRAFT");
    const person = await makePerson("orr-draft-seat");
    await makeLeader(person.id, active.id);
    expect(await refusalFor(person, seatIn("admin", draft))).toBeNull();
  });

  it("a draft season still applies the other rows", async () => {
    const draft = await makeSeason("DRAFT");
    const person = await makePerson("orr-draft-other", { graduationYear: null });
    expect((await refusalFor(person, seatIn("admin", draft)))?.code).toBe("not_alumnus");
  });

  it("a finished season's role doesn't count", async () => {
    const finished = await makeSeason("COMPLETED");
    const target = await makeSeason("ACTIVE");
    const person = await makePerson("orr-finished-role");
    await makeLeader(person.id, finished.id);
    expect(await refusalFor(person, seatIn("admin", target))).toBeNull();
  });

  it("a deleted season's role doesn't count", async () => {
    const gone = await makeSeason("ACTIVE");
    const target = await makeSeason("ACTIVE");
    const person = await makePerson("orr-deleted-season");
    await makeAdmin(person.id, gone.id);
    await db.season.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    expect(await refusalFor(person, seatIn("admin", target))).toBeNull();
  });
});

describe("activeRolesFor", () => {
  const rolesFor = (ids: number[]) => db.$transaction((tx) => activeRolesFor(tx, ids), TX_OPTIONS);

  it("reports each kind with its season and group", async () => {
    const season = await makeSeason("ACTIVE", "GBV 2026");
    const admin = await makePerson("arf-admin");
    const leader = await makePerson("arf-leader");
    const student = await makePerson("arf-student", { graduationYear: null });
    const idle = await makePerson("arf-idle");
    await makeAdmin(admin.id, season.id);
    await makeLeader(leader.id, season.id, "Group B");
    await enrol(student.id, season.id);

    const roles = await rolesFor([admin.id, leader.id, student.id, idle.id]);
    const inSeason = { seasonId: season.id, seasonCode: season.code, seasonTitle: "GBV 2026" };
    expect(roles.get(admin.id)).toEqual({ kind: "admin", ...inSeason, groupName: null });
    expect(roles.get(leader.id)).toEqual({ kind: "leader", ...inSeason, groupName: "Group B" });
    expect(roles.get(student.id)).toEqual({ kind: "student", ...inSeason, groupName: null });
    expect(roles.has(idle.id)).toBe(false);
  });

  it("names a student's group", async () => {
    const season = await makeSeason();
    const student = await makePerson("arf-student-group", { graduationYear: null });
    const group = await db.group.create({ data: { seasonId: season.id, name: "Group C" } });
    await db.seasonEnrollment.create({
      data: { studentUserId: student.id, seasonId: season.id, groupId: group.id, status: "ACTIVE" },
    });
    expect((await rolesFor([student.id])).get(student.id)?.groupName).toBe("Group C");
  });

  it("admin wins over leader in one season", async () => {
    const season = await makeSeason();
    const person = await makePerson("arf-both");
    await makeLeader(person.id, season.id);
    await makeAdmin(person.id, season.id);
    expect((await rolesFor([person.id])).get(person.id)?.kind).toBe("admin");
  });

  it("ignores draft, finished and deleted seasons, and a withdrawn enrolment", async () => {
    const draft = await makeSeason("DRAFT");
    const completed = await makeSeason("COMPLETED");
    const archived = await makeSeason("ARCHIVED");
    const gone = await makeSeason("ACTIVE");
    const active = await makeSeason("ACTIVE");
    const person = await makePerson("arf-ignored");
    await makeAdmin(person.id, draft.id);
    await makeLeader(person.id, completed.id);
    await makeAdmin(person.id, archived.id);
    await makeAdmin(person.id, gone.id);
    await db.season.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    await enrol(person.id, active.id, "WITHDRAWN");
    expect((await rolesFor([person.id])).size).toBe(0);
  });

  it("returns nothing for an empty list", async () => {
    expect((await rolesFor([])).size).toBe(0);
  });
});

describe("describeActiveRole", () => {
  const role = (kind: ActiveRole["kind"]): ActiveRole => ({
    kind,
    seasonId: 1,
    seasonCode: "gbv-2026",
    seasonTitle: "GBV 2026",
    groupName: null,
  });

  it("says it in words", () => {
    expect(describeActiveRole("Mina", role("leader"))).toBe("Mina is already leading a group in GBV 2026");
    expect(describeActiveRole("Mina", role("admin"))).toBe("Mina is already an admin of GBV 2026");
    expect(describeActiveRole("Mina", role("student"))).toBe("Mina is already a student in GBV 2026");
  });
});

describe("lockPeople", () => {
  it("does nothing for an empty list", async () => {
    const spy = jest.fn();
    await lockPeople({ $queryRaw: spy } as unknown as Prisma.TransactionClient, []);
    expect(spy).not.toHaveBeenCalled();
  });
});

/** Rejects instead of waiting forever, so a failure can't hang the suite. */
async function within<T>(ms: number, label: string, work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out: ${label}`)), ms);
  });
  try {
    return await Promise.race([work, expiry]);
  } finally {
    clearTimeout(timer);
  }
}

describe("two concurrent seats", () => {
  // Between its check and its write each transaction waits this long. Without
  // the lock, both checks then see an empty person and both writes land.
  const CHECK_TO_WRITE_MS = 750;

  /**
   * Lock, read the person, check, write: the shape every seat write takes from
   * Task 3 on. The person row is read after the lock, so it can't be stale.
   */
  const takeAdminSeat = async (tx: Prisma.TransactionClient, userId: number, seat: Seat) => {
    await lockPeople(tx, [userId]);
    const person = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: PERSON_FIELDS });
    const active = (await activeRolesFor(tx, [person.id])).get(person.id);
    const refusal = await seatRefusal(tx, person, seat, active);
    if (refusal) return refusal;
    await new Promise((resolve) => setTimeout(resolve, CHECK_TO_WRITE_MS));
    await tx.seasonAdmin.create({ data: { userId: person.id, seasonId: seat.season.id } });
    return null;
  };

  it("two concurrent seats: exactly one wins", async () => {
    const first = await makeSeason("ACTIVE", "GBV 2026");
    const second = await makeSeason("ACTIVE", "GBV 2026");
    const person = await makePerson("race");

    let bothOpen!: () => void;
    const allOpen = new Promise<void>((resolve) => (bothOpen = resolve));
    let open = 0;

    const attempt = (season: { id: number; status: SeasonStatus }) =>
      db.$transaction(async (tx) => {
        // A blocked lock fails by itself rather than waiting out the suite.
        await tx.$executeRaw`SET LOCAL lock_timeout = '15s'`;
        // Neither touches the person until both transactions are really open.
        if (++open === 2) bothOpen();
        await within(15_000, "both transactions open", allOpen);
        return takeAdminSeat(tx, person.id, seatIn("admin", season));
      }, TX_OPTIONS);

    const outcomes = await within(45_000, "both seats settled", Promise.all([attempt(first), attempt(second)]));

    const refusals = outcomes.filter((o) => o !== null);
    expect(refusals).toEqual([{ code: "already_in_role", message: "Mina is already an admin of GBV 2026" }]);
    expect(
      await db.seasonAdmin.count({
        where: { userId: person.id, seasonId: { in: [first.id, second.id] } },
      }),
    ).toBe(1);
  });
});
