import { useState } from "react";
import { View } from "react-native";
import {
  createJpcEventRequestSchema,
  type CreateJpcEventBody,
  type JpcVisibility,
} from "@space/shared";

import { useSeasons } from "../hooks/use-seasons";
import { firstErrorByField } from "../lib/form-errors";
import { useTheme } from "../theme";
import { Button, Input, Text } from "../ui";
import { ChoiceChips, type ChoiceOption } from "./ChoiceChips";

export interface EventFormValues {
  title: string;
  day: string;
  time: string;
  endDay: string;
  description: string;
  url: string;
  visibility: JpcVisibility;
  seasonId: number | null;
}

export const EMPTY_EVENT_VALUES: EventFormValues = {
  title: "",
  day: "",
  time: "",
  endDay: "",
  description: "",
  url: "",
  visibility: "ALL",
  seasonId: null,
};

/** Who can see an event — ALUMNI_ONLY is alumni *and* staff, never current students (D-15.2). */
export const VISIBILITY_LABELS: Record<JpcVisibility, string> = {
  ALL: "Everyone",
  ALUMNI_ONLY: "Alumni & staff",
  SEASON: "One season",
};

const VISIBILITY_OPTIONS: readonly ChoiceOption<JpcVisibility>[] = (
  ["ALL", "ALUMNI_ONLY", "SEASON"] as const
).map((value) => ({ value, label: VISIBILITY_LABELS[value] }));

/**
 * Wall-clock fields only (ruling X13): an empty Time is all-day (`null`), an
 * empty End date is `null`. The device composes no instant and applies no zone.
 */
export function eventFormBody(values: EventFormValues): unknown {
  return {
    title: values.title.trim(),
    day: values.day.trim(),
    time: values.time.trim() === "" ? null : values.time.trim(),
    endDay: values.endDay.trim() === "" ? null : values.endDay.trim(),
    description: values.description.trim() === "" ? null : values.description.trim(),
    url: values.url.trim() === "" ? null : values.url.trim(),
    visibility: values.visibility,
    seasonId: values.visibility === "SEASON" ? values.seasonId : null,
  };
}

export interface EventFormProps {
  initial: EventFormValues;
  submitLabel: string;
  submitting: boolean;
  /** Called only with a body that already passed `createJpcEventRequestSchema`. */
  onSubmit: (body: CreateJpcEventBody) => void;
  message?: string | null;
}

/** Shared by the SUPER "New event" form and the event detail's edit section. */
export function EventForm({ initial, submitLabel, submitting, onSubmit, message }: EventFormProps) {
  const theme = useTheme();
  const [values, setValues] = useState<EventFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const seasons = useSeasons(values.visibility === "SEASON");

  const set =
    <K extends keyof EventFormValues>(key: K) =>
    (value: EventFormValues[K]) =>
      setValues((v) => ({ ...v, [key]: value }));

  const submit = () => {
    // The same schema the server applies, so a client error and a server 400
    // cannot disagree about what is valid.
    const parsed = createJpcEventRequestSchema.safeParse(eventFormBody(values));
    if (!parsed.success) {
      setErrors(firstErrorByField(parsed.error));
      return;
    }
    setErrors({});
    onSubmit(parsed.data);
  };

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Input label="Title" value={values.title} onChangeText={set("title")} error={errors.title} />
      <Input label="Date" value={values.day} onChangeText={set("day")} autoCapitalize="none" placeholder="YYYY-MM-DD" error={errors.day} />
      <Input label="Time" value={values.time} onChangeText={set("time")} autoCapitalize="none" placeholder="HH:mm, empty for all-day" error={errors.time} />
      <Input label="End date" value={values.endDay} onChangeText={set("endDay")} autoCapitalize="none" placeholder="YYYY-MM-DD, optional" error={errors.endDay} />
      <Input label="Description" value={values.description} onChangeText={set("description")} multiline error={errors.description} />
      <Input label="Link" value={values.url} onChangeText={set("url")} autoCapitalize="none" error={errors.url} />
      <ChoiceChips label="Visible to" options={VISIBILITY_OPTIONS} value={values.visibility} onChange={set("visibility")} />
      {values.visibility === "SEASON" ? (
        seasons.data ? (
          <ChoiceChips
            label="Season"
            options={seasons.data.map((s) => ({ value: s.id, label: s.title }))}
            value={values.seasonId}
            onChange={set("seasonId")}
            error={errors.seasonId}
          />
        ) : (
          <Text variant="label" color={theme.colors.neutral[600]}>
            {seasons.isError ? "Couldn't load seasons." : "Loading seasons…"}
          </Text>
        )
      ) : null}
      {message ? <Text variant="label" color={theme.colors.error[500]}>{message}</Text> : null}
      <Button title={submitLabel} onPress={submit} loading={submitting} />
    </View>
  );
}
