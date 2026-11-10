import { useEffect, useState } from "react";
import { View } from "react-native";
import { createJpcEventRequestSchema, type CreateJpcEventBody, type JpcVisibility } from "@space/shared";

import { FormErrorBox } from "../../design/forms/form-parts";
import {
  Button,
  DatePicker,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
  Textarea,
} from "../../design/ui";
import { FormField } from "../../design/ui/form-field";
import { Sheet, SheetSaveBar } from "../../design/ui/sheet";
import { useSeasons } from "../../hooks/use-seasons";
import { firstErrorByField } from "../../lib/form-errors";
import { dateToDay, dayToDate } from "../../lib/day-key";
import { blankToNull } from "../../lib/form-values";

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
  ALUMNI_ONLY: "Alumni only",
  SEASON: "One season",
};

/**
 * Wall-clock fields only (ruling X13): an empty Time is all-day (`null`), an
 * empty End date is `null`. The device composes no instant and applies no zone.
 */
function eventFormBody(values: EventFormValues): unknown {
  return {
    title: values.title.trim(),
    day: values.day.trim(),
    time: blankToNull(values.time),
    endDay: blankToNull(values.endDay),
    description: blankToNull(values.description),
    url: blankToNull(values.url),
    visibility: values.visibility,
    seasonId: values.visibility === "SEASON" ? values.seasonId : null,
  };
}

interface EventFormProps {
  /** The form lives in a bottom sheet; closed, nothing renders and the fields reset on the next open. */
  open: boolean;
  title: string;
  initial: EventFormValues;
  submitLabel: string;
  submitting: boolean;
  /** Called only with a body that already passed `createJpcEventRequestSchema`. */
  onSubmit: (body: CreateJpcEventBody) => void;
  /** Closes the sheet (backdrop, drag, Android back). Ignored while saving. */
  onClose: () => void;
  message?: string | null;
}

/**
 * v1 super/events/jpc-event-form.tsx: Title, Description, Date / Time / End
 * date, Link, Visibility, then Season when the event is for one season.
 * Shared by the SUPER "New event" sheet and the event detail's edit sheet; the
 * save bar is the sheet's pinned `SheetSaveBar`, which rides the keyboard.
 * Date and End date are pickers; Time stays a typed HH:mm (empty = all-day)
 * because the design time picker has no empty state. No Photo or End time
 * field: uploads are off and the event contract carries neither (gap note).
 */
export function EventForm({
  open,
  title,
  initial,
  submitLabel,
  submitting,
  onSubmit,
  onClose,
  message,
}: EventFormProps) {
  const [values, setValues] = useState<EventFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const seasons = useSeasons(open && values.visibility === "SEASON");

  useEffect(() => {
    if (!open) return;
    setValues(initial);
    setErrors({});
    // Reset only when the sheet opens, not when the caller rebuilds `initial`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
    <Sheet
      open={open}
      onClose={() => {
        if (!submitting) onClose();
      }}
      title={title}
      footer={
        <SheetSaveBar
          label={submitLabel}
          loading={submitting}
          onPress={submit}
          hint={message ?? (Object.keys(errors).length > 0 ? "Fix the fields marked above." : undefined)}
        />
      }
    >
      <View className="flex-col gap-4 pb-4">
        <FormField label="Title" required error={errors.title}>
          <Input
            accessibilityLabel="Title"
            value={values.title}
            onChangeText={set("title")}
            placeholder="Spring Retreat"
          />
        </FormField>
        <FormField label="Description" error={errors.description}>
          <Textarea
            accessibilityLabel="Description"
            value={values.description}
            onChangeText={set("description")}
            placeholder="What's this event about?"
          />
        </FormField>
        <FormField label="Date" required error={errors.day}>
          <DatePicker
            accessibilityLabel="Date"
            value={dayToDate(values.day)}
            onChange={(d) => set("day")(dateToDay(d))}
            ariaInvalid={Boolean(errors.day)}
          />
        </FormField>
        <FormField label="Time" error={errors.time}>
          <Input
            accessibilityLabel="Time"
            value={values.time}
            onChangeText={set("time")}
            autoCapitalize="none"
            placeholder="HH:mm, empty for all-day"
          />
        </FormField>
        <FormField label="End date" error={errors.endDay}>
          <DatePicker
            accessibilityLabel="End date"
            value={dayToDate(values.endDay)}
            onChange={(d) => set("endDay")(dateToDay(d))}
            ariaInvalid={Boolean(errors.endDay)}
          />
          {values.endDay !== "" ? (
            // V2-only: v1's native date input could be cleared; the picker cannot.
            <Button variant="plain" size="sm" className="self-start" onPress={() => set("endDay")("")}>
              Remove end date
            </Button>
          ) : null}
        </FormField>
        <FormField label="Link" error={errors.url}>
          <Input
            accessibilityLabel="Link"
            value={values.url}
            onChangeText={set("url")}
            autoCapitalize="none"
            keyboardType="url"
            placeholder="https://..."
          />
        </FormField>
        <FormField label="Visible to" required>
          <Select
            items={VISIBILITY_LABELS}
            value={values.visibility}
            onValueChange={(v) => set("visibility")(v as JpcVisibility)}
          >
            <SelectTrigger accessibilityLabel="Visible to">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(VISIBILITY_LABELS) as JpcVisibility[]).map((v) => (
                <SelectItem key={v} value={v}>
                  {VISIBILITY_LABELS[v]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        {values.visibility === "SEASON" ? (
          seasons.data ? (
            <FormField label="Season" required error={errors.seasonId}>
              <Select
                items={Object.fromEntries(seasons.data.map((s) => [String(s.id), s.title]))}
                value={values.seasonId === null ? null : String(values.seasonId)}
                onValueChange={(v) => set("seasonId")(Number(v))}
              >
                <SelectTrigger accessibilityLabel="Season">
                  <SelectValue placeholder="Choose a season" />
                </SelectTrigger>
                <SelectContent>
                  {seasons.data.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          ) : (
            <Text className="text-sm text-muted-foreground">
              {seasons.isError ? "Couldn't load seasons." : "Loading seasons…"}
            </Text>
          )
        ) : null}
        <FormErrorBox message={message} />
      </View>
    </Sheet>
  );
}
