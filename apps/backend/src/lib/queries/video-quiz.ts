import { parseYouTubeId } from "../../../../../packages/shared/src/index";
import { db } from "../../db/client";

export interface VideoQuizQuestionRow {
  id: number;
  atSeconds: number;
  prompt: string;
  options: string[];
  points: number;
  answered: boolean;
  selectedIndex: number | null;
  isCorrect: boolean | null;
}

export interface StudentVideoQuizData {
  seasonId: number;
  videoId: string | null;
  youtubeUrl: string | null;
  questions: VideoQuizQuestionRow[];
  furthestSeconds: number;
  completedAt: Date | null;
  earnedPoints: number;
  totalPoints: number;
  answeredCount: number;
  nextQuestionId: number | null;
}

/**
 * The student's view of a session's video quiz.
 *
 * The select list is the enforcement of the answer-key split: `correctIndex`
 * is not read here, so it cannot be forwarded by accident. v1's equivalent got
 * this right too (spec 13 R69) — what it lacked was any authorization, because
 * the only caller was a server component whose page had already checked
 * (R73). Behind an endpoint that gate has to exist, and it lives in the route.
 *
 * `nextQuestionId` is the barrier, derived once (ruling C4). v1 recomputed it
 * inside the player component and nowhere else, which is why the gate
 * evaporated the moment an API existed.
 */
export async function loadStudentVideoQuiz(
  sessionId: number,
  studentUserId: number,
): Promise<StudentVideoQuizData | null> {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true, youtubeUrl: true },
  });
  if (!session) return null;

  const [questions, responses, progress] = await Promise.all([
    db.sessionVideoQuestion.findMany({
      where: { sessionId },
      // atSeconds is indexed but NOT unique — two questions may share a
      // timestamp (spec 13 R13), so id is the tiebreak that makes "the next
      // question" a single deterministic answer on the server and the client.
      orderBy: [{ atSeconds: "asc" }, { id: "asc" }],
      select: { id: true, atSeconds: true, prompt: true, options: true, points: true },
    }),
    db.sessionVideoQuestionResponse.findMany({
      where: { studentUserId, question: { sessionId } },
      select: { questionId: true, selectedIndex: true, isCorrect: true },
    }),
    db.sessionVideoProgress.findUnique({
      where: { sessionId_studentUserId: { sessionId, studentUserId } },
      select: { furthestSeconds: true, completedAt: true },
    }),
  ]);

  const byQuestion = new Map(responses.map((r) => [r.questionId, r]));
  let earnedPoints = 0;
  let totalPoints = 0;
  let nextQuestionId: number | null = null;

  const rows: VideoQuizQuestionRow[] = questions.map((q) => {
    totalPoints += q.points;
    const r = byQuestion.get(q.id);
    if (r?.isCorrect) earnedPoints += q.points;
    if (r === undefined && nextQuestionId === null) nextQuestionId = q.id;
    return {
      id: q.id,
      atSeconds: q.atSeconds,
      prompt: q.prompt,
      options: q.options,
      points: q.points,
      answered: r !== undefined,
      selectedIndex: r?.selectedIndex ?? null,
      isCorrect: r?.isCorrect ?? null,
    };
  });

  return {
    seasonId: session.seasonId,
    // Resolved once, here. v1 parsed the URL in the page and handed the id to
    // the player; a React Native client re-implementing that parser is how the
    // two drift (spec 13 §7).
    videoId: session.youtubeUrl ? parseYouTubeId(session.youtubeUrl) : null,
    youtubeUrl: session.youtubeUrl,
    questions: rows,
    furthestSeconds: progress?.furthestSeconds ?? 0,
    completedAt: progress?.completedAt ?? null,
    earnedPoints,
    totalPoints,
    answeredCount: responses.length,
    nextQuestionId,
  };
}

export interface VideoQuizResultRowData {
  studentUserId: number;
  studentName: string | null;
  groupId: number | null;
  groupName: string | null;
  answeredCount: number;
  questionCount: number;
  earnedPoints: number;
  totalPoints: number;
  completedAt: Date | null;
}

export interface VideoQuizResultsData {
  questionCount: number;
  totalPoints: number;
  rows: VideoQuizResultRowData[];
}

/**
 * Who answered what on a session's video quiz.
 *
 * A new capability: v1 renders no student's video-quiz result anywhere, for any
 * role. The only aggregate it shows is `responseCount` per question, which
 * counts answers rather than correct ones and is not broken down by student
 * (spec 13 R74/R76). The data has always been there, one grouped query away.
 *
 * The population is `SeasonEnrollment`, not "whoever has a response row", so a
 * student who has answered nothing still appears — the same rule the assignment
 * tracker uses, and the reason a leader can see who has not started.
 * `restrictToGroupIds` narrows the roster for a leader; the rows carry names.
 */
export async function loadVideoQuizResults(
  sessionId: number,
  restrictToGroupIds?: number[],
): Promise<VideoQuizResultsData | null> {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true },
  });
  if (!session) return null;

  const questions = await db.sessionVideoQuestion.findMany({
    where: { sessionId },
    select: { id: true, points: true },
  });
  const pointsByQuestion = new Map(questions.map((q) => [q.id, q.points]));
  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);

  const enrollments = await db.seasonEnrollment.findMany({
    where: {
      seasonId: session.seasonId,
      status: "ACTIVE",
      ...(restrictToGroupIds ? { groupId: { in: restrictToGroupIds } } : {}),
    },
    select: {
      studentUserId: true,
      groupId: true,
      group: { select: { name: true } },
      studentUser: { select: { name: true } },
    },
  });
  const studentIds = enrollments.map((e) => e.studentUserId);

  const [responses, progress] = await Promise.all([
    db.sessionVideoQuestionResponse.findMany({
      where: { question: { sessionId }, studentUserId: { in: studentIds } },
      select: { studentUserId: true, questionId: true, isCorrect: true },
    }),
    db.sessionVideoProgress.findMany({
      where: { sessionId, studentUserId: { in: studentIds } },
      select: { studentUserId: true, completedAt: true },
    }),
  ]);

  const tally = new Map<number, { answered: number; earned: number }>();
  for (const r of responses) {
    const entry = tally.get(r.studentUserId) ?? { answered: 0, earned: 0 };
    entry.answered += 1;
    if (r.isCorrect) entry.earned += pointsByQuestion.get(r.questionId) ?? 0;
    tally.set(r.studentUserId, entry);
  }
  const completedBy = new Map(progress.map((p) => [p.studentUserId, p.completedAt]));

  return {
    questionCount: questions.length,
    totalPoints,
    rows: enrollments
      .map((e) => {
        const entry = tally.get(e.studentUserId) ?? { answered: 0, earned: 0 };
        return {
          studentUserId: e.studentUserId,
          studentName: e.studentUser.name,
          groupId: e.groupId,
          groupName: e.group?.name ?? null,
          answeredCount: entry.answered,
          questionCount: questions.length,
          earnedPoints: entry.earned,
          totalPoints,
          completedAt: completedBy.get(e.studentUserId) ?? null,
        };
      })
      .sort((a, b) => (a.studentName ?? "").localeCompare(b.studentName ?? "")),
  };
}
