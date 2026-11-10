/**
 * Inset grouped list: GroupedList (surface, radius 16, hairline separators),
 * ListRow (min-height 52, one-line title by default, caption subtitle, optional trailing
 * node and chevron) and ListSectionHeader. A row is a button only when it has
 * onPress, and dims while pressed. Rows appear at once: no entrance animation
 * (owner, 2026-11-07).
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

import { usePressDim } from "../motion";
import { cn } from "../lib/cn";
import { iconWithClassName } from "../lib/icon";
import { PillButton } from "./pill-button";
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

type HeaderAction = { label: string; onPress: () => void };

function GroupedList({
  children,
  header,
  headerAction,
  className,
}: {
  children: ReactNode;
  header?: string;
  headerAction?: HeaderAction;
  className?: string;
}) {
  const rows = Children.toArray(children);
  return (
    <View className={className}>
      {header && headerAction ? (
        <View className="flex-row items-center justify-between gap-2 pb-1.5">
          <ListSectionHeader className="min-w-0 flex-1 pb-0">{header}</ListSectionHeader>
          <PillButton label={headerAction.label} onPress={headerAction.onPress} />
        </View>
      ) : header ? (
        <ListSectionHeader>{header}</ListSectionHeader>
      ) : null}
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
  /** One line under the title, ellipsized, above the subtitle: a value that must not wrap (an email). */
  detail?: string;
  /** Left of the title (an avatar or icon). */
  leading?: ReactNode;
  trailing?: ReactNode;
  /**
   * Under the subtitle, inside the text column: chips that would squeeze the title
   * if they sat beside it. They wrap rather than eat the width. Add them to the
   * spoken label with `trailingLabel`.
   */
  footer?: ReactNode;
  /** What `trailing` says, for screen readers. Defaults to its `label` prop (StatusChip). */
  trailingLabel?: string;
  /**
   * Where `trailing` sits. "side" (default) is a column right of the text; "below"
   * puts it under the subtitle so a chip never takes width from long metadata
   * (the Follow up chip on a note row, at font 1.3).
   */
  trailingPlacement?: "side" | "below";
  chevron?: boolean;
  /** Draws the title in the error tone, for an action that ends something (Sign out). */
  destructive?: boolean;
  onPress?: () => void;
  /** Fires when a touch lands, alongside the press dim (a screen warms a screen it is about to open). */
  onPressIn?: () => void;
  /** Lines the title may take before it ellipsizes. Default 1; `null` sets no cap (free text read in full). */
  titleLines?: number | null;
  /** Lines the subtitle may take before it ellipsizes. Default 2; `null` sets no cap. */
  subtitleLines?: number | null;
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

function ListRow({
  title,
  subtitle,
  detail,
  leading,
  trailing,
  footer,
  trailingLabel,
  trailingPlacement = "side",
  chevron,
  destructive,
  onPress,
  onPressIn,
  titleLines = 1,
  subtitleLines = 2,
  className,
}: ListRowProps) {
  const press = usePressDim();
  const content = (
    <View className={cn("min-h-[52px] flex-row items-center gap-3 px-4 py-2", className)}>
      {leading ? <View className="shrink-0">{leading}</View> : null}
      <View className="min-w-0 flex-1">
        <Text
          variant="body"
          numberOfLines={titleLines ?? undefined}
          ellipsizeMode="tail"
          className={destructive ? "text-bad" : undefined}
        >
          {title}
        </Text>
        {detail ? (
          <Text variant="caption" numberOfLines={1} ellipsizeMode="tail" className="text-muted-foreground">
            {detail}
          </Text>
        ) : null}
        {subtitle ? (
          <Text variant="caption" numberOfLines={subtitleLines ?? undefined} className="text-muted-foreground">
            {subtitle}
          </Text>
        ) : null}
        {trailing && trailingPlacement === "below" ? <View className="mt-1.5 self-start">{trailing}</View> : null}
        {footer ? (
          <View testID="list-row-footer" className="mt-1 flex-row flex-wrap items-center gap-1.5">
            {footer}
          </View>
        ) : null}
      </View>
      {trailing && trailingPlacement === "side" ? <View className="shrink-0">{trailing}</View> : null}
      {chevron ? <ChevronRight testID="list-row-chevron" size={16} className="text-muted-foreground" /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        title,
        [detail, subtitle].filter(Boolean).join("\n"),
        spokenTrailing(trailing, trailingLabel),
      ]
        .filter(Boolean)
        .join(", ")}
      onPress={onPress}
      onPressIn={() => {
        press.onPressIn();
        onPressIn?.();
      }}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={press.animatedStyle}>{content}</Animated.View>
    </Pressable>
  );
}

export { GroupedList, ListRow, ListSectionHeader };
