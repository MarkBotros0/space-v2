/** Port of v1 src/components/ui/separator.tsx. Native differences: none visible. */
import { View } from "react-native";

import { cn } from "../lib/cn";

function Separator({ className, orientation = "horizontal" }: { className?: string; orientation?: "horizontal" | "vertical" }) {
  return (
    <View
      accessibilityRole="none"
      className={cn("shrink-0 bg-border", orientation === "horizontal" ? "h-px w-full" : "h-full w-px", className)}
    />
  );
}

export { Separator };
