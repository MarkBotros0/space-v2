/**
 * Legacy Badge, kept so its call sites compile, drawn as the redesign's
 * StatusChip: v1's variants map onto the five chip tones (success → ok,
 * warning → warn, error → bad, info/teal/secondary → info, default/outline →
 * neutral), with the chip's full-round shape, caption type and colours. A
 * `role` badge keeps its role colour in the chip shape. Like Button, a Badge
 * takes no self-alignment (StatusChip's own self-start is reset); a call site
 * that sits in a block adds `self-start`. A plain-text badge is exactly a
 * StatusChip, so v1's `textClassName` size tweaks no longer apply to it; a
 * badge with an icon child or a role keeps `textClassName` on its label.
 * Plans 02–05 move the call sites to StatusChip and delete this file.
 */
import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "../lib/cn";
import { withTextRuns } from "../lib/text-runs";
import { chipTextVariants, chipVariants, StatusChip, type ChipTone } from "./status-chip";
import { Text } from "./text";

type LegacyVariant =
  "default" | "secondary" | "outline" | "success" | "warning" | "error" | "info" | "teal";
type Role = "none" | "super" | "admin" | "leader" | "mentor" | "student" | "alumni";

const TONE: Record<LegacyVariant, ChipTone> = {
  default: "neutral",
  secondary: "info",
  outline: "neutral",
  success: "ok",
  warning: "warn",
  error: "bad",
  info: "info",
  teal: "info",
};

const roleBox = cva("", {
  variants: {
    role: {
      none: "",
      super: "bg-role-super",
      admin: "bg-role-admin",
      leader: "bg-role-leader",
      mentor: "bg-role-mentor",
      student: "bg-role-student",
      alumni: "bg-role-alumni",
    },
  },
  defaultVariants: { role: "none" },
});

const roleText = cva("", {
  variants: {
    role: {
      none: "",
      super: "text-role-super-foreground",
      admin: "text-role-admin-foreground",
      leader: "text-role-leader-foreground",
      mentor: "text-role-mentor-foreground",
      student: "text-role-student-foreground",
      alumni: "text-role-alumni-foreground",
    },
  },
  defaultVariants: { role: "none" },
});

type Opts = { variant?: LegacyVariant | null; role?: Role | null };

/** Box classes: the chip's shape and tone, or its role colour. */
function badgeVariants({ variant, role }: Opts = {}): string {
  return cn(
    chipVariants({ tone: TONE[variant ?? "default"] }),
    "self-auto gap-1",
    roleBox({ role }),
  );
}

/** Label classes: the chip tone's text colour, or the role's foreground. */
function badgeTextVariants({ variant, role }: Opts = {}): string {
  return cn(chipTextVariants({ tone: TONE[variant ?? "default"] }), roleText({ role }));
}

type BadgeProps = VariantProps<typeof roleBox> & {
  variant?: LegacyVariant | null;
  className?: string;
  textClassName?: string;
  children?: ReactNode;
};

function Badge({ className, textClassName, variant, role, children }: BadgeProps) {
  const runs = withTextRuns(children, (text) => text);
  if (runs.length === 1 && typeof runs[0] === "string" && (role ?? "none") === "none") {
    return (
      <StatusChip
        tone={TONE[variant ?? "default"]}
        label={runs[0]}
        className={cn("self-auto", className)}
      />
    );
  }
  return (
    <View className={cn(badgeVariants({ variant, role }), className)}>
      {withTextRuns(children, (text, key) => (
        <Text
          key={key}
          variant="caption"
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          className={cn(badgeTextVariants({ variant, role }), textClassName)}
        >
          {text}
        </Text>
      ))}
    </View>
  );
}

export { Badge, badgeVariants, badgeTextVariants };
export type { BadgeProps };
