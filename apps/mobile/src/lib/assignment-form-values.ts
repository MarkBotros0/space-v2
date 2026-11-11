/**
 * The assignment form's values: the as-typed state, the defaults, the edit
 * pre-fill, and the write body validated with the server's own schema.
 */
import {
  DEFAULT_DUE_TIME,
  assignmentWriteRequestSchema,
  type AssignmentDetail,
  type AssignmentPart,
  type AssignmentPartInput,
  type Reminder,
} from "@space/shared";
import { blankToNull } from "./form-values";
export { dateToDay, dayToDate, partsToTime, timeToParts } from "./day-key";

/**
 * One part as the form holds it: the write shape (`id` once it is saved) plus
 * a `key` that stays put while parts are added, moved and removed, so a list
 * row keeps its identity before the part has an id. The key never goes to the
 * server.
 */
export type PartDraft = AssignmentPartInput & { key: string };

/** Form state. The parts are in the order the author set; their position is their index. */
export interface AssignmentFormValues {
  title: string;
  description: string;
  dueDay: string | null;
  dueTime: string;
  reminder: Reminder;
  parts: PartDraft[];
}

/** The reminder's defaults (spec): on, 2 days before the next session, around 09:00. */
const DEFAULT_REMINDER: Reminder = { enabled: true, days: 2, anchor: "NEXT_SESSION", time: "09:00" };

/** A new assignment: no parts yet, due at 23:59 once a day is picked (spec 07 R19). */
export const NEW_ASSIGNMENT_VALUES: AssignmentFormValues = {
  title: "",
  description: "",
  dueDay: null,
  dueTime: DEFAULT_DUE_TIME,
  reminder: DEFAULT_REMINDER,
  parts: [],
};

/** A stored part back to the write shape: the reader-only fields (`position`, a video's `videoId`) dropped. */
function draftFromPart(part: AssignmentPart): PartDraft {
  const key = `part-${part.id}`;
  switch (part.kind) {
    case "VIDEO": {
      const { position: _position, videoId: _videoId, ...input } = part;
      return { ...input, key };
    }
    case "ESSAY":
    case "FORUM": {
      const { position: _position, ...input } = part;
      return { ...input, key };
    }
  }
}

/** Edit pre-fill — from the server's org-clock fields, never from dueAt (C2). */
export function valuesFromDetail(d: AssignmentDetail): AssignmentFormValues {
  return {
    title: d.title,
    description: d.description ?? "",
    dueDay: d.dueOrgDay,
    dueTime: d.dueOrgTime ?? DEFAULT_DUE_TIME,
    reminder: d.reminder,
    parts: [...d.parts].sort((a, b) => a.position - b.position).map(draftFromPart),
  };
}

/**
 * The write body, validated with the SAME schema the server uses, so the two
 * cannot disagree (R18 was exactly that disagreement). Parts go in the form's
 * order, each with its `id` when it already exists, so the server keeps that
 * part's students' work. An assignment always goes to the whole season.
 */
export function toAssignmentBody(v: AssignmentFormValues) {
  return assignmentWriteRequestSchema.safeParse({
    title: v.title.trim(),
    description: blankToNull(v.description, { trim: false }),
    dueDay: v.dueDay,
    dueTime: v.dueDay === null ? null : v.dueTime,
    reminder: v.reminder,
    parts: v.parts.map(({ key: _key, ...part }) => part),
  });
}
