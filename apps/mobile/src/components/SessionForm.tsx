import { View } from "react-native";
import type { RecurrenceScope } from "@space/shared";

import { useTheme } from "../theme";
import { Button, Input } from "../ui";
import { ChoiceChips } from "./ChoiceChips";
import { TimePicker } from "./TimePicker";

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
export const sessionTypeFor = (youtubeUrl: string | null): SessionType => (youtubeUrl ? "online" : "inperson");

export function SessionFields({
  values,
  onChange,
  errors,
}: {
  values: SessionFormValues;
  onChange: (next: SessionFormValues) => void;
  errors: Record<string, string>;
}) {
  const set = (key: "title" | "day" | "durationMinutes" | "location" | "youtubeUrl" | "description") => (text: string) => onChange({ ...values, [key]: text });
  return (
    <>
      <Input label="Title" value={values.title} onChangeText={set("title")} error={errors.title} />
      <Input label="Day (YYYY-MM-DD)" value={values.day} onChangeText={set("day")} autoCapitalize="none" error={errors.startDay} />
      <TimePicker
        label="Start time"
        value={values.time}
        onChange={(time) => onChange({ ...values, time })}
        error={errors.startTime ?? errors.startsAt}
      />
      <Input
        label="Duration (minutes)"
        value={values.durationMinutes}
        onChangeText={set("durationMinutes")}
        keyboardType="number-pad"
        error={errors.durationMinutes}
      />
      <ChoiceChips
        label="Session type"
        options={[
          { value: "inperson", label: "In-person" },
          { value: "online", label: "Online" },
        ]}
        value={values.sessionType}
        onChange={(sessionType) => onChange({ ...values, sessionType })}
      />
      {values.sessionType === "inperson" ? (
        <Input label="Location" value={values.location} onChangeText={set("location")} error={errors.location} />
      ) : (
        <Input label="YouTube link" value={values.youtubeUrl} onChangeText={set("youtubeUrl")} autoCapitalize="none" error={errors.youtubeUrl} />
      )}
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
