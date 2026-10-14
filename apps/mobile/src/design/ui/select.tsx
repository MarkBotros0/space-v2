/**
 * Port of v1 src/components/ui/select.tsx (Base UI Select), same compound API:
 * <Select items value onValueChange><SelectTrigger><SelectValue placeholder/>
 * </SelectTrigger><SelectContent><SelectItem value>…</SelectItem></SelectContent></Select>.
 * Native differences: the popup is an AnchoredPopover (6px below the
 * trigger, at least its width); data-[highlighted] → active:bg-accent;
 * focus/invalid rings → border colour.
 */
import { Check, ChevronDown } from "lucide-react-native";
import { createContext, type ReactNode, useContext, useState } from "react";
import { Pressable, ScrollView } from "react-native";

import { AnchoredPopover, useAnchor } from "../lib/anchored-popover";
import { iconWithClassName } from "../lib/icon";
import { cn } from "../lib/cn";
import { Text } from "./text";

iconWithClassName(Check, ChevronDown);

type Items = Record<string, ReactNode> | { value: string; label: ReactNode }[];

type Ctx = {
  value: string | null;
  select: (value: string) => void;
  label: (value: string | null) => ReactNode;
  open: boolean;
  setOpen: (open: boolean) => void;
  anchor: ReturnType<typeof useAnchor>;
  disabled?: boolean;
};
const SelectContext = createContext<Ctx | null>(null);
function useSelect() {
  const ctx = useContext(SelectContext);
  if (!ctx) throw new Error("Select parts must be inside <Select>");
  return ctx;
}

function Select({
  items,
  value,
  onValueChange,
  disabled,
  children,
}: {
  items?: Items;
  value: string | null;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useAnchor();
  const label = (v: string | null) => {
    if (v == null) return null;
    if (Array.isArray(items)) return items.find((i) => i.value === v)?.label ?? v;
    return items?.[v] ?? v;
  };
  const select = (v: string) => {
    onValueChange(v);
    setOpen(false);
  };
  return (
    <SelectContext.Provider value={{ value, select, label, open, setOpen, anchor, disabled }}>
      {children}
    </SelectContext.Provider>
  );
}

function SelectTrigger({
  className,
  children,
  accessibilityLabel,
  "aria-invalid": invalid,
}: {
  className?: string;
  children?: ReactNode;
  accessibilityLabel?: string;
  "aria-invalid"?: boolean;
}) {
  const { setOpen, anchor, disabled } = useSelect();
  return (
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
      {children}
      <ChevronDown size={16} className="text-muted-foreground" />
    </Pressable>
  );
}

function SelectValue({ placeholder }: { placeholder?: string }) {
  const { value, label } = useSelect();
  const shown = label(value);
  return (
    <Text numberOfLines={1} className={cn("shrink text-sm", shown == null ? "text-muted-foreground" : "text-foreground")}>
      {shown ?? placeholder ?? ""}
    </Text>
  );
}

function SelectContent({ className, children }: { className?: string; children?: ReactNode }) {
  const { open, setOpen, anchor } = useSelect();
  return (
    <AnchoredPopover open={open} onClose={() => setOpen(false)} anchor={anchor.rect} width="min-anchor">
      <ScrollView
        className={cn("max-h-80 rounded-md border border-border bg-popover", className)}
        contentContainerClassName="p-1"
      >
        {children}
      </ScrollView>
    </AnchoredPopover>
  );
}

function SelectItem({ value, className, children, disabled }: { value: string; className?: string; children?: ReactNode; disabled?: boolean }) {
  const { value: current, select } = useSelect();
  const selected = current === value;
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => select(value)}
      className={cn("relative w-full flex-row items-center gap-2 rounded-sm py-1.5 pl-2 pr-8 active:bg-accent", disabled && "opacity-50", className)}
    >
      <Text className="text-sm text-popover-foreground">{children}</Text>
      {selected ? <Check size={16} className="absolute right-2 text-popover-foreground" /> : null}
    </Pressable>
  );
}

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
