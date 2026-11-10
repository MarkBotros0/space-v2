/**
 * The assignment form's pure parts: the reminder's "when it goes out" line
 * while editing, and where each refusal from the shared schema shows (which
 * tab, which field, which part card).
 */
import { addDays, format, isValid, parse } from "date-fns";
import type { ZodError } from "zod";
import type { Reminder } from "@space/shared";

import type { PartDraft } from "../../lib/assignment-form-values";
import { formatWallTime } from "../../lib/format";
import { plural } from "../../lib/plural";

interface ReminderInputs {
  reminder: Reminder;
  dueDay: string | null;
  dueTime: string;
}

/** The saved assignment's settings with the server's own line for them. */
export interface SavedReminder extends ReminderInputs {
  line: string | null;
}

const FOR_WHOM = "students who haven't finished";

const sameSettings = (a: ReminderInputs, b: ReminderInputs) =>
  a.dueDay === b.dueDay &&
  a.dueTime === b.dueTime &&
  a.reminder.enabled === b.reminder.enabled &&
  a.reminder.days === b.reminder.days &&
  a.reminder.anchor === b.reminder.anchor &&
  a.reminder.time === b.reminder.time;

/**
 * When the reminder goes out, in the words the server uses. While the saved
 * settings are unchanged it is the server's line (which knows the next
 * session). Edited, a due-date reminder is dated from the form's due day; a
 * next-session one says its rule, since the season's sessions are the
 * server's to resolve. "Too close" compares with this device's clock, a
 * preview only: the server decides on the organisation's clock when it saves.
 * Null while the anchor is the due date and there is none (the anchor field
 * says "Set a due date first").
 */
export function reminderPreview(v: ReminderInputs, saved: SavedReminder | null, now: Date): string | null {
  const { reminder } = v;
  if (!reminder.enabled) return "No reminder goes out for this assignment.";
  if (saved !== null && sameSettings(v, saved) && saved.line !== null) return saved.line;
  const at = `around ${formatWallTime(reminder.time)}`;
  if (reminder.anchor === "NEXT_SESSION") {
    return `${plural(reminder.days, "day")} before the next session, ${at} — ${FOR_WHOM}`;
  }
  if (v.dueDay === null) return null;
  const due = parse(v.dueDay, "yyyy-MM-dd", now);
  if (!isValid(due)) return null;
  const sendDay = addDays(due, -reminder.days);
  const sendAt = parse(reminder.time, "HH:mm", sendDay);
  if (!isValid(sendAt) || sendAt <= now) return "Too close to the due date — no reminder";
  return `${format(sendDay, "EEE d MMM")}, ${at} — ${FOR_WHOM}`;
}

type Tab = "details" | "parts";

/** Which Details control each issue's field lands on. */
const DETAILS_FIELD: Record<string, string> = {
  title: "title",
  description: "description",
  dueDay: "due",
  dueTime: "due",
  enabled: "reminder",
  days: "days",
  anchor: "anchor",
  time: "time",
};

export interface FormIssues {
  details: Record<string, string>;
  /** The parts list as a whole: none yet, or a second forum. */
  partsList: string | null;
  /** The first issue on each part, by the part's key. */
  byPart: Record<string, string>;
  /** How many places on each tab need fixing, for the tab switch. */
  tabs: Record<Tab, number>;
}

/** A part's issue goes on its card; one on the list itself (none yet, a second forum) above the add buttons. */
function addPartIssue(out: FormIssues, index: unknown, message: string, parts: readonly PartDraft[]): void {
  const key = typeof index === "number" ? parts[index]?.key : undefined;
  if (key === undefined) out.partsList ??= message;
  else if (!(key in out.byPart)) out.byPart[key] = message;
}

export function formIssues(error: ZodError, parts: readonly PartDraft[]): FormIssues {
  const out: FormIssues = { details: {}, partsList: null, byPart: {}, tabs: { details: 0, parts: 0 } };
  for (const issue of error.issues) {
    const [head, index] = issue.path;
    if (head === "parts") {
      addPartIssue(out, index, issue.message, parts);
      continue;
    }
    const last = String(issue.path[issue.path.length - 1] ?? "form");
    const field = DETAILS_FIELD[last] ?? "form";
    if (!(field in out.details)) out.details[field] = issue.message;
  }
  out.tabs.details = Object.keys(out.details).length;
  out.tabs.parts = Object.keys(out.byPart).length + (out.partsList === null ? 0 : 1);
  return out;
}
