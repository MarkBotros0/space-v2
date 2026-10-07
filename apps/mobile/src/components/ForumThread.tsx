import { useState } from "react";
import { View } from "react-native";
import { countWords, type ForumComment, type ForumPost, type ForumView } from "@space/shared";

import {
  useDeleteComment,
  useForumComments,
  useForumThread,
  usePostComment,
  useSubmitForumResponse,
} from "../hooks/use-forum";
import { apiErrorMessage } from "../lib/api-error";
import { formatDate } from "../lib/format";
import { useSessionStore } from "../store/session";
import { useTheme } from "../theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Text } from "../ui";

function ComposeCard({ assignmentId, view }: { assignmentId: number; view: ForumView }) {
  const theme = useTheme();
  const own = view.own;
  const submit = useSubmitForumResponse(assignmentId);
  const [draft, setDraft] = useState<string | null>(null);
  if (own === null) return null;

  const value = draft ?? own.text;
  const words = countWords(value);
  const minWords = view.minWords ?? 0;
  // Math.max(1, ...): an empty post must never unlock the feed (D-14.5).
  const tooShort = words < Math.max(1, minWords);

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      {own.feedback ? (
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="label">Feedback from your leader</Text>
          <Text variant="body">{own.feedback}</Text>
          {own.reviewedAt ? (
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {formatDate(own.reviewedAt)}
            </Text>
          ) : null}
        </View>
      ) : null}
      {/* Plain text, one Input: the server converts to and from stored HTML. */}
      <Input
        label="Your response"
        value={value}
        onChangeText={setDraft}
        multiline
        numberOfLines={6}
      />
      <Text variant="caption" color={theme.colors.neutral[600]}>
        {`${words} / ${minWords} words`}
      </Text>
      {submit.isError ? (
        <Text variant="caption" color={theme.colors.error[700]}>
          {apiErrorMessage(submit.error, "Couldn't post your response. Try again.")}
        </Text>
      ) : null}
      <Button
        title={own.posted ? "Update response" : "Post response"}
        onPress={() => {
          if (tooShort) return;
          submit.mutate(value);
        }}
        disabled={tooShort}
        loading={submit.isPending}
      />
    </Card>
  );
}

function CommentRow({ comment, assignmentId }: { comment: ForumComment; assignmentId: number }) {
  const theme = useTheme();
  const remove = useDeleteComment(assignmentId);
  const [armed, setArmed] = useState(false);

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="label">{comment.authorDisplayName}</Text>
      <Text variant="body">{comment.body}</Text>
      {/* canDelete is the server's answer; the client never re-derives it. */}
      {comment.canDelete ? (
        <Button
          title={armed ? "Confirm delete" : "Delete"}
          accessibilityLabel="Delete comment"
          variant="ghost"
          loading={remove.isPending}
          onPress={() => {
            if (!armed) {
              setArmed(true);
              return;
            }
            setArmed(false);
            remove.mutate(comment.id);
          }}
        />
      ) : null}
      {remove.isError ? (
        <Text variant="caption" color={theme.colors.error[700]}>
          {apiErrorMessage(remove.error, "Couldn't delete the comment.")}
        </Text>
      ) : null}
    </View>
  );
}

function PostCard({
  assignmentId,
  post,
  allowComments,
}: {
  assignmentId: number;
  post: ForumPost;
  allowComments: boolean;
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const comments = useForumComments(assignmentId, post.submissionPublicId, expanded);
  const postComment = usePostComment(assignmentId);

  const remaining = post.commentCount - post.comments.length;
  const shown: ForumComment[] =
    expanded && comments.data ? comments.data.pages.flatMap((p) => p.comments) : post.comments;

  const send = (): void => {
    const body = draft.trim();
    if (body === "") return;
    postComment.mutate(
      { postPublicId: post.submissionPublicId, body },
      { onSuccess: () => setDraft("") },
    );
  };

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <Text variant="label">{post.authorDisplayName}</Text>
      <Text variant="body">{post.text}</Text>
      {post.submittedAt ? (
        <Text variant="caption" color={theme.colors.neutral[600]}>
          {formatDate(post.submittedAt)}
        </Text>
      ) : null}

      {allowComments ? (
        <View style={{ gap: theme.spacing.sm }}>
          {expanded && comments.isError ? (
            <ErrorState
              message="Couldn't load the comments."
              onRetry={() => void comments.refetch()}
            />
          ) : null}
          {shown.map((c) => (
            <CommentRow key={c.id} comment={c} assignmentId={assignmentId} />
          ))}
          {!expanded && remaining > 0 ? (
            <>
              <Text variant="caption" color={theme.colors.neutral[600]}>
                {`${remaining} more`}
              </Text>
              <Button title="Show all comments" variant="ghost" onPress={() => setExpanded(true)} />
            </>
          ) : null}
          {expanded && comments.isPending ? <LoadingState /> : null}
          {expanded && comments.hasNextPage ? (
            <Button
              title="More comments"
              variant="ghost"
              loading={comments.isFetchingNextPage}
              onPress={() => void comments.fetchNextPage()}
            />
          ) : null}
          {post.canComment ? (
            <View style={{ gap: theme.spacing.xs }}>
              <Input label="Add a comment" value={draft} onChangeText={setDraft} multiline />
              {postComment.isError ? (
                <Text variant="caption" color={theme.colors.error[700]}>
                  {apiErrorMessage(postComment.error, "Couldn't post your comment.")}
                </Text>
              ) : null}
              <Button
                title="Comment"
                variant="secondary"
                disabled={draft.trim() === ""}
                loading={postComment.isPending}
                onPress={send}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

export function ForumThread({ assignmentId }: { assignmentId: number }) {
  const theme = useTheme();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const query = useForumThread(assignmentId, true);

  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    return (
      <ErrorState message="Couldn't load the discussion." onRetry={() => void query.refetch()} />
    );
  }

  // Page one carries everything but the posts; later pages only add posts.
  const view = query.data.pages[0];
  if (view === undefined) return null;
  const posts = query.data.pages.flatMap((p) => p.posts);
  const canRemove = role === "LEADER" || role === "ADMIN" || role === "SUPER";

  return (
    <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.md }}>
      {/* No due date here: the screen header already shows the server's org day. */}
      <ComposeCard assignmentId={assignmentId} view={view} />

      {view.locked ? (
        <EmptyState
          title="Post to unlock the discussion"
          message="You'll see everyone else's responses once you post yours."
        />
      ) : posts.length === 0 ? (
        <EmptyState
          title="No one has posted yet."
          message="Responses from the group appear here."
        />
      ) : (
        <>
          {posts.map((p) => (
            <PostCard
              key={p.submissionPublicId}
              assignmentId={assignmentId}
              post={p}
              allowComments={view.allowComments}
            />
          ))}
          {query.hasNextPage ? (
            <Button
              title="Load more"
              variant="ghost"
              loading={query.isFetchingNextPage}
              onPress={() => void query.fetchNextPage()}
            />
          ) : null}
        </>
      )}

      {canRemove && !view.locked ? (
        <Text variant="caption" color={theme.colors.neutral[600]}>
          You can remove comments here. Removing a whole response isn't supported yet — ask the
          author to edit it.
        </Text>
      ) : null}
    </View>
  );
}
