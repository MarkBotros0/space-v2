/**
 * StatusChip and the status vocabulary: one tone + label per backend status.
 * The label crossfades (DURATION.fast) when it changes; reduced motion swaps
 * it instantly. Never wraps mid-word and never shrinks in a row.
 * Day maths in dueChip uses device-local calendar days: the mobile app has no
 * org-timezone helper (the server sends org-clock `dayKey` strings instead).
 */
import { cva } from "class-variance-authority";
import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import type {
  AttendanceStatus,
  EnrollmentStatus,
  QuizAttemptStatus,
  SeasonStatus,
  SubmissionStatus,
  UserStatus,
} from "@space/shared";
import { differenceInCalendarDays, format } from "date-fns";

import { DURATION, useReducedMotion } from "../motion";
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

export function StatusChip({ tone, label, className }: ChipSpec & { className?: string }) {
  const reduced = useReducedMotion();
  return (
    <View
      accessible
      accessibilityLabel={label}
      className={cn(chipVariants({ tone }), className)}
    >
      <Animated.View key={label} entering={reduced ? undefined : FadeIn.duration(DURATION.fast)}>
        <Text
          variant="caption"
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          className={chipTextVariants({ tone })}
        >
          {label}
        </Text>
      </Animated.View>
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

/** Deadline chip: overdue, then today / within two days (warn), else the weekday. */
export function dueChip(dueAt: Date, now: Date): ChipSpec {
  if (dueAt.getTime() < now.getTime()) return { tone: "bad", label: "Overdue" };
  const days = differenceInCalendarDays(dueAt, now);
  if (days === 0) return { tone: "warn", label: "Due today" };
  if (days <= 2) return { tone: "warn", label: `Due in ${days} ${days === 1 ? "day" : "days"}` };
  return { tone: "neutral", label: `Due ${format(dueAt, "EEEE")}` };
}
