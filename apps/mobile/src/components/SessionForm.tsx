import { View } from "react-native";
import type { RecurrenceScope } from "@space/shared";

import { useTheme } from "../theme";
import { Button, Input } from "../ui";

export interface SessionFormValues {
  title: string;
  /** Org-calendar day, "YYYY-MM-DD". */
  day: string;
  /** Org wall-clock time, "HH:mm". */
  time: string;
  durationMinutes: string;
  location: string;
  youtubeUrl: string;
  description: string;
}

export const emptySessionValues: SessionFormValues = {
  title: "",
  day: "",
  time: "",
  durationMinutes: "90",
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
    location: orNull(v.location),
    youtubeUrl: orNull(v.youtubeUrl),
    description: orNull(v.description),
  };
}

export function SessionFields({
  values,
  onChange,
  errors,
}: {
  values: SessionFormValues;
  onChange: (next: SessionFormValues) => void;
  errors: Record<string, string>;
}) {
  const set = (key: keyof SessionFormValues) => (text: string) => onChange({ ...values, [key]: text });
  return (
    <>
      <Input label="Title" value={values.title} onChangeText={set("title")} error={errors.title} />
      <Input label="Day (YYYY-MM-DD)" value={values.day} onChangeText={set("day")} autoCapitalize="none" error={errors.startDay} />
      <Input
        label="Start time (HH:mm)"
        value={values.time}
        onChangeText={set("time")}
        autoCapitalize="none"
        error={errors.startTime ?? errors.startsAt}
      />
      <Input
        label="Duration (minutes)"
        value={values.durationMinutes}
        onChangeText={set("durationMinutes")}
        keyboardType="number-pad"
        error={errors.durationMinutes}
      />
      <Input label="Location" value={values.location} onChangeText={set("location")} error={errors.location} />
      <Input label="YouTube URL" value={values.youtubeUrl} onChangeText={set("youtubeUrl")} autoCapitalize="none" error={errors.youtubeUrl} />
      <Input label="Description" value={values.description} onChangeText={set("description")} multiline error={errors.description} />
    </>
  );
}

export const SCOPE_LABELS: Record<RecurrenceScope, string> = {
  one: "This session",
  future: "This and following",
  all: "All in series",
};

/** Rendered only for a session with a recurrenceGroupId (spec 03 R29). */
export function ScopeSelector({ value, onChange }: { value: RecurrenceScope; onChange: (s: RecurrenceScope) => void }) {
  const theme = useTheme();
  const scopes: RecurrenceScope[] = ["one", "future", "all"];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
      {scopes.map((s) => (
        <Button key={s} title={SCOPE_LABELS[s]} variant={value === s ? "primary" : "secondary"} onPress={() => onChange(s)} />
      ))}
    </View>
  );
}
