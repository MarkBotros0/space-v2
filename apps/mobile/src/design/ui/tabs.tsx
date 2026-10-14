/**
 * Port of v1 src/components/ui/tabs.tsx (Base UI Tabs) — controlled
 * (value/onValueChange) or uncontrolled (defaultValue).
 * Native differences: inline-flex list → self-start row; data-[selected]
 * styles applied from state; hover/focus states dropped.
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
    <View accessibilityRole="tablist" className={cn("relative self-start flex-row items-center gap-1 border-b border-border", className)}>
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
      className={cn(
        "relative -mb-px flex-row items-center gap-1.5 border-b-2 px-3 py-2",
        selected ? "border-brand-teal-500" : "border-transparent",
        className,
      )}
    >
      {typeof children === "string" ? (
        <Text className={cn("text-sm font-medium", selected ? "text-foreground" : "text-muted-foreground")}>{children}</Text>
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
