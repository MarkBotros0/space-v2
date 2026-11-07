/** One level of the People card: an icon disc, a header and an optional action pill. */
import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";

import { Text } from "../ui/text";

export function LevelHeader({
  icon: Icon,
  title,
  action,
}: {
  icon: LucideIcon;
  title: string;
  action?: ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="size-9 shrink-0 items-center justify-center rounded-full bg-info-soft">
        <Icon size={18} className="text-info" />
      </View>
      <Text variant="headline" accessibilityRole="header" className="min-w-0 flex-1">
        {title}
      </Text>
      {action}
    </View>
  );
}
