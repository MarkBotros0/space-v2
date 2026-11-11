/** The quiz builder's fixtures: an online draft with a single choice and an essay question. */
export const adminSession = {
  user: { id: 2, name: "Test admin", email: "a@jpc.test", role: "ADMIN" as const, avatarPath: null, hasPassword: true },
  scopes: { seasonAdminIds: [7], groupLeaderIds: [], activeSeasonId: null, graduationYear: null },
};

export const mcq = {
  id: 100,
  order: 0,
  type: "SINGLE_CHOICE" as const,
  prompt: "Capital of France?",
  points: 2,
  options: [
    { id: 1, label: "London", isCorrect: false },
    { id: 2, label: "Paris", isCorrect: true },
  ],
};
export const essay = {
  id: 101,
  order: 1,
  type: "ESSAY" as const,
  prompt: "Discuss.",
  points: 5,
};

export function authoring(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 41,
    title: "Week 1 quiz",
    kind: "ONLINE",
    seasonId: 7,
    seasonCode: "s26",
    sessionId: 12,
    sessionTitle: "Week 1",
    publishedAt: null,
    maxScore: 7,
    attemptCount: 0,
    gradeCount: 0,
    canEditStructure: true,
    canManage: true,
    answersReleasedAt: null,
    canReleaseResults: true,
    shuffleQuestions: true,
    startsFrom: null,
    startsUntil: null,
    timeLimitMinutes: null,
    questions: [mcq, essay],
    ...over,
  };
}
