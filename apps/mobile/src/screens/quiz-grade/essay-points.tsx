/**
 * The points a leader gives an essay (owner 2026-11-13: "I can give 1 mark from a total of 2"):
 * whole points from 0 to the question's points. Up to five points, one button per score (0 · 1 · 2),
 * so a mark is one tap; above that, a field with Lower and Raise either side (44pt each).
 */
import { Minus, Plus } from "lucide-react-native";
import { View } from "react-native";

import { ToggleButtons } from "../../design/forms/form-parts";
import { iconWithClassName } from "../../design/lib/icon";
import { Button, Input, Text } from "../../design/ui";
import { plural } from "../../lib/plural";

iconWithClassName(Minus, Plus);

/** The most points shown as one button each; a bigger essay gets the field. */
const BUTTONS_UP_TO = 5;

const pointsWord = (n: number) => plural(n, "point");

export function EssayPoints({
  points,
  max,
  onChange,
}: {
  points: number | null;
  max: number;
  onChange: (points: number) => void;
}) {
  return (
    <View className="flex-col gap-1.5">
      <Text variant="caption" className="font-bold text-muted-foreground">
        {`Points, out of ${max}`}
      </Text>
      {max <= BUTTONS_UP_TO ? (
        <ToggleButtons<string>
          options={Array.from({ length: max + 1 }, (_, n) => ({
            value: String(n),
            label: String(n),
            spoken: `${pointsWord(n)} of ${max}`,
          }))}
          value={points === null ? "" : String(points)}
          onChange={(v) => onChange(Number(v))}
        />
      ) : (
        <PointsField points={points} max={max} onChange={onChange} />
      )}
    </View>
  );
}

function PointsField({
  points,
  max,
  onChange,
}: {
  points: number | null;
  max: number;
  onChange: (points: number) => void;
}) {
  const value = points ?? 0;
  return (
    <View className="flex-row items-center gap-2">
      <Button
        variant="secondary"
        size="icon"
        accessibilityLabel="One point less"
        disabled={points !== null && value <= 0}
        onPress={() => onChange(Math.max(0, value - 1))}
      >
        <Minus size={18} className="text-foreground" />
      </Button>
      <View className="min-w-0 flex-1">
        <Input
          accessibilityLabel={`Points, out of ${max}`}
          keyboardType="number-pad"
          maxLength={3}
          placeholder="Not marked"
          value={points === null ? "" : String(points)}
          onChangeText={(text) => {
            const digits = text.replace(/[^0-9]/g, "");
            if (digits !== "") onChange(Math.min(max, Number(digits)));
          }}
          className="text-center"
        />
      </View>
      <Button
        variant="secondary"
        size="icon"
        accessibilityLabel="One point more"
        disabled={value >= max}
        onPress={() => onChange(points === null ? 1 : Math.min(max, value + 1))}
      >
        <Plus size={18} className="text-foreground" />
      </Button>
    </View>
  );
}
