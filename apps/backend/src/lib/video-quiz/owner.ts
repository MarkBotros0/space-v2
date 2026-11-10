/**
 * Who a set of timed video questions belongs to: a session's video, or a video
 * part of an assignment. The questions, answers, order gate and answer-key
 * split are the same for both; only the progress row differs
 * (SessionVideoProgress for a session, AssignmentPartWork for a part).
 */
export type VideoOwner = { sessionId: number } | { partId: number };

/** The SessionVideoQuestion filter for an owner's questions. */
export function questionsOf(owner: VideoOwner): { sessionId: number } | { assignmentPartId: number } {
  return "sessionId" in owner ? { sessionId: owner.sessionId } : { assignmentPartId: owner.partId };
}

/** The question-owner columns for a new question. */
export function ownerColumns(owner: VideoOwner): { sessionId: number | null; assignmentPartId: number | null } {
  return "sessionId" in owner
    ? { sessionId: owner.sessionId, assignmentPartId: null }
    : { sessionId: null, assignmentPartId: owner.partId };
}
