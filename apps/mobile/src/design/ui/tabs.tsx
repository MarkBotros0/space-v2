/**
 * Underlined tabs — controlled (value/onValueChange) or uncontrolled
 * (defaultValue). On the redesign tokens: a `separator` hairline under the
 * list, the selected tab in foreground semibold over a 2px `ring` underline
 * (3:1 in both themes), the rest in muted foreground; 44pt tall, with the
 * spring press scale on the label (classes stay off the Animated.View).
 * Plans 02–05 move the call sites to SegmentedControl and delete this file.
 */
import { createContext, type ReactNode, useContext, useState } from "react";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";

import { usePressScale } from "../motion";
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
    <View accessibilityRole="tablist" className={cn("relative flex-row items-center gap-1 border-b border-separator", className)}>
      {children}
    </View>
  );
}

function TabsTrigger({ value, className, children, disabled }: { value: string; className?: string; children?: ReactNode; disabled?: boolean }) {
  const ctx = useContext(TabsContext);
  const press = usePressScale();
  const selected = ctx.value === value;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => ctx.setValue(value)}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      className={cn(
        "relative -mb-px min-h-[44px] justify-center border-b-2 px-3",
        selected ? "border-ring" : "border-transparent",
        disabled && "opacity-50",
        className,
      )}
    >
      <Animated.View style={press.animatedStyle}>
        {typeof children === "string" ? (
          <Text
            variant="subhead"
            numberOfLines={1}
            className={selected ? "font-semibold text-foreground" : "font-medium text-muted-foreground"}
          >
            {children}
          </Text>
        ) : (
          <View className="flex-row items-center gap-1.5">{children}</View>
        )}
      </Animated.View>
    </Pressable>
  );
}

function TabsContent({ value, className, children }: { value: string; className?: string; children?: ReactNode }) {
  const ctx = useContext(TabsContext);
  if (ctx.value !== value) return null;
  return <View className={className}>{children}</View>;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
