/**
 * The reminder: on or off, "[2 days] before [the next session | the due
 * date] at [9:00 AM]", and the line saying when it goes out. "The due date"
 * can't be picked while there is no due date.
 */
import { View } from "react-native";
import type { Reminder, ReminderAnchor } from "@space/shared";

import { FieldCell, FieldRow } from "../../design/forms/form-section";
import { FormField } from "../../design/ui/form-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../design/ui/select";
import { Text } from "../../design/ui/text";
import { TimePicker } from "../../design/ui/time-picker";
import { partsToTime, timeToParts } from "../../lib/assignment-form-values";
import { plural } from "../../lib/plural";
import { SwitchRow } from "./switch-row";

/** Reminder days run 1..14 (shared assignment.ts). */
const DAY_ITEMS = Array.from({ length: 14 }, (_, i) => ({ value: String(i + 1), label: plural(i + 1, "day") }));
const ANCHOR_LABELS: Record<ReminderAnchor, string> = { NEXT_SESSION: "The next session", DUE_DATE: "The due date" };
const SET_DUE_DATE_FIRST = "Set a due date first";

export function ReminderFields({
  reminder,
  hasDueDate,
  line,
  errors,
  onChange,
}: {
  reminder: Reminder;
  hasDueDate: boolean;
  /** When it goes out, in words; null when there is nothing to say beyond the fields' own hints. */
  line: string | null;
  errors: Record<string, string>;
  onChange: (next: Reminder) => void;
}) {
  const set = (patch: Partial<Reminder>) => onChange({ ...reminder, ...patch });
  // Only a reminder that is on needs its anchor (ruling, Task 10).
  const anchorError =
    errors.anchor ??
    (reminder.enabled && reminder.anchor === "DUE_DATE" && !hasDueDate ? SET_DUE_DATE_FIRST : undefined);
  return (
    <View className="flex-col gap-4">
      <SwitchRow
        label="Remind students"
        description="A push and a notification to students who haven't finished."
        checked={reminder.enabled}
        onChange={(enabled) => set({ enabled })}
      />
      {reminder.enabled ? (
        <>
          <FieldRow>
            <FieldCell>
              <FormField label="How long before" error={errors.days}>
                <Select items={DAY_ITEMS} value={String(reminder.days)} onValueChange={(v) => set({ days: Number(v) })}>
                  <SelectTrigger accessibilityLabel="How long before">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_ITEMS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </FieldCell>
            <FieldCell grow={2}>
              <FormField label="Before" error={anchorError}>
                <Select
                  items={ANCHOR_LABELS}
                  value={reminder.anchor}
                  onValueChange={(v) => set({ anchor: v as ReminderAnchor })}
                >
                  <SelectTrigger accessibilityLabel="Before">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NEXT_SESSION">{ANCHOR_LABELS.NEXT_SESSION}</SelectItem>
                    <SelectItem value="DUE_DATE" disabled={!hasDueDate}>
                      {ANCHOR_LABELS.DUE_DATE}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </FieldCell>
          </FieldRow>
          <FormField label="At" description="On the organisation's clock." error={errors.time}>
            <TimePicker
              label="Reminder"
              minuteStep={15}
              value={timeToParts(reminder.time, { hour: 9, minute: 0 })}
              onChange={(parts) => set({ time: partsToTime(parts) })}
            />
          </FormField>
        </>
      ) : null}
      {line !== null ? (
        <Text variant="subhead" testID="reminder-line" className="text-foreground">
          {line}
        </Text>
      ) : null}
    </View>
  );
}
