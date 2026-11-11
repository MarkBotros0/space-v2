import { Trash2 } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { type ForumComment } from "@space/shared";

import { iconWithClassName } from "../../design/lib/icon";
import { Button, ConfirmDialog, Text } from "../../design/ui";
import { useDeleteComment } from "../../hooks/use-forum";
import { apiErrorMessage } from "../../lib/api-error";
import { formatTimeAgo } from "../../lib/format";

iconWithClassName(Trash2);

import { PersonAvatar } from "./shared";

export function CommentRow({
  comment,
  assignmentId,
  partId,
}: {
  comment: ForumComment;
  assignmentId: number;
  partId: number;
}) {
  const remove = useDeleteComment(assignmentId, partId);
  const [confirming, setConfirming] = useState(false);

  return (
    <View className="flex-row items-start gap-2.5">
      <PersonAvatar name={comment.authorDisplayName} />
      <View className="flex-1 flex-col rounded-control bg-muted/50 px-3 py-2">
        <View className="flex-row items-center justify-between gap-2">
          <Text className="shrink text-xs font-semibold text-foreground">{comment.authorDisplayName}</Text>
          <View className="flex-row items-center gap-2">
            <Text className="text-caption text-muted-foreground">{formatTimeAgo(comment.createdAt)}</Text>
            {/* canDelete is the server's answer; the client never re-derives it. */}
            {comment.canDelete ? (
              <Button
                variant="plain"
                size="icon"
                accessibilityLabel="Delete comment"
                disabled={remove.isPending}
                onPress={() => setConfirming(true)}
              >
                <Trash2 size={12} className="text-muted-foreground" />
              </Button>
            ) : null}
          </View>
        </View>
        <Text className="text-sm text-foreground">{comment.body}</Text>
        {remove.isError ? (
          <Text className="text-xs text-error-700">
            {apiErrorMessage(remove.error, "Couldn't delete the comment.")}
          </Text>
        ) : null}
      </View>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete comment?"
        description="This removes the comment for everyone."
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          setConfirming(false);
          remove.mutate(comment.id);
        }}
      />
    </View>
  );
}
