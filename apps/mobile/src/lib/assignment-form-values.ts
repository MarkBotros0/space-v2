/**
 * The assignment form's values: the as-typed state, v1's defaults, the edit
 * pre-fill, and the write body validated with the server's own schema.
 */
import { format, isValid, parse } from "date-fns";
import {
  assignmentWriteRequestSchema,
  type AssignmentDetail,
  type AssignmentTrackerRow,
  type MimeCategory,
} from "@space/shared";

/** Form state — strings for the numeric inputs, as typed. */
export interface AssignmentFormValues {
  title: string;
  description: string;
  dueDay: string | null;
  dueTime: string;
  sessionId: number | null;
  type: "STANDARD" | "FORUM";
  forumMinWords: string;
  forumAllowComments: boolean;
  acceptsFiles: boolean;
  maxFileSizeMb: string;
  allowedMimeCategories: MimeCategory[];
  targetMode: "all" | "groups";
  groupIds: number[];
}

/** v1's defaults (`assignment-form.tsx:109-126`): 23:59, 50 words, 10 MB, whole season (R19, R21–R23). */
export const NEW_ASSIGNMENT_VALUES: AssignmentFormValues = {
  title: "",
  description: "",
  dueDay: null,
  dueTime: "23:59",
  sessionId: null,
  type: "STANDARD",
  forumMinWords: "50",
  forumAllowComments: false,
  acceptsFiles: false,
  maxFileSizeMb: "10",
  allowedMimeCategories: [],
  targetMode: "all",
  groupIds: [],
};

/** Edit pre-fill — from the server's org-clock fields, never from dueAt (C2). */
export function valuesFromDetail(d: AssignmentDetail): AssignmentFormValues {
  return {
    title: d.title,
    description: d.description ?? "",
    dueDay: d.dueOrgDay,
    dueTime: d.dueOrgTime ?? "23:59",
    sessionId: d.sessionId,
    type: d.type,
    forumMinWords: String(d.forumMinWords ?? 50),
    forumAllowComments: d.forumAllowComments,
    // R10: no separate flag — a size means "accepts files".
    acceptsFiles: d.maxFileSizeMb !== null,
    maxFileSizeMb: String(d.maxFileSizeMb ?? 10),
    allowedMimeCategories: d.allowedMimeCategories,
    targetMode: d.isAllGroups ? "all" : "groups",
    groupIds: d.groupIds ?? [],
  };
}

/**
 * v1's payload assembly (`assignment-form.tsx:133-158`) — forum words fall
 * back to 0 when cleared (R21), size to 10 (R22), picked groups are dropped
 * when targeting everyone (R24) — then validated with the SAME schema the
 * server uses, so the two cannot disagree (R18 was exactly that disagreement).
 */
export function toAssignmentBody(v: AssignmentFormValues) {
  const isForum = v.type === "FORUM";
  return assignmentWriteRequestSchema.safeParse({
    title: v.title.trim(),
    description: v.description.trim() === "" ? null : v.description,
    dueDay: v.dueDay,
    dueTime: v.dueDay === null ? null : v.dueTime,
    sessionId: v.sessionId,
    type: v.type,
    forumMinWords: isForum ? (v.forumMinWords.trim() === "" ? 0 : Number(v.forumMinWords)) : null,
    forumAllowComments: isForum ? v.forumAllowComments : false,
    maxFileSizeMb:
      !isForum && v.acceptsFiles
        ? v.maxFileSizeMb.trim() === ""
          ? 10
          : Number(v.maxFileSizeMb)
        : null,
    allowedMimeCategories: !isForum && v.acceptsFiles ? v.allowedMimeCategories : [],
    isAllGroups: v.targetMode === "all",
    groupIds: v.targetMode === "groups" ? v.groupIds : [],
  });
}

/**
 * Tracker rows (already on screen) whose student started work in a group the
 * new targeting drops. Narrowing hides the assignment from them (R73); spec
 * §10 item 5 asks the client to warn. Presentational: it counts rows the
 * screen holds; the server still accepts the edit (R72).
 */
export function orphanedWorkCount(rows: AssignmentTrackerRow[], v: AssignmentFormValues): number {
  if (v.targetMode === "all") return 0;
  return rows.filter(
    (r) => r.status !== "PENDING" && (r.groupId === null || !v.groupIds.includes(r.groupId)),
  ).length;
}

/** The picked due day as a Date for the picker, or null. */
export const dayToDate = (day: string | null): Date | null => {
  if (day === null) return null;
  const d = parse(day, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : null;
};
/** A picked Date back to the org-day key. */
export const dateToDay = (d: Date): string => format(d, "yyyy-MM-dd");
export const timeToParts = (time: string): { hour: number; minute: number } => {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : { hour: 23, minute: 59 };
};
const pad = (n: number) => String(n).padStart(2, "0");
export const partsToTime = ({ hour, minute }: { hour: number; minute: number }): string =>
  `${pad(hour)}:${pad(minute)}`;
