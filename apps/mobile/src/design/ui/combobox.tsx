/**
 * Port of v1 src/components/ui/combobox.tsx — same props, copy and rows.
 * The options open in a bottom sheet with the search on top, and the sheet
 * lifts above the keyboard (owner, 2026-11-07: a popover under the field sat
 * behind the keyboard). Rows are 44pt; hover/focus → active:bg-accent.
 */
import { Check, ChevronDown, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { iconWithClassName } from "../lib/icon";
import { cn } from "../lib/cn";
import { useThemeColors } from "../theme/use-theme-colors";
import { Sheet } from "./sheet";
import { Text } from "./text";

iconWithClassName(Check, ChevronDown, X);

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

interface ComboboxProps {
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
    <View className="pb-2">
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Search…"
        placeholderTextColor={colors["muted-foreground"]}
        className="min-h-[44px] w-full rounded-control border border-control-border bg-surface px-3 py-0 text-base font-normal text-foreground focus:border-ring"
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
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={cn(
          "min-h-[44px] w-full flex-row items-center justify-between gap-2 rounded-control border border-control-border bg-surface px-3",
          invalid && "border-destructive",
          disabled && "opacity-50",
          className,
        )}
      >
        <Text numberOfLines={1} className={cn("shrink text-base", !selected && "text-muted-foreground")}>
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
          filtered.map((o) => (
            <Pressable
              key={o.value}
              accessibilityRole="menuitem"
              accessibilityState={{ selected: o.value === value }}
              onPress={() => select(o.value)}
              className="min-h-[44px] w-full flex-row items-center gap-2 rounded-control px-2 py-2 active:bg-accent"
            >
              <View className="size-5 items-center justify-center">
                {o.value === value ? <Check size={16} className="text-foreground" /> : null}
              </View>
              <View className="flex-1">
                <Text variant="body" className="text-foreground">
                  {o.label}
                </Text>
                {o.description ? (
                  <Text variant="caption" className="text-muted-foreground">
                    {o.description}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))
        )}
      </Sheet>
    </>
  );
}
