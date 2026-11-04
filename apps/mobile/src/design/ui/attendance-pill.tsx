/**
 * An attendance status as a chip with its icon: StatusChip's shape and the
 * tones and labels of statusChip("attendance") (present ok, late warn, absent
 * bad). Takes no self-alignment, like Badge.
 */
import { Check, Clock, X, type LucideIcon } from "lucide-react-native";
import { View } from "react-native";

import { iconWithClassName } from "../lib/icon";
import { cn } from "../lib/cn";
import { chipTextVariants, chipVariants, statusChip } from "./status-chip";
import { Text } from "./text";

iconWithClassName(Check, Clock, X);

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE";

const ICON: Record<AttendanceStatus, LucideIcon> = { PRESENT: Check, ABSENT: X, LATE: Clock };

function AttendancePill({ status, className }: { status: AttendanceStatus; className?: string }) {
  const { tone, label } = statusChip("attendance", status);
  const Icon = ICON[status];
  return (
    <View
      accessible
      accessibilityLabel={label}
      className={cn(chipVariants({ tone }), "self-auto gap-1", className)}
    >
      <Icon size={12} className={chipTextVariants({ tone })} />
      <Text variant="caption" numberOfLines={1} maxFontSizeMultiplier={1.3} className={chipTextVariants({ tone })}>
        {label}
      </Text>
    </View>
  );
}

export { AttendancePill };
export type { AttendanceStatus };
