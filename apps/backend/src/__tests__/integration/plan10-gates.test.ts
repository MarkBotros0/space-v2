import { createApp } from "../../app";
import { db } from "../../db/client";
import type { SessionUser } from "../../lib/auth/tokens";
import {
  canCommentOnForumPost,
  canDeleteForumComment,
  canManageSessionVideo,
  forumAudienceFor,
  hasActiveEnrollment,
} from "../../lib/permissions";
import { newPublicId } from "../../lib/public-id";
import { createForum } from "./forum-setup";
import { cleanupTestData, createTestSeason, createTestUser } from "./fixtures";

jest.setTimeout(60000);
createApp(); // config side effects, same as the other suites

let seasonId: number;
let sessionId: number;
let groupAId: number;
let groupBId: number;
let assignmentId: number;
let partId: number;
let postSubmissionId: number;
let commentId: number;

let author: SessionUser;
let groupMate: SessionUser;
let outsider: SessionUser;
let dropped: SessionUser;
let leaderA: SessionUser;
let leaderB: SessionUser;
let admin: SessionUser;
let mentor: SessionUser;
let superUser: SessionUser;

function asUser(id: number, role: SessionUser["role"], overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    userId: id,
    role,
    seasonAdminIds: [],
    groupLeaderIds: [],
    activeSeasonId: null,
    graduationYear: null,
    ...overrides,
  } as SessionUser;
}

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const authorUser = await createTestUser("fauthor", "STUDENT");
  const mateUser = await createTestUser("fmate", "STUDENT");
  const outsiderUser = await createTestUser("foutsider", "STUDENT");
  const droppedUser = await createTestUser("fdropped", "STUDENT");
  const leaderAUser = await createTestUser("fleadera", "LEADER");
  const leaderBUser = await createTestUser("fleaderb", "LEADER");
  const adminUser = await createTestUser("fadmin", "ADMIN");
  const mentorUser = await createTestUser("fmentor", "MENTOR");
  const superRow = await createTestUser("fsuper", "SUPER");

  const groupA = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: leaderAUser.id } } },
    select: { id: true },
  });
  const groupB = await db.group.create({
    data: { seasonId, name: "Group B", leaders: { create: { userId: leaderBUser.id } } },
    select: { id: true },
  });
  groupAId = groupA.id;
  groupBId = groupB.id;

  await db.seasonAdmin.create({ data: { seasonId, userId: adminUser.id } });
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: authorUser.id, groupId: groupA.id, status: "ACTIVE" },
      { seasonId, studentUserId: mateUser.id, groupId: groupA.id, status: "ACTIVE" },
      { seasonId, studentUserId: outsiderUser.id, groupId: groupB.id, status: "ACTIVE" },
      { seasonId, studentUserId: droppedUser.id, groupId: groupA.id, status: "WITHDRAWN" },
    ],
  });

  const session = await db.session.create({
    data: {
      seasonId,
      title: "space-v2-test-video-session",
      startsAt: new Date("2099-03-01T18:00:00.000Z"),
      durationMinutes: 90,
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    },
    select: { id: true },
  });
  sessionId = session.id;

  const forum = await createForum(seasonId, "space-v2-test-forum-assignment", { minWords: 5, allowComments: true });
  assignmentId = forum.assignmentId;
  partId = forum.partId;

  const post = await seedForumWork(partId, authorUser.id, "SUBMITTED");
  postSubmissionId = post.id;

  const comment = await db.forumComment.create({
    data: { partWorkId: post.id, authorUserId: mateUser.id, body: "space-v2-test comment" },
    select: { id: true },
  });
  commentId = comment.id;

  author = asUser(authorUser.id, "STUDENT", { activeSeasonId: seasonId });
  groupMate = asUser(mateUser.id, "STUDENT", { activeSeasonId: seasonId });
  outsider = asUser(outsiderUser.id, "STUDENT", { activeSeasonId: seasonId });
  dropped = asUser(droppedUser.id, "STUDENT", { activeSeasonId: seasonId });
  leaderA = asUser(leaderAUser.id, "LEADER", { groupLeaderIds: [groupA.id] });
  leaderB = asUser(leaderBUser.id, "LEADER", { groupLeaderIds: [groupB.id] });
  admin = asUser(adminUser.id, "ADMIN", { seasonAdminIds: [seasonId] });
  mentor = asUser(mentorUser.id, "MENTOR");
  superUser = asUser(superRow.id, "SUPER");
});

