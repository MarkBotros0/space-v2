/**
 * The Details tab: title, instructions, the due date and time (organisation
 * clock), and the reminder. No session and no groups: an assignment is for
 * the whole season.
 */
import { View } from "react-native";
import type { Reminder } from "@space/shared";

import { FormSection } from "../../design/forms/form-section";
import { DatePicker } from "../../design/ui/date-picker";
import { FormField } from "../../design/ui/form-field";
import { Input } from "../../design/ui/input";
import { PillButton } from "../../design/ui/pill-button";
import { RichTextEditor } from "../../design/ui/rich-text-editor";
import { TimePicker } from "../../design/ui/time-picker";
import {
  dateToDay,
  dayToDate,
  partsToTime,
  timeToParts,
  type AssignmentFormValues,
} from "../../lib/assignment-form-values";
import { ReminderFields } from "./reminder-fields";

type DetailsValues = Omit<AssignmentFormValues, "parts">;

export function DetailsTab({
  v,
  set,
  errors,
  reminderLine,
}: {
  v: DetailsValues;
  set: <K extends keyof DetailsValues>(key: K, value: DetailsValues[K]) => void;
  errors: Record<string, string>;
  reminderLine: string | null;
}) {
  return (
    <View className="flex-col gap-6">
      <FormSection title="About">
        <FormField label="Title" required error={errors.title}>
          <Input
            accessibilityLabel="Title"
            value={v.title}
            onChangeText={(t) => set("title", t)}
            placeholder="e.g. Week 4 reflection"
          />
        </FormField>
        <FormField label="Instructions" error={errors.description}>
          <RichTextEditor
            value={v.description}
            onChange={(html) => set("description", html)}
            placeholder="What to do, and why"
          />
        </FormField>
      </FormSection>

      <FormSection title="Due" note="Times are on the organisation's clock, the same for every student.">
        <FormField label="Due date" error={errors.due}>
          <DatePicker
            accessibilityLabel="Due date"
            value={dayToDate(v.dueDay)}
            onChange={(d) => set("dueDay", dateToDay(d))}
          />
          {v.dueDay !== null ? (
            <PillButton label="Clear due date" className="self-start" onPress={() => set("dueDay", null)} />
          ) : null}
        </FormField>
        {v.dueDay !== null ? (
          <FormField label="Due time">
            <TimePicker
              label="Due"
              minuteStep={15}
              value={timeToParts(v.dueTime, { hour: 23, minute: 59 })}
              onChange={(parts) => set("dueTime", partsToTime(parts))}
            />
          </FormField>
        ) : null}
      </FormSection>

      <FormSection title="Reminder">
        <ReminderFields
          reminder={v.reminder}
          hasDueDate={v.dueDay !== null}
          line={reminderLine}
          errors={errors}
          onChange={(next: Reminder) => set("reminder", next)}
        />
      </FormSection>
    </View>
  );
}
