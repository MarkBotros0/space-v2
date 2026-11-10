// Assignment wording shared by the checklist, the part screens and the leader's progress.
import {
  isWatched,
  type AssignmentPart,
  type AssignmentPartKind,
  type MimeCategory,
  type PartWork,
} from "@space/shared";

import { plural } from "./plural";

/** v1's labels, verbatim (`assignment-form.tsx:24-31`). */
export const MIME_CATEGORY_LABELS: Record<MimeCategory, string> = {
  image: "Images",
  pdf: "PDFs",
  doc: "Documents (Word, ODF)",
  audio: "Audio",
  video: "Video",
  text: "Plain text",
};

const KIND_LABELS: Record<AssignmentPartKind, string> = { VIDEO: "Video", ESSAY: "Essay", FORUM: "Forum" };

/** "Video", "Essay", "Forum". */
export function partKindLabel(kind: AssignmentPartKind): string {
  return KIND_LABELS[kind];
}

function videoLine(part: Extract<AssignmentPart, { kind: "VIDEO" }>, work: PartWork): string {
  const v = work.video;
  if (v === undefined || work.status === "NOT_STARTED") return "Not started";
  const duration = v.durationSeconds > 0 ? v.durationSeconds : part.durationSeconds;
  if (!isWatched(v.watchedSeconds, duration)) {
    return `Watched ${Math.floor(v.watchedSeconds / 60)} of ${Math.max(1, Math.round(duration / 60))} min`;
  }
  if (v.answered < v.questionCount) return `Watched, ${v.answered} of ${plural(v.questionCount, "question")} answered`;
  return "Watched";
}

function essayLine(work: PartWork): string {
  const e = work.essay;
  if (e === undefined) return "Not started";
  switch (e.reviewStatus) {
    case "RETURNED":
      return "Returned — needs changes";
    case "SUBMITTED":
      return "Handed in";
    case "REVIEWED":
      return "Reviewed";
    case "DRAFT":
      return e.wordCount === 0 ? "Not started" : `Draft, ${plural(e.wordCount, "word")}`;
  }
}

/**
 * One part's state in words, for the checklist row and the part screen
 * (spec "Student checklist"): "Watched 6 of 18 min", "Draft, 120 words",
 * "Returned — needs changes", "Posted". Never "—": a part with no work says
 * "Not started" ("Not posted" for the forum).
 */
export function partStatusLine(part: AssignmentPart, work: PartWork | undefined): string {
  switch (part.kind) {
    case "VIDEO":
      return work === undefined ? "Not started" : videoLine(part, work);
    case "ESSAY":
      return work === undefined ? "Not started" : essayLine(work);
    case "FORUM":
      return work?.forum?.posted === true ? "Posted" : "Not posted";
  }
}
