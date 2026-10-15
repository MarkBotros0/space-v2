import { Lock, MessagesSquare, Send, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { countWords, plainTextToHtml, type ForumComment, type ForumPost, type ForumView } from "@space/shared";

import { Eyebrow } from "../design/layout/page-title";
import { cn } from "../design/lib/cn";
import { iconWithClassName } from "../design/lib/icon";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  RichTextView,
  Skeleton,
  Text,
  Textarea,
} from "../design/ui";
import {
  useDeleteComment,
  useForumComments,
  useForumThread,
  usePostComment,
  useSubmitForumResponse,
} from "../hooks/use-forum";
import { apiErrorMessage } from "../lib/api-error";
import { formatDate, formatTimeAgo } from "../lib/format";
import { initialsOf } from "../lib/initials";
import { useSessionStore } from "../store/session";

iconWithClassName(Send, Trash2);

const NOTICE = {
  error: "rounded-md bg-error-50 px-3 py-2 text-sm text-error-800 dark:bg-error-950 dark:text-error-200",
  success: "rounded-md bg-success-50 px-3 py-2 text-sm text-success-800 dark:bg-success-950 dark:text-success-200",
};

/** v1 forum-view.tsx PersonAvatar: initials only (no avatar URL in the contract). */
function PersonAvatar({ name }: { name: string }) {
  return (
    <Avatar className="size-9">
      <AvatarFallback>{initialsOf(name, "?")}</AvatarFallback>
    </Avatar>
  );
}

/**
 * v1 forum-view.tsx compose card. Plain text in and out: the server converts
 * to and from stored HTML, so a rich editor here would store literal tags
 * (gap note). The leader's feedback on the own post is v2's (spec 14 D9).
 */
