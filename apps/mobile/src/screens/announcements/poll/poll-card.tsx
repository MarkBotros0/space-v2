import { useState } from "react";
import { View } from "react-native";
import type { AnnouncementPoll } from "@space/shared";

import { InlineError } from "../../../design/layout/route-states";
import { PillButton, Text } from "../../../design/ui";
import { toast } from "../../../design/ui/toaster";
import { useClosePoll, useReopenPoll, useVotePoll } from "../../../hooks/use-announcements";
import { apiErrorCode, apiErrorMessage } from "../../../lib/api-error";
import { PollChoices } from "./poll-choices";
import { POLL_COPY, pollHeader } from "./poll-copy";
import { PollResults } from "./poll-results";
import { VotersSheet } from "./voters-sheet";

type Mode = "choose" | "results";

/**
 * What failed last. Only the kind is kept, never a closure: Try again runs that
 * action as this render sees it, so it sends the picks on screen, not a stale set.
 */
type Failure = { message: string; action: "vote" | "close" | "reopen" };

/**
 * The poll under a post. A reader who may vote and hasn't (and isn't a manager)
 * starts on the choices; everyone else on the results. Change vote / Vote bring
 * the choices back with the reader's picks ticked. A closed poll, or one the
 * reader may not vote on, only ever shows results.
 */
export function PollCard({ postId, poll }: { postId: number; poll: AnnouncementPoll }) {
  const vote = useVotePoll(postId);
  const close = useClosePoll(postId);
  const reopen = useReopenPoll(postId);
  const [mode, setMode] = useState<Mode>(() =>
    poll.canVote && poll.myOptionIds.length === 0 && !poll.canManage ? "choose" : "results",
  );
  const [picked, setPicked] = useState<number[]>(() => [...poll.myOptionIds]);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [votersOpen, setVotersOpen] = useState(false);

  // Closing (here or elsewhere) ends choosing, whatever the local mode says.
  const choosing = mode === "choose" && poll.canVote && !poll.closed;
  const voted = poll.myOptionIds.length > 0;
  const busy = vote.isPending || close.isPending || reopen.isPending;

  function startChoosing() {
    setFailure(null);
    setPicked([...poll.myOptionIds]);
    setMode("choose");
  }

  function toggle(optionId: number) {
    // Changing the picks answers the old error: Vote is the way forward now.
    setFailure(null);
    setPicked((current) => {
      if (!poll.allowsMultiple) return [optionId];
      return current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
    });
  }

  function castVote() {
    setFailure(null);
    const body = { version: poll.version, optionIds: picked };
    vote.mutate(body, {
      onSuccess: () => setMode("results"),
      onError: (err) => {
        if (apiErrorCode(err) === "poll_changed") {
          // The hook refetches the post; its new options arrive through `poll`.
          toast.error(POLL_COPY.pollChanged);
          setPicked([]);
          setMode("choose");
          return;
        }
        setFailure({ message: apiErrorMessage(err, POLL_COPY.voteFailed), action: "vote" });
      },
    });
  }

  function closeOrReopen(which: "close" | "reopen") {
    setFailure(null);
    const mutation = which === "close" ? close : reopen;
    const fallback = which === "close" ? POLL_COPY.closeFailed : POLL_COPY.reopenFailed;
    mutation.mutate(undefined, {
      onSuccess: () => setMode("results"),
      onError: (err) =>
        setFailure({ message: apiErrorMessage(err, fallback), action: which }),
    });
  }

  const canOpenChoices = !choosing && poll.canVote && !poll.closed;

  return (
    <View testID="poll-card" className="flex-col gap-4 rounded-group bg-surface-raised p-4">
      <View className="flex-row flex-wrap items-center gap-x-2">
        <Text variant="subhead" className="font-semibold text-foreground">
          {pollHeader(poll.allowsMultiple)}
        </Text>
        {poll.closed ? (
          <Text variant="subhead" className="text-muted-foreground">
            {POLL_COPY.closed}
          </Text>
        ) : null}
      </View>

      {choosing ? (
        <PollChoices poll={poll} picked={picked} onToggle={toggle} onVote={castVote} pending={vote.isPending} />
      ) : (
        <PollResults poll={poll} />
      )}

      {failure ? (
        <InlineError
          message={failure.message}
          onRetry={() => (failure.action === "vote" ? castVote() : closeOrReopen(failure.action))}
        />
      ) : null}

      {canOpenChoices || poll.canManage ? (
        <View className="flex-row flex-wrap gap-2">
          {canOpenChoices ? (
            <PillButton
              label={voted ? POLL_COPY.changeVote : POLL_COPY.vote}
              disabled={busy}
              onPress={startChoosing}
            />
          ) : null}
          {poll.canManage ? (
            <>
              <PillButton label={POLL_COPY.seeWhoVoted} onPress={() => setVotersOpen(true)} />
              <PillButton
                label={poll.closed ? POLL_COPY.reopenPoll : POLL_COPY.closePoll}
                disabled={busy}
                onPress={() => closeOrReopen(poll.closed ? "reopen" : "close")}
              />
            </>
          ) : null}
        </View>
      ) : null}

      {poll.canManage ? (
        <VotersSheet postId={postId} open={votersOpen} onClose={() => setVotersOpen(false)} />
      ) : null}
    </View>
  );
}
