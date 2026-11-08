import type { ReactNode } from "react";
import { useLocalSearchParams } from "expo-router";

import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { EmptyState } from "../../../../src/design/ui";
import { useAnnouncement } from "../../../../src/hooks/use-announcements";
import { usePullRefresh } from "../../../../src/hooks/use-pull-refresh";
import { parsePositiveInt } from "../../../../src/lib/params";
import { PostView } from "../../../../src/screens/announcements/post-view";

/** /announcements/[id]: one post. A post that is gone, or never visible to this reader, reads "This post was removed". */
export default function AnnouncementScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(raw);
  const post = useAnnouncement(id);
  const pull = usePullRefresh(() => post.refetch());

  let body: ReactNode;
  if (id === null) body = <EmptyState title="This post was removed" />;
  else if (post.isPending) body = <RouteSkeleton />;
  else if (post.isError) body = <RouteError onRetry={() => void post.refetch()} />;
  else if ("removed" in post.data) body = <EmptyState title="This post was removed" />;
  else body = <PostView post={post.data} />;

  return (
    <Screen title="Announcement" refreshing={pull.refreshing} onRefresh={pull.onRefresh}>
      {body}
    </Screen>
  );
}
