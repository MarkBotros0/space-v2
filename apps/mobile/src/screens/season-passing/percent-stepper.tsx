/**
 * One number of the pass criteria: a label, a field for the number with a Lower and a Raise button
 * either side (steps of 5, 44pt each), and its note or error under it. An "off" field shows its
 * fixed value read-only, with the buttons disabled and the note saying why.
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
  return (
    <View className="flex-col gap-1.5">
      <Label>{label}</Label>
      <View className="flex-row items-center gap-2">
        <Button
          variant="secondary"
          size="icon"
          accessibilityLabel={`Lower ${name}`}
          disabled={off}
          onPress={() => onChange(stepDraft(value, -STEP))}
        >
          <Minus size={18} className="text-foreground" />
        </Button>
        <View className="min-w-0 flex-1">
          <Input
            accessibilityLabel={spokenName}
            accessibilityHint={error}
            aria-invalid={!!error}
            keyboardType="number-pad"
            maxLength={3}
            readOnly={off}
            value={value}
            onChangeText={(text) => onChange(text.replace(/[^0-9]/g, ""))}
            className="text-center"
          />
        </View>
        {suffix ? (
          <Text variant="body" className="shrink-0 text-muted-foreground" importantForAccessibility="no">
            {suffix}
          </Text>
        ) : null}
        <Button
          variant="secondary"
          size="icon"
          accessibilityLabel={`Raise ${name}`}
          disabled={off}
          onPress={() => onChange(stepDraft(value, STEP))}
        >
          <Plus size={18} className="text-foreground" />
        </Button>
      </View>
      {note ? <FieldDescription>{note}</FieldDescription> : null}
      <FieldError>{error}</FieldError>
    </View>
  );
}