function ComposeCard({ assignmentId, view }: { assignmentId: number; view: ForumView }) {
  const own = view.own;
  const submit = useSubmitForumResponse(assignmentId);
  const [draft, setDraft] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  if (own === null) return null;

  const value = draft ?? own.text;
  const words = countWords(value);
  const minWords = view.minWords ?? 0;
  // Math.max(1, ...): an empty post must never unlock the feed (D-14.5).
  const tooShort = words < Math.max(1, minWords);
  const meetsMin = !tooShort;

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Your response</CardTitle>
          {own.posted ? <Badge variant="success">Posted</Badge> : null}
        </CardHeader>
        <CardContent className="flex-col gap-3">
          <Textarea
            accessibilityLabel="Your response"
            placeholder="Share your thoughts…"
            value={value}
            onChangeText={setDraft}
            className="min-h-32"
          />
          <Text
            className={cn("text-xs", meetsMin ? "text-success-700 dark:text-success-300" : "text-muted-foreground")}
          >
            {`${words} ${words === 1 ? "word" : "words"}${minWords > 0 ? ` · minimum ${minWords}` : ""}`}
          </Text>
          {submit.isError ? (
            <Text className={NOTICE.error}>{apiErrorMessage(submit.error, "Couldn't post your response. Try again.")}</Text>
          ) : null}
          {info && !submit.isPending ? <Text className={NOTICE.success}>{info}</Text> : null}
          <View className="flex-row justify-end">
            <Button
              disabled={submit.isPending || tooShort}
              onPress={() => {
                if (tooShort) return;
                const wasPosted = own.posted;
                setInfo(null);
                submit.mutate(value, { onSuccess: () => setInfo(wasPosted ? "Response updated." : "Posted!") });
              }}
            >
              {submit.isPending ? "Posting…" : own.posted ? "Update response" : "Post response"}
            </Button>
          </View>
        </CardContent>
      </Card>
      {own.feedback ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leader feedback</CardTitle>
          </CardHeader>
          <CardContent className="flex-col gap-1">
            <RichTextView html={plainTextToHtml(own.feedback)} />
            {own.reviewedAt ? <Text className="text-xs text-muted-foreground">{formatDate(own.reviewedAt)}</Text> : null}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function CommentRow({ comment, assignmentId }: { comment: ForumComment; assignmentId: number }) {
  const remove = useDeleteComment(assignmentId);
  const [confirming, setConfirming] = useState(false);

  return (
    <View className="flex-row items-start gap-2.5">
      <PersonAvatar name={comment.authorDisplayName} />
      <View className="flex-1 flex-col rounded-lg bg-muted/50 px-3 py-2">
        <View className="flex-row items-center justify-between gap-2">
          <Text className="shrink text-xs font-semibold text-foreground">{comment.authorDisplayName}</Text>
          <View className="flex-row items-center gap-2">
            <Text className="text-[10px] text-muted-foreground">{formatTimeAgo(comment.createdAt)}</Text>
            {/* canDelete is the server's answer; the client never re-derives it. */}
            {comment.canDelete ? (
              <Button
                variant="ghost"
                size="icon-xs"
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
          <Text className="text-xs text-error-700">{apiErrorMessage(remove.error, "Couldn't delete the comment.")}</Text>
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

function PostCard({ assignmentId, post, allowComments }: { assignmentId: number; post: ForumPost; allowComments: boolean }) {
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
    postComment.mutate({ postPublicId: post.submissionPublicId, body }, { onSuccess: () => setDraft("") });
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
                <Button variant="outline" size="sm" onPress={() => void comments.refetch()}>
                  Try again
                </Button>
              </View>
            ) : null}
            {shown.map((c) => (
              <CommentRow key={c.id} comment={c} assignmentId={assignmentId} />
            ))}
            {/* Comment paging is v2's (v1 loaded every comment). */}
            {!expanded && remaining > 0 ? (
              <View className="flex-row items-center gap-2">
                <Text className="text-xs text-muted-foreground">{`${remaining} more`}</Text>
                <Button variant="outline" size="sm" onPress={() => setExpanded(true)}>
                  Show all comments
                </Button>
              </View>
            ) : null}
            {expanded && comments.isPending ? <Skeleton className="h-10 rounded-lg" /> : null}
            {expanded && comments.hasNextPage ? (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                disabled={comments.isFetchingNextPage}
                onPress={() => void comments.fetchNextPage()}
              >
                More comments
              </Button>
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
              <Text className="text-xs text-error-700">{apiErrorMessage(postComment.error, "Couldn't post your comment.")}</Text>
            ) : null}
          </View>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** v1 components/forum/forum-view.tsx, with v2's paging and own-post feedback. */
export function ForumThread({ assignmentId }: { assignmentId: number }) {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const query = useForumThread(assignmentId, true);

  if (query.isPending) return <Skeleton className="h-40 rounded-2xl" />;
  if (query.isError) {
    return (
      <View className="flex-col items-start gap-2">
        <Text className="text-sm text-error-600 dark:text-error-400">Couldn't load the discussion.</Text>
        <Button variant="outline" size="sm" onPress={() => void query.refetch()}>
          Try again
        </Button>
      </View>
    );
  }

  // Page one carries everything but the posts; later pages only add posts.
  const view = query.data.pages[0];
  if (view === undefined) return null;
  const posts = query.data.pages.flatMap((p) => p.posts);
  const canRemove = role === "LEADER" || role === "ADMIN" || role === "SUPER";

  return (
    <View className="flex-col gap-4">
      <ComposeCard assignmentId={assignmentId} view={view} />

      {view.locked ? (
        <EmptyState
          icon={Lock}
          title="Post to unlock the discussion"
          description="Share your own response first to see what your group-mates wrote."
        />
      ) : posts.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="No responses yet"
          description="You're the first in your group to post. Check back soon."
        />
      ) : (
        <View className="flex-col gap-3">
          {/* The thread pages, so this counts what has loaded (gap note). */}
          <Eyebrow>{`Group discussion · ${posts.length}`}</Eyebrow>
          {posts.map((p) => (
            <PostCard key={p.submissionPublicId} assignmentId={assignmentId} post={p} allowComments={view.allowComments} />
          ))}
          {query.hasNextPage ? (
            <Button
              variant="outline"
              className="self-start"
              disabled={query.isFetchingNextPage}
              onPress={() => void query.fetchNextPage()}
            >
              Load more
            </Button>
          ) : null}
        </View>
      )}

      {canRemove && !view.locked ? (
        <Text className="text-xs text-muted-foreground">
          You can remove comments here. Removing a whole response isn't supported yet — ask the author to edit it.
        </Text>
      ) : null}
    </View>
  );
}
