/**
 * The pass criteria as one bar (owner, 2026-11-13: "redesign … including the pass criteria"): the
 * three weights side by side in proportion, each with a legend line naming it and its share, so the
 * mix is never colour alone. The outlook's criteria card and the criteria sheet's live preview both
 * show it. A weight of 0 takes no room in the bar and its legend reads "0%".
 */
import type { PassingNumberKey } from "@space/shared";
import { View } from "react-native";

import { Text } from "../../design/ui";
import { WEIGHT_KEYS } from "./criteria-model";
import { NUMBER_LABELS } from "./outlook-model";

const SWATCHES: Record<PassingNumberKey, string> = {
  attendance: "bg-brand-navy-600 dark:bg-brand-navy-300",
  assignments: "bg-brand-teal-600 dark:bg-brand-teal-400",
  quizzes: "bg-warning-400 dark:bg-warning-500",
};

export function WeightBar({ weights }: { weights: Record<PassingNumberKey, number> }) {
  const total = WEIGHT_KEYS.reduce((sum, key) => sum + weights[key], 0);
  return (
    <View className="flex-col gap-2">
      <View
        className="h-3 w-full flex-row overflow-hidden rounded-full bg-separator"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {WEIGHT_KEYS.filter((key) => weights[key] > 0).map((key) => (
          <View key={key} className={SWATCHES[key]} style={{ flex: weights[key] / Math.max(total, 100) }} />
        ))}
        {total < 100 ? <View style={{ flex: (100 - total) / 100 }} /> : null}
      </View>
      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        {WEIGHT_KEYS.map((key) => (
          <View key={key} className="flex-row items-center gap-1.5">
            <View className={`h-2.5 w-2.5 rounded-full ${SWATCHES[key]}`} />
            <Text variant="subhead" tabular>{`${NUMBER_LABELS[key]} ${weights[key]}%`}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
