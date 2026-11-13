/*
 * Ruling (I3): "the next session" is the first session of the season starting
 * after the assignment was published (createdAt), never after now. A reminder
 * whose anchor session has passed stays off even once a later session exists,
 * and the Details line says why truthfully.
 */
type SessionWhere = { seasonId: number; startsAt: { gt: Date } };

const mockSessions: { seasonId: number; startsAt: Date }[] = [];
const mockAssignments: Record<string, unknown>[] = [];
const mockUpdates: unknown[] = [];

function mockMatching(where: SessionWhere) {
  return mockSessions
    .filter((s) => s.seasonId === where.seasonId && s.startsAt > where.startsAt.gt)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

jest.mock("../db/client", () => ({
  db: {
    session: {
      findFirst: async ({ where }: { where: SessionWhere }) => mockMatching(where)[0] ?? null,
      findMany: async ({ where }: { where: SessionWhere }) => mockMatching(where),
    },
    assignment: {
      findMany: async () => mockAssignments,
      updateMany: async (args: unknown) => {
        mockUpdates.push(args);
        return { count: 1 };
      },
    },
  },
}));

import { describeReminder, refreshSeasonReminders, resolveRemindAt } from "../lib/assignments/reminder";

// The org clock is Africa/Cairo: UTC+2 in November 2025 (Mon 10 Nov 2025).
const PUBLISHED = new Date("2025-11-10T10:00:00.000Z"); // Mon
const TUE_SESSION = new Date("2025-11-11T16:00:00.000Z"); // Tue 18:00 Cairo: 2 days before is past
const NEXT_TUE_SESSION = new Date("2025-11-18T16:00:00.000Z");
const WED = new Date("2025-11-12T10:00:00.000Z"); // the anchor session has passed

const subject = {
  id: 7,
  seasonId: 1,
  createdAt: PUBLISHED,
  dueAt: null,
  reminderEnabled: true,
  reminderDays: 2,
  reminderAnchor: "NEXT_SESSION" as const,
  reminderTime: "09:00",
  remindAt: null,
  remindedAt: null,
};

beforeEach(() => {
  mockSessions.length = 0;
  mockAssignments.length = 0;
  mockUpdates.length = 0;
});

describe("the reminder's anchor is the first session after publication", () => {
  it("the anchor session has passed and a later one exists: still no reminder, and the line says it was too close", async () => {
    mockSessions.push({ seasonId: 1, startsAt: TUE_SESSION }, { seasonId: 1, startsAt: NEXT_TUE_SESSION });

    expect(await resolveRemindAt(subject, WED)).toBeNull();
    expect(await describeReminder(subject)).toBe("No reminder: the next session was too close");

    // A session write in the season re-resolves nothing for it either.
    mockAssignments.push(subject);
    expect(await refreshSeasonReminders(1, WED)).toBe(0);
    expect(mockUpdates).toEqual([]);
  });

  it("no session after it was published says so, even when one came before", async () => {
    mockSessions.push({ seasonId: 1, startsAt: new Date("2025-11-09T16:00:00.000Z") });
    expect(await describeReminder(subject)).toBe("No reminder: no session after it was published");
  });

  it("a session added later, after publication and far enough ahead, sets the reminder", async () => {
    mockSessions.push({ seasonId: 1, startsAt: NEXT_TUE_SESSION });
    mockAssignments.push(subject);
    expect(await refreshSeasonReminders(1, WED)).toBe(1);
    expect(mockUpdates).toEqual([
      expect.objectContaining({ data: { remindAt: new Date("2025-11-16T07:00:00.000Z") } }),
    ]);
  });
});
