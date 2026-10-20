/**
 * Port of v1 src/components/ui/input.tsx.
 * Native differences: TextInput; focus-visible: → focus: (NativeWind supports
 * focus on TextInput); the 3px focus/invalid ring has no native equivalent —
 * the border colour change carries the state; placeholder colour is a prop,
 * so it comes from useThemeColors(); hover:, file:, transitions dropped.
 */
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { TextInput, type TextInputProps } from "react-native";

import { cn } from "../lib/cn";
import { useThemeColors } from "../theme/use-theme-colors";

const inputVariants = cva(
  "w-full rounded-md border border-input bg-card/60 font-normal text-foreground focus:border-ring focus:bg-card",
  {
    variants: {
      size: {
        sm: "min-h-8 px-2.5 py-0 text-sm",
        md: "min-h-10 px-3 py-0 text-sm",
        lg: "min-h-11 px-3.5 py-0 text-base",
      },
    },
    defaultVariants: { size: "md" },
  },
);

type InputProps = TextInputProps &
  VariantProps<typeof inputVariants> & { className?: string; disabled?: boolean; "aria-invalid"?: boolean };

const Input = forwardRef<TextInput, InputProps>(({ className, size, disabled, "aria-invalid": invalid, ...props }, ref) => {
  const colors = useThemeColors();
  return (
    <TextInput
      ref={ref}
      editable={!disabled}
      placeholderTextColor={colors["muted-foreground"]}
      className={cn(inputVariants({ size }), invalid && "border-destructive", disabled && "opacity-50", className)}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input, inputVariants };
export type { InputProps };
