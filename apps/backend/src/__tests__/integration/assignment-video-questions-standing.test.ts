import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { createAssignmentWithParts, seedVideoWork, setSubmitted } from "./assignment-reads-setup";
import { cleanupTestData } from "./fixtures";
import { seedSubmissionFixtures, type SubmissionFixtures } from "./submissions-setup";

/*
 * Ruling (I1): adding or deleting a video part's timed question changes what
 * "done" means for the video, so it settles every student's standing under the
 * assignment's lock: the part's doneAt is recomputed, a submitted student now
 * short of a part is reopened, and one it finishes is complete.
 */

jest.setTimeout(60000);

const app = createApp();

let f: SubmissionFixtures;

beforeAll(async () => {
  f = await seedSubmissionFixtures(app);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

const question = {
  atSeconds: 30,
  prompt: "Who ran to meet him?",
  options: ["The father", "The brother"],
  correctIndex: 0,
};

function standing(assignmentId: number, partId: number) {
  return Promise.all([
    db.submission.findUniqueOrThrow({
      where: { assignmentId_studentUserId: { assignmentId, studentUserId: f.studentUserId } },
      select: { submittedAt: true, completedAt: true },
    }),
    db.assignmentPartWork.findUniqueOrThrow({
      where: { partId_studentUserId: { partId, studentUserId: f.studentUserId } },
      select: { doneAt: true },
    }),
  ]);
}

/** A video-only assignment the student watched, answered and submitted (so complete). */
async function finishedVideo(title: string, questions: number, answered: number) {
  const a = await createAssignmentWithParts({ seasonId: f.seasonId, title }, [
    { kind: "VIDEO", durationSeconds: 600, questions },
  ]);
  const partId = a.partIds[0]!;
  await seedVideoWork(a.id, partId, f.studentUserId, 600, { answered });
  const at = new Date(Date.now() - 60_000);
  await setSubmitted(a.id, f.studentUserId, at);
  await db.submission.update({
    where: { assignmentId_studentUserId: { assignmentId: a.id, studentUserId: f.studentUserId } },
    data: { completedAt: at },
  });
  await db.assignmentPartWork.update({
    where: { partId_studentUserId: { partId, studentUserId: f.studentUserId } },
    data: { doneAt: answered >= questions ? at : null },
  });
  return { assignmentId: a.id, partId };
}

describe("a video part's timed questions settle the students' standing", () => {
  it("adding a question reopens a student who had submitted", async () => {
    const { assignmentId, partId } = await finishedVideo("Question added", 1, 1);

    const res = await request(app)
      .post(`/api/v1/assignments/${assignmentId}/parts/${partId}/video-questions`)
      .set(auth(f.adminToken))
      .send(question);
    expect(res.status).toBe(201);

    const [sub, work] = await standing(assignmentId, partId);
    expect(sub).toEqual({ submittedAt: null, completedAt: null });
    expect(work.doneAt).toBeNull();
  });

  it("deleting the last unanswered question completes a submitted student", async () => {
    const { assignmentId, partId } = await finishedVideo("Question deleted", 2, 1);
    // The stale state: submitted, yet one question short.
    await db.submission.update({
      where: { assignmentId_studentUserId: { assignmentId, studentUserId: f.studentUserId } },
      data: { completedAt: null },
    });
    const unanswered = await db.sessionVideoQuestion.findFirstOrThrow({
      where: { assignmentPartId: partId, responses: { none: {} } },
      select: { id: true },
    });

    const res = await request(app).delete(`/api/v1/video-questions/${unanswered.id}`).set(auth(f.adminToken));
    expect(res.status).toBe(200);

    const [sub, work] = await standing(assignmentId, partId);
    expect(sub.submittedAt).not.toBeNull();
    expect(sub.completedAt).not.toBeNull();
    expect(work.doneAt).not.toBeNull();
  });

  it("an added question past the end of the video is still refused, and nothing changes", async () => {
    const { assignmentId, partId } = await finishedVideo("Question too late", 1, 1);
    const res = await request(app)
      .post(`/api/v1/assignments/${assignmentId}/parts/${partId}/video-questions`)
      .set(auth(f.adminToken))
      .send({ ...question, atSeconds: 600 });
    expect(res.status).toBe(400);
    const [sub] = await standing(assignmentId, partId);
    expect(sub.completedAt).not.toBeNull();
  });
});
