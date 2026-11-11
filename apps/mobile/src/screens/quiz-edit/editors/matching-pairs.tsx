import { Plus, Trash2 } from "lucide-react-native";
import { View } from "react-native";

import { iconWithClassName } from "../../../design/lib/icon";
import { textDirection } from "../../../design/lib/text-direction";
import { Button, FieldError, Input, Label, Text } from "../../../design/ui";
import { PAIR_RANGE } from "./editor-model";

iconWithClassName(Plus, Trash2);

type Pair = { left: string; right: string };

function PairInput({
  side,
  n,
  value,
  error,
  onChange,
}: {
  side: "Left" | "Right";
  n: number;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  return (
    <View className="flex-col gap-1">
      <Input
        accessibilityLabel={`${side} item ${n}`}
        value={value}
        onChangeText={onChange}
        placeholder={side === "Left" ? "Item" : "Its match"}
        direction={textDirection(value)}
        aria-invalid={error !== undefined}
        accessibilityHint={error}
      />
      <FieldError>{error}</FieldError>
    </View>
  );
}

/**
 * Matching pairs, 2 to 6: each row is an item and its match. Students see the
 * two columns shuffled apart. The two fields stack, so a long item (or an
 * Arabic one) gets the full width on a 360dp phone.
 */
export function MatchingPairs({
  pairs,
  errors,
  onChange,
}: {
  pairs: Pair[];
  errors: Record<string, string>;
  onChange: (pairs: Pair[]) => void;
}) {
  const [min, max] = PAIR_RANGE;
  const set = (index: number, side: keyof Pair, v: string) =>
    onChange(pairs.map((p, i) => (i === index ? { ...p, [side]: v } : p)));

  return (
    <View className="flex-col gap-3">
      <Label>Pairs (students match each item to its match)</Label>
      {pairs.map((pair, index) => {
        const n = index + 1;
        return (
          <View key={index} className="flex-col gap-2 rounded-control border border-separator p-3">
            <View className="flex-row items-center justify-between gap-2">
              <Text variant="caption" className="font-bold text-muted-foreground">{`Pair ${n}`}</Text>
              {pairs.length > min ? (
                <Button
                  variant="plain"
                  size="icon"
                  accessibilityLabel={`Remove pair ${n}`}
                  onPress={() => onChange(pairs.filter((_, i) => i !== index))}
                >
                  <Trash2 size={16} className="text-muted-foreground" />
                </Button>
              ) : null}
            </View>
            <PairInput
              side="Left"
              n={n}
              value={pair.left}
              error={errors[`pairs.${index}.left`]}
              onChange={(v) => set(index, "left", v)}
            />
            <PairInput
              side="Right"
              n={n}
              value={pair.right}
              error={errors[`pairs.${index}.right`]}
              onChange={(v) => set(index, "right", v)}
            />
          </View>
        );
      })}
      <FieldError>{errors.pairs}</FieldError>
      {pairs.length < max ? (
        <Button
          className="self-start"
          variant="plain"
          size="sm"
          onPress={() => onChange([...pairs, { left: "", right: "" }])}
        >
          <Plus size={16} className="text-foreground" />
          Add pair
        </Button>
      ) : null}
    </View>
  );
}
