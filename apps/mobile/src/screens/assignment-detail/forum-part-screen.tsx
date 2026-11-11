/** The forum part on its own screen: today's forum thread, scoped to the part. */
import { View } from "react-native";
import type { AssignmentDetail, AssignmentPart } from "@space/shared";

import { Screen } from "../../design/layout/screen";
import { Text } from "../../design/ui";
import { ListSectionHeader } from "../../design/ui/grouped-list";
import { useForumThread } from "../../hooks/use-forum";
import { usePullRefresh } from "../../hooks/use-pull-refresh";
import { ForumThread } from "../forum";

type ForumPart = Extract<AssignmentPart, { kind: "FORUM" }>;

export function ForumPartScreen({
  detail,
  part,
  refresh,
}: {
  detail: AssignmentDetail;
  part: ForumPart;
  refresh: () => Promise<unknown>;
}) {
  // The same query ForumThread reads, so a pull refreshes the posts with the checklist.
  const thread = useForumThread(detail.id, part.id, !detail.readOnly);
  const pull = usePullRefresh(() => Promise.all([refresh(), detail.readOnly ? undefined : thread.refetch()]));
  const posted = detail.my?.parts.find((w) => w.partId === part.id)?.forum?.posted === true;
  return (
    <Screen title="Forum post" subtitle={detail.title} onRefresh={pull.onRefresh} refreshing={pull.refreshing}>
      <View className="gap-4">
        <View className="gap-2">
          <ListSectionHeader>Question</ListSectionHeader>
          <View className="rounded-group bg-surface p-4">
            <Text variant="body">{part.prompt}</Text>
          </View>
        </View>
        {/* A former student's feed stays closed (the server answers 403), so it is never read. */}
        {detail.readOnly ? (
          <Text variant="subhead" className="rounded-group bg-surface p-4 text-muted-foreground">
            {posted
              ? "You posted in this forum. This season has finished, so the discussion is closed."
              : "You didn't post in this forum. This season has finished, so the discussion is closed."}
          </Text>
        ) : (
          <ForumThread assignmentId={detail.id} partId={part.id} />
        )}
      </View>
    </Screen>
  );
}
