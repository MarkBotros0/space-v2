import { db } from "../../src/db/client";
import { reminderBody } from "../../src/lib/assignments/reminder";
import { notificationLink } from "../../src/lib/notification-target";
import { markSubmitted, seedTextWork, seedVideoWork } from "./assignment-work";
import type { SweepPeople } from "./people";
import { fromToday } from "./shared";

/**
 * A placeholder video: no JPC talk is in the repo, and this is the one id the app's tests already
 * use (a music video, not a talk), so the part is titled as a placeholder rather than as a talk.
 * Its length is not confirmed offline; 213 s is approximate, so the player may report a slightly
 * different length than the seed.
 */
const VIDEO_ID = "dQw4w9WgXcQ";
const VIDEO_SECONDS = 213;

/** The sweep flows open this assignment by id (`spacev2://assignment/3`). */
const FLOW_ASSIGNMENT_ID = 3;

/**
 * One assignment of three parts (video, essay, forum) for the multi-part sweep flows
 * (student-scenarios/s60, admin-scenarios/s58, leader-scenarios/s59). The student is
 * part-way: the video partly watched, the essay a short draft, the forum not posted, so
 * every part screen shows work in progress and Submit stays locked. The classmate has
 * finished and submitted, so the leader's progress has both halves and the queue an essay.
 */
export async function seedThreePartAssignment({
  admin,
  leader,
  student,
  classmate,
  season,
}: Pick<SweepPeople, "admin" | "leader" | "student" | "classmate" | "season">) {
  const assignment = await db.assignment.create({
    data: {
      seasonId: season.id,
      title: "The lost son",
      description: "<p>Watch the talk, write about it, then share one takeaway with your group.</p>",
      dueAt: fromToday(5),
      createdById: admin.id,
      parts: {
        create: [
          {
            position: 0,
            kind: "VIDEO",
            title: "Placeholder video",
            youtubeId: VIDEO_ID,
            youtubeUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
            durationSeconds: VIDEO_SECONDS,
            blockSkipping: true,
          },
          { position: 1, kind: "ESSAY", prompt: "Who are you in the story, and why?", minWords: 50, maxWords: 300 },
          {
            position: 2,
            kind: "FORUM",
            prompt: "Share one takeaway with your group.",
            minWords: 5,
            postToRead: true,
            allowComments: true,
          },
        ],
      },
    },
    select: { id: true, parts: { orderBy: { position: "asc" }, select: { id: true } } },
  });
  if (assignment.id !== FLOW_ASSIGNMENT_ID) {
    throw new Error(
      `seed-sweep: "The lost son" is assignment ${assignment.id}, but the sweep flows open ` +
        `assignment ${FLOW_ASSIGNMENT_ID}; seed it in the old order or update the flows.`,
    );
  }
  const [video, essay, forum] = assignment.parts.map((p) => p.id);
  if (video === undefined || essay === undefined || forum === undefined) {
    throw new Error("seed-sweep: the three-part assignment needs its three parts");
  }
  const question = await db.sessionVideoQuestion.create({
    data: {
      assignmentPartId: video,
      atSeconds: 60,
      prompt: "Who tells this story?",
      options: ["Jesus", "Paul", "Peter"],
      correctIndex: 0,
      createdById: admin.id,
    },
  });

  // The student, part-way through.
  const id = assignment.id;
  await seedVideoWork({
    assignmentId: id,
    partId: video,
    studentUserId: student.id,
    seconds: 90,
    durationSeconds: VIDEO_SECONDS,
    at: fromToday(-1),
  });
  await seedTextWork({
    assignmentId: id,
    partId: essay,
    studentUserId: student.id,
    text: "I think I am the older brother. I stayed close, but I kept count of what I was owed.",
    status: "DRAFT",
  });

  // The classmate, finished and submitted: their essay waits for review.
  const at = fromToday(-1, 10);
  await seedVideoWork({
    assignmentId: id,
    partId: video,
    studentUserId: classmate.id,
    seconds: VIDEO_SECONDS,
    durationSeconds: VIDEO_SECONDS,
    at,
  });
  await db.sessionVideoQuestionResponse.create({
    data: { questionId: question.id, studentUserId: classmate.id, selectedIndex: 0, isCorrect: true, answeredAt: at },
  });
  const handedIn = await seedTextWork({
    assignmentId: id,
    partId: essay,
    studentUserId: classmate.id,
    text: Array.from(
      { length: 6 },
      () => "The younger son came home expecting to be a servant, and the father ran to meet him instead.",
    ).join(" "),
    status: "SUBMITTED",
    submittedAt: at,
  });
  await seedTextWork({
    assignmentId: id,
    partId: forum,
    studentUserId: classmate.id,
    text: "Grace runs out to meet us before we finish our speech.",
    status: "SUBMITTED",
    submittedAt: at,
  });
  await markSubmitted(id, classmate.id, at);
  // The leader is told of the hand-in, as Submit does; the student got the reminder.
  await db.notification.createMany({
    data: [
      {
        userId: leader.id,
        type: "SUBMISSION_RECEIVED",
        title: "Salma Student submitted The lost son",
        link: notificationLink.leaderSubmission(handedIn.publicId),
      },
      {
        userId: student.id,
        type: "ASSIGNMENT_REMINDER",
        title: "Reminder: The lost son",
        // As the scheduler words it: all three parts are left, and it is sent (remindAt) at
        // 9:00 Cairo (07:00 UTC) two days before "Week 2: Calling" (activity.ts, in 7 days).
        body: reminderBody(3, fromToday(5, 7), 2),
        link: notificationLink.studentAssignment(id),
      },
    ],
  });
  return { id, video, essay, forum };
}
