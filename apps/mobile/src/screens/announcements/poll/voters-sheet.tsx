import { View } from "react-native";

import { InlineError } from "../../../design/layout/route-states";
import { ListSectionHeader, Sheet, Skeleton, Text } from "../../../design/ui";
import { usePollVoters } from "../../../hooks/use-announcements";
import { POLL_COPY } from "./poll-copy";

/**
 * Who picked what, for a poll's managers: one section per option, names newest
 * last, "Former member" for a deleted account. Fetched only while open.
 */
export function VotersSheet({ postId, open, onClose }: { postId: number; open: boolean; onClose: () => void }) {
  const voters = usePollVoters(postId, open);
  return (
    <Sheet open={open} onClose={onClose} title={POLL_COPY.seeWhoVoted}>
      {voters.isPending ? (
        <View accessible accessibilityLabel="Loading" className="flex-col gap-2 pt-3">
          <Skeleton height={20} width="40%" />
          <Skeleton height={20} width="70%" />
          <Skeleton height={20} width="60%" />
        </View>
      ) : voters.isError ? (
        <InlineError message={POLL_COPY.votersFailed} onRetry={() => void voters.refetch()} />
      ) : (
        <View className="flex-col gap-2">
          {voters.data.options.map((option) => (
            <View key={option.id} className="flex-col">
              <ListSectionHeader className="px-0 pb-1 pt-3">{option.label}</ListSectionHeader>
              {option.voters.length === 0 ? (
                <Text variant="subhead" className="py-1 text-muted-foreground">
                  {POLL_COPY.noVoters}
                </Text>
              ) : (
                option.voters.map((voter, i) => (
                  <Text key={i} variant="body" className="py-1 text-foreground">
                    {voter.name ?? POLL_COPY.formerMember}
                  </Text>
                ))
              )}
            </View>
          ))}
        </View>
      )}
    </Sheet>
  );
}
