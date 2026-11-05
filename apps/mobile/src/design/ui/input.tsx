/**
 * Port of v1 src/components/ui/input.tsx.
 * Native differences: TextInput; focus-visible: → focus: (NativeWind supports
 * focus on TextInput); the 3px focus/invalid ring has no native equivalent —
 * the border colour change carries the state; placeholder colour is a prop,
 * so it comes from useThemeColors(); hover:, file:, transitions dropped.
 * `readOnly` shows a value you cannot change in the muted text token (7:1 on the surface);
 * `disabled` fades the whole control to half opacity, which is below 4.5:1 for the text.
 */
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { TextInput, type TextInputInstance, type TextInputProps } from "react-native";

import { cn } from "../lib/cn";
import { useThemeColors } from "../theme/use-theme-colors";

const inputVariants = cva(
  "w-full rounded-control border border-control-border bg-surface font-normal text-foreground focus:border-ring",
  {
    variants: {
      size: {
        sm: "min-h-[44px] px-3 py-0 text-subhead",
        md: "min-h-[44px] px-3 py-0 text-base",
        lg: "min-h-[48px] px-3.5 py-0 text-base",
      },
    },
    defaultVariants: { size: "md" },
  },
);

type InputProps = TextInputProps &
  VariantProps<typeof inputVariants> & { className?: string; disabled?: boolean; "aria-invalid"?: boolean };

const Input = forwardRef<TextInputInstance, InputProps>(({ className, size, disabled, "aria-invalid": invalid, ...props }, ref) => {
  const colors = useThemeColors();
  return (
    <TextInput
      ref={ref}
      editable={!disabled && !props.readOnly}
      placeholderTextColor={colors["muted-foreground"]}
      className={cn(inputVariants({ size }), invalid && "border-destructive", disabled && "opacity-50", props.readOnly && "text-muted-foreground", className)}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input, inputVariants };
export type { InputProps };
