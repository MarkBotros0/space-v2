/**
 * Port of v1 src/components/ui/tabs.tsx (Base UI Tabs) — controlled
 * (value/onValueChange) or uncontrolled (defaultValue).
 * v1 styles the selected tab with data-[selected]:…, but Base UI marks it
 * data-active, so in v1 no tab ever looks selected (all muted, no teal
 * underline). That is reproduced here (owner rule: match v1 exactly) and
 * listed in gaps-foundations.md as a v1 bug; the selected state is still
 * exposed to accessibility. v1's inline-flex list stretches to full width
 * inside the flex-col root, as a View does. Hover/focus dropped.
 */
import { createContext, type ReactNode, useContext, useState } from "react";
import { Pressable, View } from "react-native";

import { cn } from "../lib/cn";
import { Text } from "./text";

type Ctx = { value: string; setValue: (v: string) => void };
const TabsContext = createContext<Ctx>({ value: "", setValue: () => {} });

function Tabs({
  value: valueProp,
  defaultValue = "",
  onValueChange,
  className,
  children,
}: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children?: ReactNode;
}) {
  const [inner, setInner] = useState(defaultValue);
  const value = valueProp ?? inner;
  const setValue = (next: string) => {
    if (valueProp === undefined) setInner(next);
    onValueChange?.(next);
  };
  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <View className={cn("flex-col gap-5", className)}>{children}</View>
    </TabsContext.Provider>
  );
}

function TabsList({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <View accessibilityRole="tablist" className={cn("relative flex-row items-center gap-1 border-b border-border", className)}>
      {children}
    </View>
  );
}

function TabsTrigger({ value, className, children, disabled }: { value: string; className?: string; children?: ReactNode; disabled?: boolean }) {
  const ctx = useContext(TabsContext);
  const selected = ctx.value === value;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => ctx.setValue(value)}
      className={cn("relative -mb-px flex-row items-center gap-1.5 border-b-2 border-transparent px-3 py-2", className)}
    >
      {typeof children === "string" ? (
        <Text className="text-sm font-medium text-muted-foreground">{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

function TabsContent({ value, className, children }: { value: string; className?: string; children?: ReactNode }) {
  const ctx = useContext(TabsContext);
  if (ctx.value !== value) return null;
  return <View className={className}>{children}</View>;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
