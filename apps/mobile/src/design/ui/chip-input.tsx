/**
 * Port of v1 src/components/ui/chip-input.tsx — same props and rules: add on
 * Enter or ",", no blanks or duplicates, Backspace on an empty draft removes
 * the last chip, blur adds the draft.
 * Native differences: Enter → onSubmitEditing; "," is caught in
 * onChangeText; focus-within ring → border-ring while the input is focused.
 */
import { X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { iconWithClassName } from "../lib/icon";
import { cn } from "../lib/cn";
import { useThemeColors } from "../theme/use-theme-colors";
import { Badge } from "./badge";

iconWithClassName(X);

export interface ChipInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  accessibilityLabel?: string;
}

export function ChipInput({
  value,
  onChange,
  placeholder = "Type and press Enter…",
  disabled,
  invalid,
  className,
  accessibilityLabel,
}: ChipInputProps) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const colors = useThemeColors();

  function add(raw: string) {
    const v = raw.trim();
    if (!v) return;
    if (value.includes(v)) return;
    onChange([...value, v]);
    setDraft("");
  }
  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <View
      className={cn(
        "min-h-10 w-full flex-row flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1.5",
        focused && "border-ring",
        invalid && "border-destructive",
        disabled && "opacity-50",
        className,
      )}
    >
      {value.map((v, i) => (
        <Badge key={`${v}-${i}`} variant="secondary" className="gap-1 pr-1">
          {v}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${v}`}
            disabled={disabled}
            onPress={() => remove(i)}
            className="size-4 items-center justify-center rounded-sm active:bg-muted"
          >
            <X size={12} className="text-secondary-foreground" />
          </Pressable>
        </Badge>
      ))}
      <TextInput
        accessibilityLabel={accessibilityLabel}
        editable={!disabled}
        value={draft}
        onChangeText={(text) => {
          if (text.endsWith(",")) add(text.slice(0, -1));
          else setDraft(text);
        }}
        onSubmitEditing={() => add(draft)}
        submitBehavior="submit"
        onKeyPress={(e) => {
          if (e.nativeEvent.key === "Backspace" && draft === "" && value.length > 0) remove(value.length - 1);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (draft) add(draft);
        }}
        placeholder={value.length === 0 ? placeholder : undefined}
        placeholderTextColor={colors["muted-foreground"]}
        className="min-w-[6rem] flex-1 bg-transparent px-1 py-0.5 text-sm font-normal text-foreground"
      />
    </View>
  );
}
