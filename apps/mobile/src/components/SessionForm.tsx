import { format, isValid, parse } from "date-fns";
import { View } from "react-native";
import type { RecurrenceScope } from "@space/shared";

import { FormField } from "../design/ui/form-field";
import { ToggleButtons } from "../design/forms/form-parts";
import {
  DatePicker,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  TimePicker,
} from "../design/ui";

export type SessionType = "inperson" | "online";

export interface SessionFormValues {
  title: string;
  /** Org-calendar day, "YYYY-MM-DD". */
  day: string;
  /** Org wall-clock time, "HH:mm". */
  time: string;
  durationMinutes: string;
  /** In-person shows/sends the location, online the YouTube link (v1 session-form.tsx). */
  sessionType: SessionType;
  location: string;
  youtubeUrl: string;
  description: string;
}

export const emptySessionValues: SessionFormValues = {
  title: "",
  day: "",
  time: "18:00",
  durationMinutes: "90",
  sessionType: "inperson",
  location: "",
  youtubeUrl: "",
  description: "",
};

const orNull = (v: string): string | null => (v.trim() === "" ? null : v.trim());

/**
 * The write fields both create and update share. The start travels as org
 * wall-clock fields startDay + startTime (Plan 6 D-16.6 — Plan 5's
 * dueDay/dueTime split): the server composes the instant in ORG_TIMEZONE, so
 * the phone's own zone never enters the calculation (X13).
 */
export function sessionWriteFields(v: SessionFormValues) {
  return {
    title: v.title.trim(),
    startDay: v.day.trim(),
    startTime: v.time.trim(),
    durationMinutes: Number(v.durationMinutes),
    location: v.sessionType === "inperson" ? orNull(v.location) : null,
    youtubeUrl: v.sessionType === "online" ? orNull(v.youtubeUrl) : null,
    description: orNull(v.description),
  };
}

/** v1 edit: a session with a YouTube link is online, anything else in-person. */
export const sessionTypeFor = (youtubeUrl: string | null): SessionType =>
  youtubeUrl ? "online" : "inperson";

/** The day key as a local-midnight Date for the picker (and back) — no zone arithmetic (X13). */
const dayToDate = (day: string): Date | null => {
  const d = parse(day, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : null;
};
const timeToParts = (time: string): { hour: number; minute: number } => {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : { hour: 18, minute: 0 };
};
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * v1 src/components/sessions/session-form.tsx fields: Title, Date / Start
 * time / Duration, Session type, Location or YouTube link, Description. The
 * form values stay the org-wall strings v2 sends; the pickers translate.
 */
export function SessionFields({
  values,
  onChange,
  errors,
}: {
  values: SessionFormValues;
  onChange: (next: SessionFormValues) => void;
  errors: Record<string, string>;
}) {
  const set =
    (key: "title" | "durationMinutes" | "location" | "youtubeUrl" | "description") =>
    (text: string) =>
      onChange({ ...values, [key]: text });
  return (
    <View className="flex-col gap-4">
      <FormField label="Title" required error={errors.title}>
        <Input
          accessibilityLabel="Title"
          value={values.title}
          onChangeText={set("title")}
          placeholder="e.g. Week 4 — Topic"
        />
      </FormField>

      <FormField label="Date" required error={errors.startDay}>
        <DatePicker
          accessibilityLabel="Date"
          value={dayToDate(values.day)}
          onChange={(d) => onChange({ ...values, day: format(d, "yyyy-MM-dd") })}
          ariaInvalid={Boolean(errors.startDay)}
        />
      </FormField>
      <FormField label="Start time" required error={errors.startTime ?? errors.startsAt}>
        <TimePicker
          minuteStep={15}
          value={timeToParts(values.time)}
          onChange={({ hour, minute }) =>
            onChange({ ...values, time: `${pad(hour)}:${pad(minute)}` })
          }
        />
      </FormField>
      <FormField label="Duration (min)" required error={errors.durationMinutes}>
        <Input
          accessibilityLabel="Duration (min)"
          value={values.durationMinutes}
          onChangeText={set("durationMinutes")}
          keyboardType="number-pad"
        />
      </FormField>

      <FormField label="Session type">
        <ToggleButtons
          options={[
            { value: "inperson", label: "In-person" },
            { value: "online", label: "Online" },
          ]}
          value={values.sessionType}
          onChange={(sessionType) => onChange({ ...values, sessionType })}
        />
      </FormField>

      {values.sessionType === "inperson" ? (
        <FormField label="Location" error={errors.location}>
          <Input
            accessibilityLabel="Location"
            value={values.location}
            onChangeText={set("location")}
            placeholder="Room, building, or address"
          />
        </FormField>
      ) : (
        <FormField label="YouTube link" error={errors.youtubeUrl}>
          <Input
            accessibilityLabel="YouTube link"
            value={values.youtubeUrl}
            onChangeText={set("youtubeUrl")}
            autoCapitalize="none"
            keyboardType="url"
            placeholder="https://youtube.com/watch?v=..."
          />
        </FormField>
      )}

      <FormField label="Description" error={errors.description}>
        <Textarea
          accessibilityLabel="Description"
          value={values.description}
          onChangeText={set("description")}
          placeholder="Optional notes shown to leaders and students."
        />
      </FormField>
    </View>
  );
}

/** v1 words for the "Apply to" select. */
export const SCOPE_LABELS: Record<RecurrenceScope, string> = {
  one: "This session only",
  future: "This and future sessions",
  all: "All sessions in the series",
};

/** Rendered only for a session with a recurrenceGroupId (spec 03 R29). */
export function ScopeSelector({
  value,
  onChange,
  error,
}: {
  value: RecurrenceScope;
  onChange: (s: RecurrenceScope) => void;
  error?: string;
}) {
  return (
    <FormField label="Apply to" error={error}>
      <Select
        items={SCOPE_LABELS}
        value={value}
        onValueChange={(v) => onChange(v as RecurrenceScope)}
      >
        <SelectTrigger accessibilityLabel="Apply to">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(SCOPE_LABELS) as RecurrenceScope[]).map((s) => (
            <SelectItem key={s} value={s}>
              {SCOPE_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}
