/**
 * A person as a pill: initials and name. "You" is picked out in teal, in words
 * as well as colour. Used where people are shown together rather than as list
 * rows (a student's group card, a season's People card).
 */
import { View } from "react-native";

import { cn } from "../lib/cn";
import { Text } from "./text";

export function PersonPill({
  name,
  initials,
  you = false,
}: {
  name: string;
  initials: string;
  you?: boolean;
}) {
  return (
    <View
      className={cn(
        "flex-row items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5",
        you
          ? "border border-brand-teal-300 bg-brand-teal-100 dark:border-brand-teal-900 dark:bg-brand-teal-950"
          : "border border-separator bg-muted/60",
      )}
    >
      <View className="size-6 items-center justify-center rounded-full bg-card">
        <Text
          maxFontSizeMultiplier={1.15}
          variant="caption"
          className="font-bold text-brand-navy-800 dark:text-brand-navy-100"
        >
          {initials}
        </Text>
      </View>
      <Text
        variant="caption"
        numberOfLines={1}
        className={cn(
          "max-w-40 font-medium",
          you ? "text-brand-teal-800 dark:text-brand-teal-200" : "text-foreground",
        )}
      >
        {name}
      </Text>
    </View>
  );
}

/** "+N more" beside a capped row of pills. */
export function MorePill({ count }: { count: number }) {
  return (
    <View className="justify-center rounded-full border border-separator px-2.5 py-1">
      <Text variant="caption" className="font-medium text-muted-foreground">
        {`+${count} more`}
      </Text>
    </View>
  );
}
