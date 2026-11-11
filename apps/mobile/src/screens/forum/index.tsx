import { Lock, MessagesSquare } from "lucide-react-native";
import { View } from "react-native";

import { Eyebrow } from "../../design/layout/page-title";
import { InlineError } from "../../design/layout/route-states";
import { EmptyState, Skeleton, Text } from "../../design/ui";
import { useForumThread } from "../../hooks/use-forum";
import { useRole } from "../../store/session";
import { LoadMoreButton } from "../../design/ui/load-more-button";

import { ComposeCard } from "./compose-card";
import { PostCard } from "./post-card";

/** v1 components/forum/forum-view.tsx, with v2's paging and own-post feedback. */
export function ForumThread({ assignmentId, partId }: { assignmentId: number; partId: number }) {
  const role = useRole();
  const query = useForumThread(assignmentId, partId, true);

  if (query.isPending) return <Skeleton className="h-40 rounded-group" />;
  if (query.isError) {
    return <InlineError message="Couldn't load the discussion." onRetry={() => void query.refetch()} />;
  }

  // Page one carries everything but the posts; later pages only add posts.
  const view = query.data.pages[0];
  if (view === undefined) return null;
  const posts = query.data.pages.flatMap((p) => p.posts);
  const canRemove = role === "LEADER" || role === "ADMIN" || role === "SUPER";

  return (
    <View className="flex-col gap-4">
      <ComposeCard assignmentId={assignmentId} partId={partId} view={view} />

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
          description={
            view.own !== null && !view.own.posted
              ? "Nobody in your group has posted yet."
              : "You're the first in your group to post. Check back soon."
          }
        />
      ) : (
        <View className="flex-col gap-3">
          {/* The thread pages, so this counts what has loaded (gap note). */}
          <Eyebrow>{`Group discussion · ${posts.length}`}</Eyebrow>
          {posts.map((p) => (
            <PostCard
              key={p.publicId}
              assignmentId={assignmentId}
              partId={partId}
              post={p}
              allowComments={view.allowComments}
            />
          ))}
          <LoadMoreButton query={query} className="self-start" />
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
