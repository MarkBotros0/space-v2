/**
 * Port of v1 src/components/ui/button.tsx.
 * Native differences: hover/focus/aria/has-/in-data-/[&_svg] classes removed;
 * transitions removed; text classes live on the label Text; icons take size
 * props (xs/sm/icon-xs: 12, sm/icon-sm: 14, others: 16) instead of
 * [&_svg]:size-*; rounded-[min(var(--radius-md),10px|12px)] → rounded-md
 * (radius-md is 8px, already below both caps); disabled:opacity-50 applied
 * from the prop.
 */
import { cva, type VariantProps } from "class-variance-authority";
import { Children, type ReactNode, isValidElement } from "react";
import { Pressable, type PressableProps } from "react-native";

import { cn } from "../lib/cn";
import { shadowStyle } from "../lib/shadow";
import { Text } from "./text";

const buttonVariants = cva(
  "relative shrink-0 flex-row items-center justify-center rounded-lg border border-transparent active:translate-y-px active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-primary",
        outline: "border-border bg-background active:bg-muted dark:border-input dark:bg-input/30",
        secondary: "bg-secondary",
        ghost: "active:bg-muted",
        destructive: "bg-destructive/10 dark:bg-destructive/20",
        link: "",
      },
      size: {
        default: "h-8 gap-1.5 px-2.5",
        xs: "h-6 gap-1 rounded-md px-2",
        sm: "h-7 gap-1 rounded-md px-2.5",
        lg: "h-9 gap-1.5 px-2.5",
        icon: "size-8",
        "icon-xs": "size-6 rounded-md",
        "icon-sm": "size-7 rounded-md",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

const buttonTextVariants = cva("text-sm font-medium", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      outline: "text-foreground",
      secondary: "text-secondary-foreground",
      ghost: "text-foreground",
      destructive: "text-destructive",
      link: "text-primary",
    },
    size: {
      default: "",
      xs: "text-xs",
      sm: "text-[0.8rem]",
      lg: "",
      icon: "",
      "icon-xs": "",
      "icon-sm": "",
      "icon-lg": "",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

/** Icon size v1 forces through [&_svg:not([class*='size-'])]. */
const BUTTON_ICON_SIZE: Record<NonNullable<VariantProps<typeof buttonVariants>["size"]>, number> = {
  default: 16, xs: 12, sm: 14, lg: 16, icon: 16, "icon-xs": 12, "icon-sm": 16, "icon-lg": 16,
};

type ButtonProps = Omit<PressableProps, "children"> &
  VariantProps<typeof buttonVariants> & { className?: string; textClassName?: string; children?: ReactNode };

function Button({ className, textClassName, variant = "default", size = "default", children, disabled, ...props }: ButtonProps) {
  const elevated = variant === "default" || variant === "secondary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      className={cn(buttonVariants({ variant, size }), disabled && "opacity-50", className)}
      style={elevated ? shadowStyle("soft") : undefined}
      {...props}
    >
      {Children.map(children, (child) =>
        typeof child === "string" || typeof child === "number" ? (
          <Text numberOfLines={1} className={cn(buttonTextVariants({ variant, size }), textClassName)}>
            {child}
          </Text>
        ) : isValidElement(child) ? (
          child
        ) : null,
      )}
    </Pressable>
  );
}

export { Button, buttonVariants, buttonTextVariants, BUTTON_ICON_SIZE };
