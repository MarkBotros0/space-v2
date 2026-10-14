/** Port of v1 src/components/ui/field.tsx (Base UI Field). Native differences: none visible. */
import type { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "../lib/cn";
import { Text } from "./text";

function Field({ className, children }: { className?: string; children?: ReactNode }) {
  return <View className={cn("flex-col gap-1.5", className)}>{children}</View>;
}

function FieldDescription({ className, children }: { className?: string; children?: ReactNode }) {
  return <Text className={cn("text-xs text-muted-foreground", className)}>{children}</Text>;
}

function FieldError({ className, children }: { className?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <Text accessibilityLiveRegion="polite" className={cn("text-xs font-medium text-destructive", className)}>
      {children}
    </Text>
  );
}

export { Field, FieldDescription, FieldError };
