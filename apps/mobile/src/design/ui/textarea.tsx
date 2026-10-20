/**
 * Port of v1 src/components/ui/textarea.tsx.
 * Native differences: multiline TextInput, top-aligned; focus ring → border.
 * `numberOfLines` (v1's `rows`) is not forwarded: on Android it fixes the
 * height at that many lines, clipping a placeholder that wraps further at a
 * larger font scale. `min-h-20` already covers v1's two rows, and the field
 * grows with its content.
 */
import { forwardRef } from "react";
import { TextInput, type TextInputProps } from "react-native";

import { cn } from "../lib/cn";
import { useThemeColors } from "../theme/use-theme-colors";

const Textarea = forwardRef<TextInput, TextInputProps & { className?: string; disabled?: boolean; "aria-invalid"?: boolean }>(
  ({ className, disabled, "aria-invalid": invalid, numberOfLines: _rows, ...props }, ref) => {
    const colors = useThemeColors();
    return (
      <TextInput
        ref={ref}
        multiline
        textAlignVertical="top"
        editable={!disabled}
        placeholderTextColor={colors["muted-foreground"]}
        className={cn(
          "min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal text-foreground focus:border-ring",
          invalid && "border-destructive",
          disabled && "opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
