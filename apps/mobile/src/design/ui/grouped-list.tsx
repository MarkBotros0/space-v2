/**
 * Inset grouped list: GroupedList (surface, radius 16, hairline separators),
 * ListRow (min-height 52, one-line title, caption subtitle, optional trailing
 * node and chevron) and ListSectionHeader. A row is a button only when it has
 * onPress; `index` staggers its entrance via listItemEntering.
 *
 * A pressable row's accessibility label replaces its children's text, so
 * whatever the trailing slot says is spoken through the label: `trailingLabel`,
 * or else the `label` prop of a trailing element that has one (StatusChip),
 * so "Overdue" is never colour alone to a screen reader (final review I3).
 */
import { Children, Fragment, isValidElement, type ReactNode } from "react";
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
      <View className="overflow-hidden rounded-group bg-surface">
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
  /** What `trailing` says, for screen readers. Defaults to its `label` prop (StatusChip). */
  trailingLabel?: string;
  chevron?: boolean;
  onPress?: () => void;
  index?: number;
  /** Lines the title may take before it ellipsizes; default 1. */
  titleLines?: number;
  className?: string;
};

/** The trailing slot's words: explicit, or a chip-like element's `label` prop. */
function spokenTrailing(trailing: ReactNode, trailingLabel: string | undefined): string | undefined {
  if (trailingLabel !== undefined) return trailingLabel || undefined;
  if (isValidElement<{ label?: unknown }>(trailing) && typeof trailing.props.label === "string") {
    return trailing.props.label;
  }
  return undefined;
}

function ListRow({ title, subtitle, trailing, trailingLabel, chevron, onPress, index = 0, titleLines = 1, className }: ListRowProps) {
  const reduced = useReducedMotion();
  const press = usePressScale(0.985);
  const content = (
    <View className={cn("min-h-[52px] flex-row items-center gap-3 px-4 py-2", className)}>
      <View className="min-w-0 flex-1">
        <Text variant="body" numberOfLines={titleLines} ellipsizeMode="tail">
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
          accessibilityLabel={[title, subtitle, spokenTrailing(trailing, trailingLabel)]
            .filter(Boolean)
            .join(", ")}
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
