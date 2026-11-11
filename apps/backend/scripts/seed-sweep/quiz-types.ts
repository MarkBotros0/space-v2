import type { QuizAnswerInput } from "../../../../packages/shared/src/index";
import { db } from "../../src/db/client";
import { submitAnswers, saveAnswers } from "../../src/lib/quizzes/attempts";
import { gradeAttempt } from "../../src/lib/quizzes/grading";
import { isLeaderMarked, MARKABLE_QUESTION_SELECT, toMarkable } from "../../src/lib/quizzes/marking";
import { addQuizQuestion } from "../../src/lib/quizzes/questions";
import type { QuizQuestionRequest } from "../../src/lib/quizzes/question-rows";
import type { SweepPeople } from "./people";
import { fromToday } from "./shared";

/*
 * Online quizzes with every question type, Arabic and mixed Arabic/English content, for the UI
 * sweep (s06 student, s16 leader, s26 admin). Built through the backend's own services
 * (addQuizQuestion, saveAnswers, submitAnswers, gradeAttempt), so the rows are exactly what
 * the app writes. Each quiz holds one state the sweep flows look at without writing:
 *
 *   "مراجعة الأسبوع الثالث"  student IN_PROGRESS (an answer of every type, some unfinished);
 *                            classmate SUBMITTED, blanks and essay waiting for the leader
 *   "Week 1 review"          student GRADED, answers held (score only)
 *   "مراجعة الافتتاح"         student GRADED, answers released (the review)
 *   "Week 3 reading"         student SUBMITTED, waiting for marks
 *   "مسودة الأسبوع الرابع"    a draft with no attempts, so the admin's editors are open
 */

const BLANK = "{{blank}}";

/** The seven questions every sweep quiz carries: one of each type, plus an English prompt with Arabic options. */
const QUESTIONS: QuizQuestionRequest[] = [
  {
    type: "SINGLE_CHOICE",
    prompt: "أين نلتقي في الأسبوع الثالث؟",
    points: 1,
    options: [
      { label: "القاعة أ", isCorrect: true },
      { label: "القاعة ب", isCorrect: false },
      { label: "أونلاين على Zoom", isCorrect: false },
    ],
  },
  {
    type: "MULTI_CHOICE",
    prompt: "اختر الرسائل التي كتبها بولس الرسول:",
    points: 2,
    options: [
      { label: "رومية", isCorrect: true },
      { label: "رسالة يعقوب", isCorrect: false },
      { label: "غلاطية", isCorrect: true },
      { label: "بطرس الأولى", isCorrect: false },
      { label: "فيلبي", isCorrect: true },
    ],
  },
  {
    type: "TRUE_FALSE",
    prompt: "تبدأ الجلسة الساعة 7 مساءً وتستمر 90 دقيقة.",
    points: 1,
    correct: true,
  },
  {
    type: "MATCHING",
    prompt: "صِل كل سفر بكاتبه:",
    points: 4,
    pairs: [
      { left: "أعمال الرسل", right: "لوقا" },
      { left: "رومية", right: "بولس" },
      { left: "سفر الرؤيا", right: "يوحنا" },
      { left: "رسالة يعقوب", right: "يعقوب أخو الرب" },
      { left: "الرسالة الأولى إلى أهل كورنثوس", right: "بولس وسوستانيس" },
    ],
  },
  {
    type: "FILL_BLANK",
    prompt: `قال يسوع: «أنا هو ${BLANK} والحق و${BLANK}. ليس أحد يأتي إلى الآب إلا بي» (يوحنا 14:6).`,
    points: 2,
    answers: ["الطريق", "الحياة"],
  },
  {
    type: "SINGLE_CHOICE",
    prompt: "Which verse did we memorise in Week 2?",
    points: 1,
    options: [
      { label: "يوحنا 3:16", isCorrect: false },
      { label: "John 14:6 (يوحنا 14:6)", isCorrect: true },
      { label: "مزمور 23", isCorrect: false },
    ],
  },
  {
    type: "ESSAY",
    prompt: "اكتب في سطرين: ماذا تعلّمت من جلسة Week 3؟",
    points: 2,
  },
];

