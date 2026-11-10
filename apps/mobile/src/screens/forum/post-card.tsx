import { Send } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { plainTextToHtml, type ForumComment, type ForumPost } from "@space/shared";

import { iconWithClassName } from "../../design/lib/icon";
import { Button, Card, CardContent, RichTextView, Skeleton, Text, Textarea } from "../../design/ui";
import { useForumComments, usePostComment } from "../../hooks/use-forum";
import { apiErrorMessage } from "../../lib/api-error";
import { formatTimeAgo } from "../../lib/format";
import { LoadMoreButton } from "../../design/ui/load-more-button";

iconWithClassName(Send);

import { PersonAvatar } from "./shared";
import { CommentRow } from "./comments";

export function PostCard({
  assignmentId,
  partId,
  post,
  allowComments,
}: {
  assignmentId: number;
  partId: number;
  post: ForumPost;
  allowComments: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const comments = useForumComments(assignmentId, partId, post.publicId, expanded);
  const postComment = usePostComment(assignmentId, partId);

  const remaining = post.commentCount - post.comments.length;
  const shown: ForumComment[] =
    expanded && comments.data ? comments.data.pages.flatMap((p) => p.comments) : post.comments;

  const send = (): void => {
    const body = draft.trim();
    if (body === "") return;
    postComment.mutate({ postPublicId: post.publicId, body }, { onSuccess: () => setDraft("") });
  };

  return (
    <Card>
      <CardContent className="flex-col gap-3 pt-6">
        <View className="flex-row items-center gap-2.5">
          <PersonAvatar name={post.authorDisplayName} />
          <View className="flex-col">
            <Text className="text-sm font-semibold text-foreground">{post.authorDisplayName}</Text>
            {post.submittedAt ? (
              <Text className="text-xs text-muted-foreground">{formatTimeAgo(post.submittedAt)}</Text>
            ) : null}
          </View>
        </View>
        <RichTextView html={post.text ? plainTextToHtml(post.text) : null} emptyText="No written response." />

        {allowComments ? (
          <View className="flex-col gap-3 border-t border-border pt-3">
            {expanded && comments.isError ? (
              <View className="flex-row items-center gap-2">
                <Text className="text-xs text-error-700">Couldn't load the comments.</Text>
                <Button variant="secondary" size="sm" onPress={() => void comments.refetch()}>
                  Try again
                </Button>
              </View>
            ) : null}
            {shown.map((c) => (
              <CommentRow key={c.id} comment={c} assignmentId={assignmentId} partId={partId} />
            ))}
            {/* Comment paging is v2's (v1 loaded every comment). */}
            {!expanded && remaining > 0 ? (
              <View className="flex-row items-center gap-2">
                <Text className="text-xs text-muted-foreground">{`${remaining} more`}</Text>
                <Button variant="secondary" size="sm" onPress={() => setExpanded(true)}>
                  Show all comments
                </Button>
              </View>
            ) : null}
            {expanded && comments.isPending ? <Skeleton className="h-10" /> : null}
            {expanded ? (
              <LoadMoreButton query={comments} label="More comments" size="sm" className="self-start" />
            ) : null}
            {post.canComment ? (
              <View className="flex-row items-end gap-2">
                <Textarea
                  accessibilityLabel="Write a comment…"
                  placeholder="Write a comment…"
                  value={draft}
                  onChangeText={setDraft}
                  className="min-h-10 flex-1"
                />
                <Button
                  size="icon"
                  accessibilityLabel="Post comment"
                  disabled={postComment.isPending || draft.trim() === ""}
                  onPress={send}
                >
                  <Send size={16} className="text-primary-foreground" />
                </Button>
              </View>
            ) : null}
            {postComment.isError ? (
              <Text className="text-xs text-error-700">
                {apiErrorMessage(postComment.error, "Couldn't post your comment.")}
              </Text>
            ) : null}
          </View>
        ) : null}
      </CardContent>
    </Card>
  );
}
