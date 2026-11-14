/**
 * One student on a finished season's Results (owner 2026-11-14): name, group and result up top,
 * then attendance, assignments and quizzes side by side, each a big figure over a thin bar, and
 * the score, End's words when the result goes against it, and the staff reason underneath. The
 * whole card opens the correction sheet. A bar is primary from 75%, warn from 50%, bad below, as
 * the student page's rings are.
 */
import { View } from "react-native";
import Animated from "react-native-reanimated";

import { usePressDim } from "../../design/motion";
import { Pressable } from "../../design/ui/pressable";
import { StatusChip, Text } from "../../design/ui";
import type { Meter, ResultCardView } from "./results-model";
import { resultCardLabel } from "./results-model";

function barClass(pct: number): string {
  if (pct >= 75) return "bg-primary";
  if (pct >= 50) return "bg-warn";
  return "bg-bad";
}

function MeterCell({ meter }: { meter: Meter }) {
  const fill = meter.pct === null ? 0 : Math.max(0, Math.min(100, meter.pct));
  return (
    <View className="min-w-0 flex-1 flex-col gap-1">
      <Text variant="caption" className="text-muted-foreground" numberOfLines={1}>
        {meter.label}
      </Text>
      <Text variant="headline" tabular numberOfLines={1}>
        {meter.value}
      </Text>
      <View className="h-1.5 w-full overflow-hidden rounded-full bg-separator">
        {meter.pct === null ? null : <View className={`h-full ${barClass(fill)}`} style={{ width: `${fill}%` }} />}
      </View>
      {meter.detail ? (
        <Text variant="caption" className="text-muted-foreground" numberOfLines={2}>
          {meter.detail}
        </Text>
      ) : null}
    </View>
  );
}

export function ResultCard({ name, view, onPress }: { name: string; view: ResultCardView; onPress: () => void }) {
  const press = usePressDim();
  const footer = [view.score, view.against].filter((l): l is string => l !== null);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={resultCardLabel(name, view)}
      accessibilityHint="Opens the result to correct it"
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={press.animatedStyle}>
        <View className="flex-col gap-4 rounded-group bg-surface p-4 dark:border dark:border-separator">
          <View className="flex-row items-start gap-3">
            <View className="min-w-0 flex-1 flex-col gap-0.5">
              <Text variant="headline" numberOfLines={2}>
                {name}
              </Text>
              {view.group ? (
                <Text variant="subhead" className="text-muted-foreground" numberOfLines={1}>
                  {view.group}
                </Text>
              ) : null}
            </View>
            <StatusChip tone={view.chip.tone} label={view.chip.label} />
          </View>
          <View className="flex-row gap-4">
            {view.meters.map((m) => (
              <MeterCell key={m.key} meter={m} />
            ))}
          </View>
          {footer.length > 0 || view.reason ? (
            <View className="flex-col gap-1 border-t border-separator pt-3">
              {footer.length > 0 ? <Text variant="subhead">{footer.join(". ")}</Text> : null}
              {view.reason ? (
                <Text variant="subhead" className="text-muted-foreground">
                  {view.reason}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}
