/**
 * StatusChip and the status vocabulary: one tone + label per backend status.
 * The label swaps instantly when it changes (no fade: owner, 2026-11-07).
 * Never wraps mid-word and never shrinks in a row.
 * dueChip never reads the device clock: the server sends `isOverdue` and org-clock
 * day keys, so a student and their leader see the same chip in any timezone.
 */
import { cva } from "class-variance-authority";
import { View } from "react-native";
import type {
  AttendanceStatus,
  EnrollmentStatus,
  QuizAttemptStatus,
  SeasonStatus,
  SubmissionStatus,
  UserStatus,
} from "@space/shared";

import { daysBetween } from "../../lib/calendar-grid";
import { cn } from "../lib/cn";
import { Text } from "./text";

export type ChipTone = "ok" | "warn" | "bad" | "info" | "neutral";
export type ChipSpec = { tone: ChipTone; label: string };

const chipVariants = cva("shrink-0 flex-row items-center self-start rounded-full px-2.5 py-1", {
  variants: {
    tone: {
      ok: "bg-ok-soft",
      warn: "bg-warn-soft",
      bad: "bg-bad-soft",
      info: "bg-info-soft",
      neutral: "bg-neutral-soft",
    },
  },
});

const chipTextVariants = cva("font-medium", {
  variants: {
    tone: {
      ok: "text-ok",
      warn: "text-warn",
      bad: "text-bad",
      info: "text-info",
      neutral: "text-neutral-strong",
    },
  },
});

/** The chip's box and label classes, shared with Badge so every pill has one shape and tone set. */
export { chipVariants, chipTextVariants };

export function StatusChip({ tone, label, className }: ChipSpec & { className?: string }) {
  return (
    <View accessible accessibilityLabel={label} className={cn(chipVariants({ tone }), className)}>
      <Text variant="caption" numberOfLines={1} maxFontSizeMultiplier={1.3} className={chipTextVariants({ tone })}>
        {label}
      </Text>
    </View>
  );
}

const SEASON: Record<SeasonStatus, ChipSpec> = {
  DRAFT: { tone: "neutral", label: "Draft" },
  ACTIVE: { tone: "ok", label: "Active" },
  COMPLETED: { tone: "info", label: "Completed" },
  ARCHIVED: { tone: "neutral", label: "Archived" },
};
const ENROLLMENT: Record<EnrollmentStatus, ChipSpec> = {
  ACTIVE: { tone: "ok", label: "Active" },
  COMPLETED: { tone: "info", label: "Completed" },
  WITHDRAWN: { tone: "bad", label: "Dropped" },
};
const ATTENDANCE: Record<AttendanceStatus, ChipSpec> = {
  PRESENT: { tone: "ok", label: "Present" },
  LATE: { tone: "warn", label: "Late" },
  ABSENT: { tone: "bad", label: "Absent" },
};
const SUBMISSION: Record<SubmissionStatus, ChipSpec> = {
  DRAFT: { tone: "neutral", label: "Draft" },
  SUBMITTED: { tone: "info", label: "Submitted" },
  REVIEWED: { tone: "ok", label: "Reviewed" },
  RETURNED: { tone: "warn", label: "Returned" },
};
const QUIZ_ATTEMPT: Record<QuizAttemptStatus, ChipSpec> = {
  IN_PROGRESS: { tone: "warn", label: "In progress" },
  SUBMITTED: { tone: "info", label: "Submitted" },
  GRADED: { tone: "ok", label: "Graded" },
};
const USER: Record<UserStatus, ChipSpec> = {
  active: { tone: "ok", label: "Active" },
  invited: { tone: "info", label: "Invited" },
  pending: { tone: "warn", label: "Pending" },
  inactive: { tone: "neutral", label: "Inactive" },
};

type Vocabulary = {
  season: SeasonStatus;
  enrollment: EnrollmentStatus;
  attendance: AttendanceStatus;
  submission: SubmissionStatus;
  quizAttempt: QuizAttemptStatus;
  user: UserStatus;
};

const TABLES: { [K in keyof Vocabulary]: Record<Vocabulary[K], ChipSpec> } = {
  season: SEASON,
  enrollment: ENROLLMENT,
  attendance: ATTENDANCE,
  submission: SUBMISSION,
  quizAttempt: QUIZ_ATTEMPT,
  user: USER,
};

export function statusChip<K extends keyof Vocabulary>(kind: K, value: Vocabulary[K]): ChipSpec {
  return (TABLES[kind] as Record<string, ChipSpec>)[value]!;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Deadline chip from server fields: overdue flag, then today / within two days (warn), a weekday inside a week, else the date. */
export function dueChip({
  isOverdue,
  dueOrgDay,
  todayOrgDay,
}: {
  isOverdue: boolean;
  dueOrgDay: string | null;
  todayOrgDay: string;
}): ChipSpec {
  if (isOverdue) return { tone: "bad", label: "Overdue" };
  if (dueOrgDay === null) return { tone: "neutral", label: "No due date" };
  const days = daysBetween(todayOrgDay, dueOrgDay);
  if (days <= 0) return { tone: "warn", label: "Due today" };
  if (days <= 2) return { tone: "warn", label: `Due in ${days} ${days === 1 ? "day" : "days"}` };
  const [y, m, d] = dueOrgDay.split("-").map(Number) as [number, number, number];
  if (days < 7) return { tone: "neutral", label: `Due ${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}` };
  return { tone: "neutral", label: `Due ${MONTHS[m - 1]} ${d}` };
}
