/**
 * Port of v1 src/components/ui/multi-select.tsx — same props, copy, badges
 * and checkbox rows.
 * Native differences: Base UI Popover → AnchoredPopover at the trigger's
 * width; hover/focus states → active:bg-accent; focus rings → border.
 */
import { Check, ChevronDown, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { AnchoredPopover, useAnchor } from "../lib/anchored-popover";
import { iconWithClassName } from "../lib/icon";
import { cn } from "../lib/cn";
import { Badge } from "./badge";
import { OptionSearch } from "./combobox";
import { Text } from "./text";

iconWithClassName(Check, ChevronDown, X);

export interface MultiSelectOption {
  value: string;
  label: string;
  description?: string;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  emptyMessage?: string;
  className?: string;
  accessibilityLabel?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  disabled,
  invalid,
  emptyMessage = "No options.",
  className,
  accessibilityLabel,
}: MultiSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const anchor = useAnchor();
  const selectedSet = useMemo(() => new Set(value), [value]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function toggle(v: string) {
    if (selectedSet.has(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  }

  const selectedOptions = options.filter((o) => selectedSet.has(o.value));

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
          "min-h-10 w-full flex-row flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1.5",
          invalid && "border-destructive",
          disabled && "opacity-50",
          className,
        )}
      >
        {selectedOptions.length === 0 ? (
          <Text className="px-1 text-sm text-muted-foreground">{placeholder}</Text>
        ) : (
          selectedOptions.map((o) => (
            <Badge key={o.value} variant="secondary" className="gap-1 pr-1">
              {o.label}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${o.label}`}
                onPress={() => onChange(value.filter((x) => x !== o.value))}
                className="size-4 items-center justify-center rounded-sm active:bg-muted"
              >
                <X size={12} className="text-secondary-foreground" />
              </Pressable>
            </Badge>
          ))
        )}
        <ChevronDown size={16} className="ml-auto shrink-0 text-muted-foreground" />
      </Pressable>
      <AnchoredPopover open={open} onClose={() => setOpen(false)} anchor={anchor.rect} width="anchor">
        <View className="max-w-[28rem] overflow-hidden rounded-md border border-border bg-popover p-1">
          <OptionSearch value={query} onChangeText={setQuery} />
          <ScrollView className="max-h-60" keyboardShouldPersistTaps="handled">
            {filtered.length === 0 ? (
              <Text className="px-3 py-4 text-center text-sm text-muted-foreground">{emptyMessage}</Text>
            ) : (
              filtered.map((o) => {
                const selected = selectedSet.has(o.value);
                return (
                  <Pressable
                    key={o.value}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPress={() => toggle(o.value)}
                    className="w-full flex-row items-start gap-2 rounded-sm px-2 py-1.5 active:bg-accent"
                  >
                    <View className="mt-0.5 size-4 items-center justify-center rounded-sm border border-input">
                      {selected ? <Check size={12} className="text-popover-foreground" /> : null}
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm text-popover-foreground">{o.label}</Text>
                      {o.description ? <Text className="text-xs text-muted-foreground">{o.description}</Text> : null}
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </AnchoredPopover>
    </>
  );
}
