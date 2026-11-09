// Row builders shared by the calendar-screen*.test.tsx suites.
import { makeSession } from "./session";

export const session = (id: number, title: string, startsAt: string, dayKey: string) => ({
  id,
  title,
  startsAt,
  dayKey,
  durationMinutes: 60,
  location: null,
  recurrenceGroupId: null,
  attendanceMarked: false,
  seasonId: 7,
  seasonCode: "S26",
  seasonTitle: "Spring 2026",
  checkInToken: null,
  checkInOpenAt: null,
  checkInClosedAt: null,
  startTime: "20:00",
});

export const seasonRow = (id: number, year: number, status: "DRAFT" | "ACTIVE") => ({
  id,
  code: `S${id}`,
  title: `Season ${id}`,
  program: "TEST",
  year,
  status,
  startDate: `${year}-01-01T00:00:00.000Z`,
  endDate: `${year}-12-31T00:00:00.000Z`,
});

export const studentSession = makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 });

export const eventRow = (id: number, title: string, date: string, dayKey: string, time: string | null) => ({
  id,
  title,
  date,
  endDate: null,
  dayKey,
  endDayKey: null,
  isPast: false,
  time,
  allDay: time === null,
  url: null,
  visibility: "ALL" as const,
  seasonId: null,
  seasonCode: null,
});
