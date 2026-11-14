/**
 * The pieces of Reports' Organisation view (owner 2026-11-14: "renewed, more modern"): the three
 * community figures as one card of tappable cells, a list of counts over bars (active members per
 * season, alumni by school year), and a season row whose counts are small figures, not a sentence.
 */
import type { LucideIcon } from "lucide-react-native";
import { Fragment } from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";

import { iconWithClassName } from "../../design/lib/icon";
import { usePressDim } from "../../design/motion";
import { StatusChip, Text, type ChipSpec } from "../../design/ui";
import { Pressable } from "../../design/ui/pressable";

export type Figure = { key: string; label: string; value: number; icon: LucideIcon; onPress: () => void };

function FigureCell({ figure }: { figure: Figure }) {
  const press = usePressDim();
  const Icon = figure.icon;
  iconWithClassName(Icon);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${figure.label}: ${figure.value}`}
      onPress={figure.onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      className="min-w-0 flex-1"
    >
      <Animated.View style={press.animatedStyle}>
        <View className="flex-col items-start gap-2 px-3 py-4">
          <View className="size-9 items-center justify-center rounded-full bg-info-soft">
            <Icon size={18} className="text-info" />
          </View>
          <Text variant="title" tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {String(figure.value)}
          </Text>
          <Text variant="caption" numberOfLines={2} className="text-muted-foreground">
            {figure.label}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/** The community's figures side by side in one card, each opening its list. */
export function FigureCard({ figures }: { figures: Figure[] }) {
  return (
    <View testID="organisation-tiles" className="flex-row rounded-group bg-surface px-1">
      {figures.map((f, i) => (
        <Fragment key={f.key}>
          {i > 0 ? <View className="my-4 w-px bg-separator" /> : null}
          <FigureCell figure={f} />
        </Fragment>
      ))}
    </View>
  );
}

type CountBar = { key: string; label: string; count: number; unit?: string };

/** Each row: the label and its count, over a bar measured against the largest count. */
export function CountBars({ bars }: { bars: CountBar[] }) {
  const max = bars.reduce((n, b) => Math.max(n, b.count), 0);
  return (
    <View className="flex-col gap-3 rounded-group bg-surface p-4">
      {bars.map((b) => {
        const shown = b.unit ? `${b.count} ${b.unit}` : String(b.count);
        return (
          <View key={b.key} accessible accessibilityLabel={`${b.label}: ${shown}`} className="flex-col gap-1.5">
            <View className="flex-row items-baseline justify-between gap-3">
              <Text variant="body" numberOfLines={2} className="min-w-0 flex-1">
                {b.label}
              </Text>
              <Text variant="subhead" tabular className="shrink-0 font-semibold">
                {shown}
              </Text>
            </View>
            <View className="h-1.5 w-full overflow-hidden rounded-full bg-separator">
              <View
                className="h-full rounded-full bg-primary"
                style={{ width: `${max > 0 ? Math.max(2, (b.count / max) * 100) : 0}%` }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

type SeasonCounts = { label: string; value: number }[];

/** One season: title and status, then its counts as small figures; the whole row opens the season. */
export function SeasonCountsRow({
  title,
  chip,
  counts,
  onPress,
}: {
  title: string;
  chip: ChipSpec;
  counts: SeasonCounts;
  onPress: () => void;
}) {
  const press = usePressDim();
  const label = [title, ...counts.map((c) => `${c.value} ${c.label.toLowerCase()}`), chip.label].join(", ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={press.animatedStyle}>
        <View className="flex-col gap-3 px-4 py-3">
          <View className="flex-row items-start gap-3">
            <Text variant="headline" numberOfLines={2} className="min-w-0 flex-1">
              {title}
            </Text>
            <StatusChip tone={chip.tone} label={chip.label} />
          </View>
          <View className="flex-row gap-2">
            {counts.map((c) => (
              <View key={c.label} className="min-w-0 flex-1 flex-col">
                <Text variant="headline" tabular>
                  {String(c.value)}
                </Text>
                <Text variant="caption" numberOfLines={1} className="text-muted-foreground">
                  {c.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}
