import { useState } from "react";
import { Platform, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { format, parse } from "date-fns";

import { formatOrgDue } from "../lib/format";
import { useTheme } from "../theme";
import { Button, Text } from "../ui";

export interface DueValue {
  /** Organisation-calendar day, `YYYY-MM-DD`, or null for no due date. */
  day: string | null;
  /** Organisation wall-clock time, `HH:mm`. Kept while `day` is null so re-picking a day restores it. */
  time: string;
}

/**
 * Picks a deadline as an organisation day + time (rulings C2, X13).
 *
 * The native picker works in the device's local fields. This reads back
 * exactly the Y-M-D and H:m the admin tapped — `format()` over local fields —
 * and passes them on untouched; it never forms an instant and never calls
 * toISOString(). The server composes the instant in ORG_TIMEZONE, so "23:59
 * on the 1st" means the same moment whoever authors it, wherever they are.
 * (v1 composed it with setHours in the author's browser zone, spec 07 R45.)
 */
export function DueDateField({ value, onChange }: { value: DueValue; onChange: (next: DueValue) => void }) {
  const theme = useTheme();
  const [picking, setPicking] = useState<"date" | "time" | null>(null);

  // A local Date whose local fields ARE the org day/time — only ever fed back
  // to the picker as its starting point.
  const pickerValue = value.day ? parse(`${value.day} ${value.time}`, "yyyy-MM-dd HH:mm", new Date()) : new Date();

  const handle = (event: DateTimePickerEvent, picked?: Date) => {
    const mode = picking;
    // Android's dialog is gone after any answer; iOS stays inline until Done.
    if (Platform.OS !== "ios") setPicking(null);
    if (event.type !== "set" || picked === undefined) return;
    if (mode === "date") onChange({ day: format(picked, "yyyy-MM-dd"), time: value.time });
    if (mode === "time") onChange({ day: value.day, time: format(picked, "HH:mm") });
  };

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="heading">Due date</Text>
      <Text variant="body">{`Due: ${formatOrgDue(value.day, value.day ? value.time : null)}`}</Text>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        Times are on the organisation's clock, the same for every student.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
        <Button title="Pick due date" variant="secondary" onPress={() => setPicking("date")} />
        <Button
          title="Pick due time"
          variant="secondary"
          disabled={value.day === null}
          onPress={() => setPicking("time")}
        />
        {value.day !== null ? (
          <Button title="Clear due date" variant="ghost" onPress={() => onChange({ day: null, time: value.time })} />
        ) : null}
      </View>
      {picking !== null ? (
        <>
          <DateTimePicker
            value={pickerValue}
            mode={picking}
            display={Platform.OS === "ios" ? (picking === "date" ? "inline" : "spinner") : "default"}
            // R20: v1's time picker stepped in 15 minutes (honoured on iOS).
            minuteInterval={15}
            onChange={handle}
          />
          {Platform.OS === "ios" ? <Button title="Done" variant="ghost" onPress={() => setPicking(null)} /> : null}
        </>
      ) : null}
    </View>
  );
}
