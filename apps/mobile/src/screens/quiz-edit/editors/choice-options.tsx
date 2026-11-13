import { Check, Plus, Trash2 } from "lucide-react-native";
import { View } from "react-native";
import { Pressable } from "../../../design/ui/pressable";
import type { QuizQuestionInput } from "@space/shared";

import { cn } from "../../../design/lib/cn";
import { iconWithClassName } from "../../../design/lib/icon";
import { textDirection } from "../../../design/lib/text-direction";
import { haptic } from "../../../design/motion";
import { Button, Checkbox, FieldError, Input, Label } from "../../../design/ui";
import { OPTION_RANGE } from "./editor-model";

iconWithClassName(Check, Plus, Trash2);

type Choice = Extract<QuizQuestionInput, { type: "SINGLE_CHOICE" | "MULTI_CHOICE" }>;
type Option = Choice["options"][number];

/** The 44pt mark beside an option: a radio for single choice, a checkbox for multiple choice. */
function CorrectMark({
  multi,
  n,
  checked,
  onPress,
}: {
  multi: boolean;
  n: number;
  checked: boolean;
  onPress: () => void;
}) {
  const label = `Mark option ${n} correct`;
  return (
    <Pressable
      accessibilityRole={multi ? "checkbox" : "radio"}
      accessibilityLabel={label}
      accessibilityState={multi ? { checked } : { selected: checked, checked }}
      onPress={() => {
        haptic("selection");
        onPress();
      }}
      className="size-11 shrink-0 items-center justify-center"
    >
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {multi ? (
          <Checkbox checked={checked} onCheckedChange={() => {}} accessibilityLabel={label} />
        ) : (
          <View
            className={cn(
              "size-6 items-center justify-center rounded-full border",
              checked ? "border-ring bg-ring" : "border-control-border",
            )}
          >
            {checked ? <Check size={14} className="text-primary-foreground" /> : null}
          </View>
        )}
      </View>
    </Pressable>
  );
}

/**
 * Single and multiple choice options: a label each, the correct ones marked.
 * Single choice keeps one mark (a new mark moves it); multiple choice toggles.
 */
export function ChoiceOptions({
  type,
  options,
  errors,
  onChange,
}: {
  type: Choice["type"];
  options: Option[];
  errors: Record<string, string>;
  onChange: (options: Option[]) => void;
}) {
  const multi = type === "MULTI_CHOICE";
  const [min, max] = OPTION_RANGE[type];

  const mark = (index: number) =>
    onChange(
      options.map((o, i) =>
        multi ? (i === index ? { ...o, isCorrect: !o.isCorrect } : o) : { ...o, isCorrect: i === index },
      ),
    );
  const setLabel = (index: number, label: string) =>
    onChange(options.map((o, i) => (i === index ? { ...o, label } : o)));

  return (
    <View className="flex-col gap-2">
      <Label>{multi ? "Options (tick every correct answer)" : "Options (mark the correct answer)"}</Label>
      {options.map((option, index) => {
        const n = index + 1;
        const error = errors[`options.${index}.label`];
        return (
          <View key={index} className="flex-col gap-1">
            <View className="flex-row items-center gap-1">
              <CorrectMark multi={multi} n={n} checked={option.isCorrect} onPress={() => mark(index)} />
              <Input
                accessibilityLabel={`Option ${n}`}
                value={option.label}
                onChangeText={(v) => setLabel(index, v)}
                placeholder={`Option ${n}`}
                direction={textDirection(option.label)}
                aria-invalid={error !== undefined}
                accessibilityHint={error}
                className="min-w-0 flex-1"
              />
              {options.length > min ? (
                <Button
                  variant="plain"
                  size="icon"
                  accessibilityLabel={`Remove option ${n}`}
                  onPress={() => onChange(options.filter((_, i) => i !== index))}
                >
                  <Trash2 size={16} className="text-muted-foreground" />
                </Button>
              ) : null}
            </View>
            <FieldError className="pl-12">{error}</FieldError>
          </View>
        );
      })}
      <FieldError>{errors.options}</FieldError>
      {options.length < max ? (
        <Button
          className="self-start"
          variant="plain"
          size="sm"
          onPress={() => onChange([...options, { label: "", isCorrect: false }])}
        >
          <Plus size={16} className="text-foreground" />
          Add option
        </Button>
      ) : null}
    </View>
  );
}
