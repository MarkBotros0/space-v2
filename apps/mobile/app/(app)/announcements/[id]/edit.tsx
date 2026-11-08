import { useLocalSearchParams, useRouter } from "expo-router";

import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { EmptyState } from "../../../../src/design/ui";
import { useAnnouncement, useUpdateAnnouncement } from "../../../../src/hooks/use-announcements";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { parsePositiveInt } from "../../../../src/lib/params";
import { PostForm } from "../../../../src/screens/announcements/post-form";

/** /announcements/[id]/edit: change a post's message. Where it went can't change. */
export default function EditAnnouncementScreen() {
  const router = useRouter();
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(raw);
  const post = useAnnouncement(id);
  const update = useUpdateAnnouncement(id ?? 0);

  const cannotEdit = (
    <Screen title="Edit announcement">
      <EmptyState title="This announcement can't be edited" />
    </Screen>
  );
  if (id === null) return cannotEdit;
  if (post.isPending) return <Screen title="Edit announcement"><RouteSkeleton /></Screen>;
  if (post.isError) {
    return <Screen title="Edit announcement"><RouteError onRetry={() => void post.refetch()} /></Screen>;
  }
  const data = post.data;
  if ("removed" in data || !data.canEdit) return cannotEdit;

  return (
    <PostForm
      mode="edit"
      screenTitle="Edit announcement"
      saveLabel="Save"
      toLabel={data.audience === "SEASON" ? (data.seasonTitle ?? "A season") : "Everyone"}
      initial={{ body: data.body }}
      pending={update.isPending}
      error={update.isError ? apiErrorMessage(update.error, "Couldn't save. Try again.") : null}
      onSubmit={(values) => update.mutate(values, { onSuccess: () => router.back() })}
    />
  );
}
