/**
 * One number of the pass criteria on one line (owner, 2026-11-13: "much easier"): its label and note
 * on the left, and on the right a short field with a Lower and a Raise button either side (steps of
 * 5, 44pt each); it wraps under the label when the text is large. Its error goes under the line. An "off" field shows its
 * fixed value read-only, with the buttons disabled and the note saying why. Lower is disabled at 0
 * and Raise at 100, where a press would change nothing.
 */
import { Minus, Plus } from "lucide-react-native";
import { View } from "react-native";

import { iconWithClassName } from "../../design/lib/icon";
import { Button, FieldDescription, FieldError, Input, Label, Text } from "../../design/ui";
import { stepDraft } from "./criteria-model";

iconWithClassName(Minus, Plus);

const STEP = 5;

export function PercentStepper({
  label,
  name,
  value,
  onChange,
  suffix,
  note,
  error,
  off = false,
}: {
  /** Shown above the field ("Attendance"). */
  label: string;
  /** Names the field and its buttons for screen readers ("attendance weight"). */
  name: string;
  value: string;
  onChange: (next: string) => void;
  /** After the field ("%"), or none. */
  suffix?: string;
  note?: string;
  error?: string;
  off?: boolean;
}) {
  const spokenName = name.charAt(0).toUpperCase() + name.slice(1);
  const lowered = stepDraft(value, -STEP);
  const raised = stepDraft(value, STEP);
  return (
    <View className="flex-col gap-1">
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-2">
        <View className="min-w-[120px] flex-1 flex-col">
          <Label>{label}</Label>
          {note ? <FieldDescription>{note}</FieldDescription> : null}
        </View>
        <View className="flex-row items-center gap-1.5">
          <Button
            variant="secondary"
            size="icon"
            accessibilityLabel={`Lower ${name}`}
            disabled={off || lowered === value}
            onPress={() => onChange(lowered)}
          >
            <Minus size={18} className="text-foreground" />
          </Button>
          <View className="w-[72px] flex-row items-center">
            <Input
              accessibilityLabel={spokenName}
              accessibilityHint={error}
              aria-invalid={!!error}
              keyboardType="number-pad"
              maxLength={3}
              readOnly={off}
              selectTextOnFocus
              value={value}
              onChangeText={(text) => onChange(text.replace(/[^0-9]/g, ""))}
              className={suffix ? "flex-1 pr-6 text-center" : "flex-1 text-center"}
            />
            {suffix ? (
              <Text
                variant="body"
                className="absolute right-2.5 text-muted-foreground"
                importantForAccessibility="no"
                pointerEvents="none"
              >
                {suffix}
              </Text>
            ) : null}
          </View>
          <Button
            variant="secondary"
            size="icon"
            accessibilityLabel={`Raise ${name}`}
            disabled={off || raised === value}
            onPress={() => onChange(raised)}
          >
            <Plus size={18} className="text-foreground" />
          </Button>
        </View>
      </View>
      <FieldError>{error}</FieldError>
    </View>
  );
}
