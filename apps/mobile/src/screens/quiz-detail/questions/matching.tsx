import { useState } from "react";
import { View } from "react-native";
import { Pressable } from "../../../design/ui/pressable";
import type { StudentOption } from "@space/shared";

import { cn } from "../../../design/lib/cn";
import { textDirection } from "../../../design/lib/text-direction";
import { haptic } from "../../../design/motion";
import { Badge, ContentText, Text } from "../../../design/ui";
import { pairUp, unpair } from "../answer-model";
import type { QuestionProps } from "./props";

/** The item's badges. Not colour alone: the chosen item says so in words too. */
function ItemMarks({ chosen, number }: { chosen: boolean; number: number | null }) {
  return (
    <>
      {chosen ? (
        <Badge variant="default" className="shrink-0">
          Selected
        </Badge>
      ) : null}
      {number !== null ? (
        <Badge variant="info" className="shrink-0">
          {String(number)}
        </Badge>
      ) : null}
    </>
  );
}

/** One item of a column: highlighted and marked "Selected" while chosen, numbered like its partner once paired. */
function PairItem({
  item,
  number,
  chosen,
  accessibilityLabel,
  accessibilityHint,
  disabled,
  onPress,
}: {
  item: StudentOption;
  number: number | null;
  chosen: boolean;
  accessibilityLabel: string;
  accessibilityHint?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected: chosen, disabled }}
      disabled={disabled}
      onPress={() => {
        haptic("selection");
        onPress();
      }}
      className={cn(
        "min-h-11 flex-row items-center gap-2 rounded-control border px-3 py-3",
        chosen ? "border-ring bg-accent" : "border-control-border bg-surface",
        disabled && "opacity-50",
      )}
    >
      <ContentText
        variant="subhead"
        className={cn("min-w-0 flex-1 font-medium", chosen ? "text-accent-foreground" : "text-foreground")}
      >
        {item.label}
      </ContentText>
      <ItemMarks chosen={chosen} number={number} />
    </Pressable>
  );
}

/**
 * Tap-to-pair, never drag-only: tap an item of the first column, then one of the second.
 * A pair shows the same number on both; tapping a paired item unpairs it. The first column
 * sits on the right when the question is Arabic.
 */
export function Matching({ question, answer, onChange, disabled }: QuestionProps<"MATCHING">) {
  const [chosenLeft, setChosenLeft] = useState<number | null>(null);
  const rtl = textDirection(question.prompt) === "rtl";
  const pairOfLeft = (id: number) => answer.pairs.find((p) => p.leftId === id);
  const pairOfRight = (id: number) => answer.pairs.find((p) => p.rightId === id);
  const label = (items: StudentOption[], id: number) => items.find((i) => i.id === id)?.label ?? "";
  const numberOf = (leftId: number) => question.left.findIndex((l) => l.id === leftId) + 1;
  const chosenLabel = chosenLeft === null ? null : label(question.left, chosenLeft);

  // With an item chosen, a tap chooses another (paired or not) or, on the chosen one, clears the
  // choice; with nothing chosen, a tap on a paired item unpairs it.
  const pressLeft = (id: number) => {
    if (chosenLeft !== null) setChosenLeft(chosenLeft === id ? null : id);
    else if (pairOfLeft(id)) onChange(unpair(answer, id));
    else setChosenLeft(id);
  };
  const pressRight = (id: number) => {
    const paired = pairOfRight(id);
    if (chosenLeft !== null) onChange(pairUp(answer, chosenLeft, id));
    else if (paired) onChange(unpair(answer, paired.leftId));
    setChosenLeft(null);
  };

  return (
    <View className="flex-col gap-2">
      <Text variant="caption" className="text-muted-foreground">
        Tap an item, then its match.
      </Text>
      <View testID="matching-columns" className="gap-2" style={{ flexDirection: rtl ? "row-reverse" : "row" }}>
        <View className="min-w-0 flex-1 flex-col gap-2">
          {question.left.map((item) => {
            const pair = pairOfLeft(item.id);
            return (
              <PairItem
                key={item.id}
                item={item}
                number={pair ? numberOf(item.id) : null}
                chosen={chosenLeft === item.id}
                accessibilityLabel={
                  pair
                    ? `${item.label}, matched with ${label(question.right, pair.rightId)}`
                    : `Match ${item.label} with …`
                }
                accessibilityHint={pair ? "Unpairs it" : undefined}
                disabled={disabled}
                onPress={() => pressLeft(item.id)}
              />
            );
          })}
        </View>
        <View className="min-w-0 flex-1 flex-col gap-2">
          {question.right.map((item) => {
            const pair = pairOfRight(item.id);
            return (
              <PairItem
                key={item.id}
                item={item}
                number={pair ? numberOf(pair.leftId) : null}
                chosen={false}
                accessibilityLabel={
                  pair ? `${item.label}, matched with ${label(question.left, pair.leftId)}` : item.label
                }
                accessibilityHint={chosenLabel ? `Matches it with ${chosenLabel}` : pair ? "Unpairs it" : undefined}
                disabled={disabled}
                onPress={() => pressRight(item.id)}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}
