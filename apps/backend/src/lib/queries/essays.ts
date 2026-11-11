import { db } from "../../db/client";
import { liveAssignment } from "../db/live";

/**
 * One student's essay by its work's publicId, with what the gates and the
 * writes need: the author, the status (a DRAFT is the author's alone), the
 * Submission the view and review gates read, and the part's question and file
 * limits. Null for an unknown publicId, for work on a part that isn't an essay
 * (a forum post has a publicId too), and on a deleted assignment.
 */
export function findEssayWork(publicId: string) {
  return db.assignmentPartWork.findFirst({
    where: { publicId, part: { kind: "ESSAY", assignment: liveAssignment } },
    select: {
      id: true,
      publicId: true,
      status: true,
      studentUserId: true,
      submissionId: true,
      part: {
        select: {
          assignmentId: true,
          prompt: true,
          maxFileSizeMb: true,
          allowedMimeCategories: true,
          assignment: { select: { seasonId: true, title: true } },
        },
      },
    },
  });
}
