/**
 * The video-question editor's form, apart from the screen (refactor FE-004): its state, the body
 * a save sends (or why it can't), and what an update says it did.
 */
import {
  formatTimestamp,
  parseTimestamp,
  videoQuestionInputSchema,
  type VideoQuestionAdmin,
  type VideoQuestionInput,
} from "@space/shared";

export const TIMESTAMP_HINT = "Use m:ss or h:mm:ss (for example 2:30).";

export interface VideoQuestionFormState {
  /** Null while adding. */
  editingId: number | null;
  timestamp: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  points: string;
}

export const EMPTY_VIDEO_QUESTION_FORM: VideoQuestionFormState = {
  editingId: null,
  timestamp: "",
  prompt: "",
  options: ["", ""],
  correctIndex: 0,
  points: "1",
};

export function formFromQuestion(q: VideoQuestionAdmin): VideoQuestionFormState {
  return {
    editingId: q.id,
    timestamp: formatTimestamp(q.atSeconds),
    prompt: q.prompt,
    options: [...q.options],
    correctIndex: q.correctIndex,
    points: String(q.points),
  };
}

type VideoQuestionBody =
  { ok: true; input: VideoQuestionInput } | { ok: false; field: "timestamp" | "form"; message: string };

/**
 * The body a save sends. The timestamp is parsed where it is typed: v1 sent the raw string, the
 * server refused it with a generic message and the editor dropped the field errors (R28).
 */
export function videoQuestionBody(form: VideoQuestionFormState): VideoQuestionBody {
  const atSeconds = parseTimestamp(form.timestamp);
  if (atSeconds === null) return { ok: false, field: "timestamp", message: TIMESTAMP_HINT };
  const parsed = videoQuestionInputSchema.safeParse({
    atSeconds,
    prompt: form.prompt,
    options: form.options,
    correctIndex: form.correctIndex,
    points: Number(form.points),
  });
  if (!parsed.success) {
    return {
      ok: false,
      field: "form",
      message: parsed.error.issues[0]?.message ?? "Check the question and try again.",
    };
  }
  return { ok: true, input: parsed.data };
}

/** What an update says it did: the answers it re-graded and whether the points moved. */
export function updatedQuestionStatus(res: { regradedCount: number; pointsChanged: boolean }): string {
  const lines: string[] = [];
  if (res.regradedCount > 0) lines.push(`${res.regradedCount} recorded answers were re-graded.`);
  if (res.pointsChanged) lines.push("Points changed — every student's score for this question moved.");
  return lines.length > 0 ? lines.join(" ") : "Question updated.";
}
