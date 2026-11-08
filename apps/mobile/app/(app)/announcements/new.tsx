import { useRouter } from "expo-router";

import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { Screen } from "../../../src/design/layout/screen";
import { EmptyState } from "../../../src/design/ui";
import { useAnnouncementTargets, useCreateAnnouncement } from "../../../src/hooks/use-announcements";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { PostForm } from "../../../src/screens/announcements/post-form";

/** /announcements/new: write a post to everyone or one season; a confirm names the reach before it goes out. */
export default function NewAnnouncementScreen() {
  const router = useRouter();
  const targets = useAnnouncementTargets(true);
  const create = useCreateAnnouncement();

  if (targets.isPending) return <Screen title="New announcement"><RouteSkeleton /></Screen>;
  if (targets.isError) {
    return <Screen title="New announcement"><RouteError onRetry={() => void targets.refetch()} /></Screen>;
  }
  if (!targets.data.community && targets.data.seasons.length === 0) {
    return (
      <Screen title="New announcement">
        <EmptyState title="You can't post announcements here" />
      </Screen>
    );
  }

  return (
    <PostForm
      mode="create"
      screenTitle="New announcement"
      saveLabel="Post"
      targets={targets.data}
      pending={create.isPending}
      error={create.isError ? apiErrorMessage(create.error, "Couldn't post. Try again.") : null}
      onSubmit={(request) =>
        create.mutate(request, {
          onSuccess: (post) => router.replace({ pathname: "/announcements/[id]", params: { id: String(post.id) } }),
        })
      }
    />
  );
}
