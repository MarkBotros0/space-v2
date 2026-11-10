/** The row under a poll (refactor FE-081): Vote / Change vote, See who voted, Close / Reopen, each only for who may. */
import { View } from "react-native";

import { PillButton } from "../../../design/ui";
import { POLL_COPY } from "./poll-copy";

export function PollActions({
  canOpenChoices,
  voted,
  busy,
  canSeeNames,
  canManage,
  closed,
  onChoose,
  onSeeVoters,
  onCloseOrReopen,
}: {
  canOpenChoices: boolean;
  voted: boolean;
  busy: boolean;
  canSeeNames: boolean;
  canManage: boolean;
  closed: boolean;
  onChoose: () => void;
  onSeeVoters: () => void;
  onCloseOrReopen: () => void;
}) {
  if (!canOpenChoices && !canSeeNames && !canManage) return null;
  return (
    <View className="flex-row flex-wrap gap-2">
      {canOpenChoices ? (
        <PillButton label={voted ? POLL_COPY.changeVote : POLL_COPY.vote} disabled={busy} onPress={onChoose} />
      ) : null}
      {canSeeNames ? <PillButton label={POLL_COPY.seeWhoVoted} onPress={onSeeVoters} /> : null}
      {canManage ? (
        <PillButton
          label={closed ? POLL_COPY.reopenPoll : POLL_COPY.closePoll}
          disabled={busy}
          onPress={onCloseOrReopen}
        />
      ) : null}
    </View>
  );
}
