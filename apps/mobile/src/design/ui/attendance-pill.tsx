/**
 * Port of v1 src/components/ui/attendance-pill.tsx — same map.
 * Native differences: classes split between the pill View and its Text/icon.
 */
import { Check, Clock, X, type LucideIcon } from "lucide-react-native";
import { View } from "react-native";

import { iconWithClassName } from "../lib/icon";
import { cn } from "../lib/cn";
import { Text } from "./text";

iconWithClassName(Check, Clock, X);

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE";

const map: Record<AttendanceStatus, { label: string; box: string; text: string; icon: LucideIcon }> = {
  PRESENT: { label: "Present", box: "bg-success-100", text: "text-success-800", icon: Check },
  ABSENT: { label: "Absent", box: "bg-error-100", text: "text-error-800", icon: X },
  LATE: { label: "Late", box: "bg-warning-100", text: "text-warning-800", icon: Clock },
};

function AttendancePill({ status, className }: { status: AttendanceStatus; className?: string }) {
  const entry = map[status];
  const Icon = entry.icon;
  return (
    <View className={cn("self-start flex-row items-center gap-1 rounded-full px-2 py-0.5", entry.box, className)}>
      <Icon size={12} className={entry.text} />
      <Text numberOfLines={1} className={cn("text-xs font-medium", entry.text)}>
        {entry.label}
      </Text>
    </View>
  );
}

export { AttendancePill };
export type { AttendanceStatus };