/** What a student picked, by label, one entry per question of QUESTIONS (undefined: left alone). */
type Pick =
  | { single: string }
  | { multi: string[] }
  | { tf: boolean }
  | { pairs: [string, string][] }
  | { blanks: string[] }
  | { essay: string };

/** A whole, mostly right attempt. */
const MOSTLY_RIGHT: Pick[] = [
  { single: "القاعة أ" },
  { multi: ["رومية", "غلاطية", "رسالة يعقوب"] },
  { tf: true },
  {
    pairs: [
      ["أعمال الرسل", "لوقا"],
      ["رومية", "بولس"],
      ["سفر الرؤيا", "يوحنا"],
      ["رسالة يعقوب", "بولس وسوستانيس"],
      ["الرسالة الأولى إلى أهل كورنثوس", "يعقوب أخو الرب"],
    ],
  },
  { blanks: ["الطريق", "الحيوة"] },
  { single: "يوحنا 3:16" },
  { essay: "تعلّمت أن الصلاة ليست طلبات فقط، بل علاقة. وأحببت جزء الـ worship في البداية." },
];

/** An open attempt: something of every type, but not finished (Choose N part-ticked, pairs and a blank missing). */
const UNFINISHED: (Pick | undefined)[] = [
  { single: "القاعة أ" },
  { multi: ["رومية", "غلاطية"] },
  { tf: false },
  {
    pairs: [
      ["أعمال الرسل", "لوقا"],
      ["رومية", "بولس"],
    ],
  },
  { blanks: ["الطريق", ""] },
  undefined,
  { essay: "تعلّمت أن أصلّي مع المجموعة كل Tuesday." },
];

type StoredQuestion = {
  id: number;
  type: string;
  quizOptions: { id: number; label: string; side: string | null }[];
  quizBlanks: { id: number; position: number }[];
};

function optionId(q: StoredQuestion, label: string, side: string | null = null): number {
  const o = q.quizOptions.find((x) => x.label === label && x.side === side);
  if (!o) throw new Error(`seed-sweep: no option "${label}" on question ${q.id}`);
  return o.id;
}

function toInput(q: StoredQuestion, pick: Pick): QuizAnswerInput {
  const questionId = q.id;
  if ("single" in pick) return { type: "SINGLE_CHOICE", questionId, optionId: optionId(q, pick.single) };
  if ("tf" in pick) return { type: "TRUE_FALSE", questionId, optionId: optionId(q, pick.tf ? "True" : "False") };
  if ("multi" in pick) return { type: "MULTI_CHOICE", questionId, optionIds: pick.multi.map((l) => optionId(q, l)) };
  if ("pairs" in pick) {
    const pairs = pick.pairs.map(([l, r]) => ({ leftId: optionId(q, l, "LEFT"), rightId: optionId(q, r, "RIGHT") }));
    return { type: "MATCHING", questionId, pairs };
  }
  if ("blanks" in pick) {
    const blanks = [...q.quizBlanks]
      .sort((a, b) => a.position - b.position)
      .map((b, i) => ({ blankId: b.id, text: pick.blanks[i] ?? "" }));
    return { type: "FILL_BLANK", questionId, blanks };
  }
  return { type: "ESSAY", questionId, text: pick.essay };
}

async function createQuiz(
  { admin, season }: SweepPeople,
  title: string,
  questions: QuizQuestionRequest[],
  published = true,
): Promise<{ id: number; questions: StoredQuestion[] }> {
  const quiz = await db.quiz.create({
    data: {
      seasonId: season.id,
      title,
      kind: "ONLINE",
      maxScore: 0,
      // In the authored order, so a flow finds each type where it expects it.
      shuffleQuestions: false,
      publishedAt: published ? fromToday(-2) : null,
      createdById: admin.id,
    },
  });
  for (const q of questions) await addQuizQuestion(quiz.id, q);
  const stored = await db.quizQuestion.findMany({
    where: { quizId: quiz.id },
    orderBy: { order: "asc" },
    select: {
      id: true,
      type: true,
      quizOptions: { select: { id: true, label: true, side: true } },
      quizBlanks: { select: { id: true, position: true } },
    },
  });
  return { id: quiz.id, questions: stored };
}