afterAll(async () => {
  await cleanupTestData();
});

/** A student's text work on a part (a forum post unless the part says otherwise), with its assignment's Submission (made if missing). */
async function seedForumWork(forumPartId: number, studentUserId: number, status: "DRAFT" | "SUBMITTED") {
  const part = await db.assignmentPart.findUniqueOrThrow({
    where: { id: forumPartId },
    select: { assignmentId: true },
  });
  const submission = await db.submission.upsert({
    where: { assignmentId_studentUserId: { assignmentId: part.assignmentId, studentUserId } },
    create: { assignmentId: part.assignmentId, studentUserId, publicId: newPublicId() },
    update: {},
    select: { id: true },
  });
  return db.assignmentPartWork.create({
    data: {
      publicId: newPublicId(),
      partId: forumPartId,
      submissionId: submission.id,
      studentUserId,
      status,
      text: status === "DRAFT" ? null : "<p>space-v2-test post body</p>",
      submittedAt: status === "DRAFT" ? null : new Date(),
    },
    select: { id: true },
  });
}

describe("canManageSessionVideo", () => {
  it("admits SUPER and the season's ADMIN, and nobody else", async () => {
    expect(await canManageSessionVideo(superUser, sessionId)).toBe(true);
    expect(await canManageSessionVideo(admin, sessionId)).toBe(true);
    // v1's gate is season-scoped ADMIN + SUPER only — a group LEADER who runs
    // the session cannot author its questions, and a MENTOR who reads
    // everything cannot either.
    expect(await canManageSessionVideo(leaderA, sessionId)).toBe(false);
    expect(await canManageSessionVideo(mentor, sessionId)).toBe(false);
    expect(await canManageSessionVideo(author, sessionId)).toBe(false);
  });

  it("is false for a session that does not exist", async () => {
    expect(await canManageSessionVideo(admin, 987_654_321)).toBe(false);
  });
});

describe("hasActiveEnrollment", () => {
  it("requires an ACTIVE enrolment, not merely an enrolment row", async () => {
    // v1 gated answering on canAccessSeason, whose student branch accepts ANY
    // SeasonEnrollment row regardless of status, while the page that rendered
    // the player required status ACTIVE — so a dropped student failed the page
    // and passed the action (spec 13 R51 / D9).
    expect(await hasActiveEnrollment(author, seasonId)).toBe(true);
    expect(await hasActiveEnrollment(dropped, seasonId)).toBe(false);
  });

  it("is false for every non-student role", async () => {
    expect(await hasActiveEnrollment(admin, seasonId)).toBe(false);
    expect(await hasActiveEnrollment(superUser, seasonId)).toBe(false);
  });
});

