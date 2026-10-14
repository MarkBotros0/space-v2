/**
 * Port of v1 src/components/ui/badge.tsx.
 * Native differences: v1's single class string is split — box classes on the
 * View (badgeVariants), text classes on the Text (badgeTextVariants);
 * whitespace-nowrap → numberOfLines={1}; [&_svg]:size-3 → icons size 12;
 * inline-flex has no native equivalent: like Button, a Badge takes no
 * self-alignment; a call site that is a block in v1 (or uses w-fit) adds self-start.
 */
import { cva, type VariantProps } from "class-variance-authority";
import { Children, type ReactNode, isValidElement } from "react";
import { View } from "react-native";

import { cn } from "../lib/cn";
import { Text } from "./text";

const badgeVariants = cva("flex-row items-center gap-1 rounded-full border border-transparent px-2 py-0.5", {
  variants: {
    variant: {
      default: "bg-muted",
      secondary: "bg-secondary",
      outline: "border-border bg-transparent",
      success: "bg-success-100",
      warning: "bg-warning-100",
      error: "bg-error-100",
      info: "bg-info-100",
      teal: "bg-brand-teal-100 border-brand-teal-200",
    },
    role: {
      none: "",
      super: "bg-role-super",
      admin: "bg-role-admin",
      leader: "bg-role-leader",
      mentor: "bg-role-mentor",
      student: "bg-role-student",
    },
  },
  defaultVariants: { variant: "default", role: "none" },
});

const badgeTextVariants = cva("text-xs font-medium", {
  variants: {
    variant: {
      default: "text-muted-foreground",
      secondary: "text-secondary-foreground",
      outline: "text-foreground",
      success: "text-success-800",
      warning: "text-warning-800",
      error: "text-error-800",
      info: "text-info-800",
      teal: "text-brand-teal-800",
    },
    role: {
      none: "",
      super: "text-role-super-foreground",
      admin: "text-role-admin-foreground",
      leader: "text-role-leader-foreground",
      mentor: "text-role-mentor-foreground",
      student: "text-role-student-foreground",
    },
  },
  defaultVariants: { variant: "default", role: "none" },
});

type BadgeProps = VariantProps<typeof badgeVariants> & {
  className?: string;
  textClassName?: string;
  children?: ReactNode;
};

function Badge({ className, textClassName, variant, role, children }: BadgeProps) {
  return (
    <View className={cn(badgeVariants({ variant, role }), className)}>
      {Children.map(children, (child) =>
        typeof child === "string" || typeof child === "number" ? (
          <Text numberOfLines={1} className={cn(badgeTextVariants({ variant, role }), textClassName)}>
            {child}
          </Text>
        ) : isValidElement(child) ? (
          child
        ) : null,
      )}
    </View>
  );
}

export { Badge, badgeVariants, badgeTextVariants };
export type { BadgeProps };