/** Starts an attempt and saves the picks; a fixed shuffle seed keeps each run's option order the same. */
async function attempt(
  quiz: { id: number; questions: StoredQuestion[] },
  studentUserId: number,
  picks: (Pick | undefined)[],
) {
  const row = await db.quizAttempt.create({
    data: { quizId: quiz.id, studentUserId, shuffleSeed: 424242, createdAt: fromToday(-1, 17) },
  });
  const answers = quiz.questions.flatMap((q, i) => {
    const pick = picks[i];
    return pick ? [toInput(q, pick)] : [];
  });
  if (answers.length > 0) await saveAnswers(row.id, answers);
  return row.id;
}

/** Submits, then (with `marks`) the leader marks every blank and essay: right unless listed in `wrong`. */
async function submitAndMark(quizId: number, attemptId: number, markedById: number | null, wrongBlanks: string[] = []) {
  await submitAnswers(quizId, attemptId);
  if (markedById === null) return;
  const rows = await db.quizQuestion.findMany({ where: { quizId }, select: MARKABLE_QUESTION_SELECT });
  const leaderQuestions = rows.map(toMarkable).filter((q) => isLeaderMarked(q.type));
  const typed = await db.quizAnswerBlank.findMany({
    where: { answer: { attemptId } },
    select: { blankId: true, text: true },
  });
  type Mark = { questionId: number; blankId: number | null; correct: boolean };
  const marks = leaderQuestions.flatMap((q): Mark[] =>
    q.type === "ESSAY"
      ? [{ questionId: q.id, blankId: null, correct: true }]
      : q.blanks.map((b) => ({
          questionId: q.id,
          blankId: b.id,
          correct: !wrongBlanks.includes(typed.find((t) => t.blankId === b.id)?.text ?? ""),
        })),
  );
  await gradeAttempt(quizId, attemptId, marks, markedById);
  // A fixed time of day, so the sweep's shots don't change from run to run.
  await db.quizAttempt.update({ where: { id: attemptId }, data: { gradedAt: fromToday(0, 9) } });
}

/** The question-type quizzes and the attempt states the sweep flows look at. */
export async function seedQuizTypes(people: SweepPeople): Promise<void> {
  const { admin, leader, student, classmate } = people;

  const open = await createQuiz(people, "مراجعة الأسبوع الثالث", QUESTIONS);
  await attempt(open, student.id, UNFINISHED);
  await submitAndMark(open.id, await attempt(open, classmate.id, MOSTLY_RIGHT), null);

  const held = await createQuiz(people, "Week 1 review", QUESTIONS);
  await submitAndMark(held.id, await attempt(held, student.id, MOSTLY_RIGHT), leader.id, ["الحيوة"]);

  const released = await createQuiz(people, "مراجعة الافتتاح", QUESTIONS);
  await submitAndMark(released.id, await attempt(released, student.id, MOSTLY_RIGHT), leader.id, ["الحيوة"]);
  await db.quiz.update({
    where: { id: released.id },
    data: { resultsReleasedAt: fromToday(0, 10), resultsReleasedById: admin.id },
  });

  const reading = await createQuiz(people, "Week 3 reading", [QUESTIONS[0]!, QUESTIONS[4]!, QUESTIONS[6]!]);
  const readingPicks = [MOSTLY_RIGHT[0], MOSTLY_RIGHT[4], MOSTLY_RIGHT[6]];
  await submitAndMark(reading.id, await attempt(reading, student.id, readingPicks), null);

  await createQuiz(people, "مسودة الأسبوع الرابع", QUESTIONS, false);
}
