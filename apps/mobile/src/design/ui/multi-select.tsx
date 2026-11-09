/**
 * Port of v1 src/components/ui/multi-select.tsx — same props, copy, badges
 * and checkbox rows.
 * The options open in a bottom sheet that lifts above the keyboard, search on
 * top (owner, 2026-11-07); rows are 44pt; hover/focus → active:bg-accent.
 */
import { Check, ChevronDown, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { iconWithClassName } from "../lib/icon";
import { cn } from "../lib/cn";
import { Badge } from "./badge";
import { OptionSearch } from "./combobox";
import { Sheet } from "./sheet";
import { Text } from "./text";

iconWithClassName(Check, ChevronDown, X);

interface MultiSelectOption {
  value: string;
  label: string;
  description?: string;
}

interface MultiSelectProps {
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
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={cn(
          "min-h-[44px] w-full flex-row flex-wrap items-center gap-1 rounded-control border border-control-border bg-surface px-2 py-1.5",
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
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          setQuery("");
        }}
        title={accessibilityLabel ?? placeholder}
        avoidKeyboard
      >
        <OptionSearch value={query} onChangeText={setQuery} />
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
                className="min-h-[44px] w-full flex-row items-center gap-3 rounded-control px-2 py-2 active:bg-accent"
              >
                <View className="size-5 items-center justify-center rounded-sm border border-control-border bg-surface">
                  {selected ? <Check size={14} className="text-foreground" /> : null}
                </View>
                <View className="flex-1">
                  <Text variant="body" className="text-foreground">{o.label}</Text>
                  {o.description ? <Text variant="caption" className="text-muted-foreground">{o.description}</Text> : null}
                </View>
              </Pressable>
            );
          })
        )}
      </Sheet>
    </>
  );
}
