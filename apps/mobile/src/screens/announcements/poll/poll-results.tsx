import { View } from "react-native";
import { Check } from "lucide-react-native";
import type { AnnouncementPoll } from "@space/shared";

import { iconWithClassName } from "../../../design/lib/icon";
import { Text } from "../../../design/ui";
import { POLL_COPY, pollPercent, resultRowLabel, votersFooter } from "./poll-copy";

iconWithClassName(Check);

/**
 * The counts: per option its label, a static bar (a View whose width is the
 * percentage; no grow, calm motion), the count and the share of voters. The
 * reader's own pick says "Your vote" in words beside a check, never colour alone.
 */
export function PollResults({ poll }: { poll: AnnouncementPoll }) {
  if (poll.voterCount === null) return <HiddenCounts poll={poll} />;
  const voterCount = poll.voterCount;
  return (
    <View className="flex-col gap-3">
      {poll.options.map((option) => {
        const votes = option.votes ?? 0;
        const pct = pollPercent(votes, voterCount);
        const mine = poll.myOptionIds.includes(option.id);
        return (
          <View
            key={option.id}
            accessible
            accessibilityLabel={resultRowLabel(option.label, votes, pct, mine)}
            className="flex-col gap-1.5"
          >
            <View className="flex-row items-start gap-3">
              <Text variant="subhead" className="min-w-0 flex-1 font-medium text-foreground">
                {option.label}
              </Text>
              <Text variant="subhead" tabular className="shrink-0 text-muted-foreground">
                {`${votes} · ${pct}%`}
              </Text>
            </View>
            <View className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <View className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </View>
            {mine ? (
              <View className="flex-row items-center gap-1">
                <Check size={14} className="text-primary" />
                <Text variant="caption" className="font-semibold text-foreground">
                  {POLL_COPY.yourVote}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
      <Text variant="caption" className="text-muted-foreground">
        {votersFooter(voterCount)}
      </Text>
    </View>
  );
}

/** Counts the reader may not see yet (they can't vote and don't manage it): the options alone, never invented zeros. */
function HiddenCounts({ poll }: { poll: AnnouncementPoll }) {
  return (
    <View className="flex-col gap-2">
      {poll.options.map((option) => (
        <Text key={option.id} variant="subhead" className="font-medium text-foreground">
          {option.label}
        </Text>
      ))}
    </View>
  );
}
