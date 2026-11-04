/**
 * Inset grouped list: GroupedList (surface, radius 16, hairline separators),
 * ListRow (min-height 52, one-line title, caption subtitle, optional trailing
 * node and chevron) and ListSectionHeader. A row is a button only when it has
 * onPress; `index` staggers its entrance via listItemEntering.
 */
import { Children, Fragment, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import { ChevronRight } from "lucide-react-native";

import { listItemEntering, useReducedMotion, usePressScale } from "../motion";
import { cn } from "../lib/cn";
import { iconWithClassName } from "../lib/icon";
import { Text } from "./text";

iconWithClassName(ChevronRight);

function ListSectionHeader({ children, className }: { children: string; className?: string }) {
  return (
    <Text
      variant="caption"
      accessibilityRole="header"
      className={cn("px-4 pb-1.5 font-medium uppercase tracking-wide text-muted-foreground", className)}
    >
      {children.toUpperCase()}
    </Text>
  );
}

function GroupedList({ children, header, className }: { children: ReactNode; header?: string; className?: string }) {
  const rows = Children.toArray(children);
  return (
    <View className={className}>
      {header ? <ListSectionHeader>{header}</ListSectionHeader> : null}
      <View className="overflow-hidden rounded-[16px] bg-surface">
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 ? <View className="ml-4 h-px bg-separator" /> : null}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

type ListRowProps = {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  index?: number;
  className?: string;
};

function ListRow({ title, subtitle, trailing, chevron, onPress, index = 0, className }: ListRowProps) {
  const reduced = useReducedMotion();
  const press = usePressScale(0.985);
  const content = (
    <View className={cn("min-h-[52px] flex-row items-center gap-3 px-4 py-2", className)}>
      <View className="min-w-0 flex-1">
        <Text variant="body" numberOfLines={1} ellipsizeMode="tail">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" numberOfLines={2} className="text-muted-foreground">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View className="shrink-0">{trailing}</View> : null}
      {chevron ? <ChevronRight testID="list-row-chevron" size={16} className="text-muted-foreground" /> : null}
    </View>
  );
  return (
    <Animated.View entering={listItemEntering(index, reduced)}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
          onPress={onPress}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
        >
          <Animated.View style={press.animatedStyle}>{content}</Animated.View>
        </Pressable>
      ) : (
        content
      )}
    </Animated.View>
  );
}

export { GroupedList, ListRow, ListSectionHeader };
export type { ListRowProps };
