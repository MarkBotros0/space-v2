// Shared by the season-end screen suites.

export const detail = (over: Record<string, unknown> = {}) => ({
  id: 7,
  code: "gbv-2026",
  title: "GBV 2026",
  program: "GBV",
  year: 2026,
  status: "ACTIVE",
  startDate: "2026-01-01T00:00:00.000Z",
  endDate: "2026-06-30T00:00:00.000Z",
  description: null,
  sessionCount: 0,
  studentCount: 84,
  absenceBudgetMinutes: 180,
  absenceWeightMinutes: 90,
  canAdminister: true,
  groups: [],
  ...over,
});

export const subs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    publicId: `pub${i}`,
    assignmentTitle: `Essay ${i}`,
    studentName: `Student ${i}`,
  }));
export const students = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    userId: i + 1,
    name: `Student ${i + 1}`,
    groupName: "Group A",
    attendancePct: 90,
    graduationYear: null as number | null,
    numbers: {
      attendance: { attended: 0, total: 0 },
      assignments: { submitted: 0, total: 0 },
      quizzes: { scored: 0, max: 0 },
    },
  }));
export const check = (
  blockers: Partial<{ submissions: unknown[]; quizAttempts: unknown[]; attendance: unknown[] }>,
  n = 3,
  graduatesOnPass = false,
) => ({
  graduatesOnPass,
  criteria: { weights: { attendance: 40, assignments: 30, quizzes: 30 }, passMark: 60 },
  isDefault: true,
  available: { attendance: false, assignments: false, quizzes: false },
  blockers: { submissions: [], quizAttempts: [], attendance: [], ...blockers },
  students: students(n),
});

/** `GET /seasons/:id/results` for GBV 2026: `criteria` null reads as a season ended before weighted passing. */
export const resultsBody = (results: Record<string, unknown>[], over: Record<string, unknown> = {}) => ({
  season: { id: 7, code: "gbv-2026", title: "GBV 2026", year: 2026, graduatesOnPass: false },
  criteria: null,
  results,
  ...over,
});

/** The End POST for these students: the default criteria, and no score for anyone (nothing to count). */
export const endBody = (
  notPassed: { userId: number; reason: string | null }[],
  reviewed: { graduatesOnPass: boolean; userIds: number[] },
) => ({
  notPassed,
  passedNotes: [],
  weights: { attendance: 40, assignments: 30, quizzes: 30 },
  passMark: 60,
  reviewed: { ...reviewed, scores: reviewed.userIds.map((userId) => ({ userId, score: null })) },
});

const numbers = (attended: number, sessions: number, submitted: number, assignments: number, scored: number) => ({
  attendance: { attended, total: sessions },
  assignments: { submitted, total: assignments },
  quizzes: { scored, max: assignments === 0 && scored === 0 ? 0 : 10 },
});

/**
 * Three students on a season with something to count (criteria 40/30/30, mark 60): Mina on track
 * (72.5), Nour below the mark (33.5), Sara with no sessions of her own (75.0, re-scaled).
 */
export const scoredCheck = (over: Record<string, unknown> = {}) => ({
  ...check({}, 0),
  isDefault: false,
  available: { attendance: true, assignments: true, quizzes: true },
  students: [
    { ...students(1)[0]!, userId: 1, name: "Mina", numbers: numbers(8, 10, 3, 4, 6) },
    { ...students(1)[0]!, userId: 2, name: "Nour", numbers: numbers(5, 10, 1, 4, 2) },
    { ...students(1)[0]!, userId: 3, name: "Sara", numbers: numbers(0, 0, 4, 4, 5) },
  ],
  ...over,
});