describe("canCommentOnForumPost", () => {
  it("admits a group-mate, SUPER, the season ADMIN and the author's LEADER", async () => {
    expect(await canCommentOnForumPost(groupMate, postSubmissionId)).toBe(true);
    expect(await canCommentOnForumPost(superUser, postSubmissionId)).toBe(true);
    expect(await canCommentOnForumPost(admin, postSubmissionId)).toBe(true);
    // Widening, taken deliberately (spec 14 D3): in v1 LEADER falls through to
    // `return false`, so a leader cannot join the discussion of a group they
    // lead — an omission, not a policy.
    expect(await canCommentOnForumPost(leaderA, postSubmissionId)).toBe(true);
  });

  it("refuses another group's student, another group's leader, and a mentor", async () => {
    expect(await canCommentOnForumPost(outsider, postSubmissionId)).toBe(false);
    expect(await canCommentOnForumPost(leaderB, postSubmissionId)).toBe(false);
    // MENTOR stays read-only, consistent with their posture elsewhere.
    expect(await canCommentOnForumPost(mentor, postSubmissionId)).toBe(false);
  });

  it("refuses when the target is still a DRAFT (v1 R43)", async () => {
    // v1 read only `assignmentId` from the target, so a student who satisfied
    // the group and post-first rules could comment on a group-mate's unposted
    // draft by naming its sequential id.
    //
    // The draft's author is in groupMate's OWN group (A), so the group check
    // passes and the DRAFT rule is the only thing that can refuse — an
    // outsider's draft would be refused by the group mismatch and mask a
    // removed DRAFT check.
    const draftAuthorRow = await createTestUser("fdraftauthor", "STUDENT");
    await db.seasonEnrollment.create({
      data: { seasonId, studentUserId: draftAuthorRow.id, groupId: groupAId, status: "ACTIVE" },
    });
    const draft = await seedForumWork(partId, draftAuthorRow.id, "DRAFT");
    expect(await canCommentOnForumPost(groupMate, draft.id)).toBe(false);
    // Control: the same author's post, once SUBMITTED, is commentable — so the
    // refusal above is the DRAFT rule and nothing else.
    await db.assignmentPartWork.update({
      where: { id: draft.id },
      data: { status: "SUBMITTED", submittedAt: new Date(), text: "<p>space-v2-test</p>" },
    });
    expect(await canCommentOnForumPost(groupMate, draft.id)).toBe(true);
  });

  it("refuses when comments are switched off on the assignment", async () => {
    const quiet = await createForum(seasonId, "space-v2-test-quiet-forum", { allowComments: false });
    const post = await seedForumWork(quiet.partId, author.userId, "SUBMITTED");
    expect(await canCommentOnForumPost(groupMate, post.id)).toBe(false);
    expect(await canCommentOnForumPost(superUser, post.id)).toBe(false);
  });

  it("refuses a work that is not a forum post, and one that doesn't exist", async () => {
    const essayAssignment = await db.assignment.create({
      data: { seasonId, title: "space-v2-test-essay", parts: { create: { position: 0, kind: "ESSAY", prompt: "x" } } },
      select: { parts: { select: { id: true } } },
    });
    const essay = await seedForumWork(essayAssignment.parts[0]!.id, author.userId, "SUBMITTED");
    expect(await canCommentOnForumPost(superUser, essay.id)).toBe(false);
    expect(await canCommentOnForumPost(superUser, 987_654_321)).toBe(false);
  });
});

describe("canDeleteForumComment", () => {
  it("admits the author, SUPER, the season ADMIN and the post author's LEADER", async () => {
    expect(await canDeleteForumComment(groupMate, commentId)).toBe(true);
    expect(await canDeleteForumComment(superUser, commentId)).toBe(true);
    expect(await canDeleteForumComment(admin, commentId)).toBe(true);
    expect(await canDeleteForumComment(leaderA, commentId)).toBe(true);
  });

  it("refuses everyone else, including the post's own author", async () => {
    expect(await canDeleteForumComment(author, commentId)).toBe(false);
    expect(await canDeleteForumComment(outsider, commentId)).toBe(false);
    expect(await canDeleteForumComment(leaderB, commentId)).toBe(false);
    expect(await canDeleteForumComment(mentor, commentId)).toBe(false);
  });
});

describe("forumAudienceFor", () => {
  it("gives a student their own season group", async () => {
    expect(await forumAudienceFor(author, assignmentId)).toEqual({
      kind: "student",
      groupId: groupAId,
    });
  });

  it("refuses a student with no ACTIVE enrolment", async () => {
    expect(await forumAudienceFor(dropped, assignmentId)).toBeNull();
  });

  it("gives every season student their own group: no group targeting", async () => {
    expect(await forumAudienceFor(outsider, assignmentId)).toEqual({ kind: "student", groupId: groupBId });
  });

  it("is null for an assignment that is gone", async () => {
    expect(await forumAudienceFor(superUser, 987_654_321)).toBeNull();
  });

  it("gives a leader only the groups they lead in this season", async () => {
    expect(await forumAudienceFor(leaderA, assignmentId)).toEqual({
      kind: "staff",
      groupIds: [groupAId],
    });
    expect(await forumAudienceFor(leaderB, assignmentId)).toEqual({
      kind: "staff",
      groupIds: [groupBId],
    });
  });

  it("gives SUPER, the season ADMIN and a MENTOR every group", async () => {
    for (const staff of [superUser, admin, mentor]) {
      expect(await forumAudienceFor(staff, assignmentId)).toEqual({
        kind: "staff",
        groupIds: null,
      });
    }
  });
});
