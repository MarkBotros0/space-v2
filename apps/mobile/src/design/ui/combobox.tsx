/**
 * Port of v1 src/components/ui/combobox.tsx — same props, copy and rows.
 * Native differences: Base UI Popover → AnchoredPopover at the trigger's
 * width; hover/focus row states → active:bg-accent; focus rings → border.
 */
import { Check, ChevronDown, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";

import { AnchoredPopover, useAnchor } from "../lib/anchored-popover";
import { iconWithClassName } from "../lib/icon";
import { cn } from "../lib/cn";
import { useThemeColors } from "../theme/use-theme-colors";
import { Text } from "./text";

iconWithClassName(Check, ChevronDown, X);

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  emptyMessage?: string;
  className?: string;
  clearable?: boolean;
  accessibilityLabel?: string;
}

/** The search box and option rows shared by Combobox and MultiSelect. */
export function OptionSearch({ value, onChangeText }: { value: string; onChangeText: (v: string) => void }) {
  const colors = useThemeColors();
  return (
    <View className="p-1">
      <TextInput
        autoFocus
        value={value}
        onChangeText={onChangeText}
        placeholder="Search…"
        placeholderTextColor={colors["muted-foreground"]}
        className="w-full rounded-sm border border-input bg-background px-2 py-1 text-sm font-normal text-foreground focus:border-ring"
      />
    </View>
  );
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select…",
  disabled,
  invalid,
  emptyMessage = "No matches.",
  className,
  clearable = true,
  accessibilityLabel,
}: ComboboxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const anchor = useAnchor();
  const selected = options.find((o) => o.value === value) ?? null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function select(v: string) {
    onChange(v);
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <Pressable
        ref={anchor.ref}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        onPress={() => {
          anchor.measure();
          setOpen(true);
        }}
        className={cn(
          "h-10 w-full flex-row items-center justify-between gap-2 rounded-md border border-input bg-background px-3",
          invalid && "border-destructive",
          disabled && "opacity-50",
          className,
        )}
      >
        <Text numberOfLines={1} className={cn("shrink text-sm", !selected && "text-muted-foreground")}>
          {selected ? selected.label : placeholder}
        </Text>
        <View className="shrink-0 flex-row items-center gap-1">
          {clearable && selected ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear"
              onPress={() => onChange(null)}
              className="size-5 items-center justify-center rounded-sm active:bg-muted"
            >
              <X size={12} className="text-muted-foreground" />
            </Pressable>
          ) : null}
          <ChevronDown size={16} className="text-muted-foreground" />
        </View>
      </Pressable>
      <AnchoredPopover open={open} onClose={() => setOpen(false)} anchor={anchor.rect} width="anchor">
        <View className="max-w-[28rem] overflow-hidden rounded-md border border-border bg-popover p-1">
          <OptionSearch value={query} onChangeText={setQuery} />
          <ScrollView className="max-h-60" keyboardShouldPersistTaps="handled">
            {filtered.length === 0 ? (
              <Text className="px-3 py-4 text-center text-sm text-muted-foreground">{emptyMessage}</Text>
            ) : (
              filtered.map((o) => (
                <Pressable
                  key={o.value}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: o.value === value }}
                  onPress={() => select(o.value)}
                  className="w-full flex-row items-start gap-2 rounded-sm px-2 py-1.5 active:bg-accent"
                >
                  <View className="mt-0.5 size-4 items-center justify-center">
                    {o.value === value ? <Check size={14} className="text-popover-foreground" /> : null}
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm text-popover-foreground">{o.label}</Text>
                    {o.description ? <Text className="text-xs text-muted-foreground">{o.description}</Text> : null}
                  </View>
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      </AnchoredPopover>
    </>
  );
}
