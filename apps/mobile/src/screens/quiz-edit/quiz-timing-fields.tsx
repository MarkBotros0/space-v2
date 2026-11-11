import { View } from "react-native";

import { DatePicker, FormField, Input, TimePicker } from "../../design/ui";
import { PillButton } from "../../design/ui/pill-button";
import { dateToDay, dayToDate, partsToTime, timeToParts } from "../../lib/day-key";
import { DEFAULT_FROM_TIME, DEFAULT_UNTIL_TIME, type TimingDraft, type WindowEnd } from "./timing-values";

/** One end of the start window: a day, its time once a day is picked, and Clear. */
function WindowEndField({
  label,
  end,
  defaultTime,
  error,
  onChange,
}: {
  label: string;
  end: WindowEnd;
  defaultTime: string;
  error?: string;
  onChange: (next: WindowEnd) => void;
}) {
  return (
    <FormField label={label} error={error}>
      <DatePicker
        accessibilityLabel={label}
        placeholder="Any time"
        value={end ? dayToDate(end.day) : null}
        onChange={(d) => onChange({ day: dateToDay(d), time: end?.time ?? defaultTime })}
      />
      {end ? (
        <View className="flex-row flex-wrap items-center gap-3">
          <TimePicker
            label={label}
            minuteStep={5}
            value={timeToParts(end.time, timeToParts(defaultTime, { hour: 0, minute: 0 }))}
            onChange={(parts) => onChange({ ...end, time: partsToTime(parts) })}
          />
          <PillButton
            label="Clear"
            accessibilityLabel={`Clear ${label.toLowerCase()}`}
            onPress={() => onChange(null)}
          />
        </View>
      ) : null}
    </FormField>
  );
}

/**
 * ONLINE only (the server refuses timing on paper: wrong_quiz_kind). The start window limits when
 * a student may start; the time limit runs from each student's own start, and is frozen once anyone
 * has started (quiz_has_attempts). docs/rules/quiz-integrity.md "Timing".
 */
export function QuizTimingFields({
  draft,
  limitLocked,
  errors,
  onChange,
}: {
  draft: TimingDraft;
  limitLocked: boolean;
  errors: Record<string, string>;
  onChange: (next: TimingDraft) => void;
}) {
  return (
    <View className="flex-col gap-4">
      <WindowEndField
        label="Can start from"
        end={draft.from}
        defaultTime={DEFAULT_FROM_TIME}
        error={errors.startsFrom}
        onChange={(from) => onChange({ ...draft, from })}
      />
      <WindowEndField
        label="Can start until"
        end={draft.until}
        defaultTime={DEFAULT_UNTIL_TIME}
        error={errors.startsUntil}
        onChange={(until) => onChange({ ...draft, until })}
      />
      <FormField
        label="Time limit (minutes)"
        description={
          limitLocked
            ? "Students have started this quiz, so its time limit can no longer change."
            : "Counted from each student's own start. Leave empty for no limit."
        }
        error={errors.timeLimitMinutes}
      >
        <Input
          accessibilityLabel="Time limit in minutes"
          value={draft.limit}
          onChangeText={(limit) => onChange({ ...draft, limit })}
          readOnly={limitLocked}
          keyboardType="number-pad"
          placeholder="No limit"
        />
      </FormField>
    </View>
  );
}
