/**
 * Port of v1 src/components/ui/label.tsx.
 * Native differences: select-none dropped; data-[disabled] → `disabled` prop.
 */
import type { ReactNode } from "react";

import { cn } from "../lib/cn";
import { Text } from "./text";

function Label({ className, disabled, children, nativeID }: { className?: string; disabled?: boolean; children?: ReactNode; nativeID?: string }) {
  return (
    <Text nativeID={nativeID} className={cn("text-sm font-medium leading-none text-foreground", disabled && "opacity-50", className)}>
      {children}
    </Text>
  );
}

export { Label };
