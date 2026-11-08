import { useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Pencil, Trash2 } from "lucide-react-native";
import type { AnnouncementDetail } from "@space/shared";

import { iconWithClassName } from "../../design/lib/icon";
import { Button, Text } from "../../design/ui";
import { toast } from "../../design/ui/toaster";
import { useDeleteAnnouncement, useMarkAnnouncementRead } from "../../hooks/use-announcements";
import { apiErrorMessage } from "../../lib/api-error";
import { AudienceChip } from "./audience-chip";
import { DeletePostSheet } from "./delete-post-sheet";
import { LinkifiedText } from "./linkified-text";
import { announcementMeta } from "./meta";

iconWithClassName(Pencil, Trash2);

/** One post, in full. Opening an unread post marks it read, once. */
export function PostView({ post }: { post: AnnouncementDetail }) {
  const router = useRouter();
  const markRead = useMarkAnnouncementRead();
  const remove = useDeleteAnnouncement();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { id, isRead } = post;
  const { mutate } = markRead;

  useEffect(() => {
    if (!isRead) mutate(id);
    // Once per open: the refetch after the write flips isRead, never re-fires it.
  }, [id, isRead, mutate]);

  return (
    <View className="flex-col gap-4">
      <AudienceChip audience={post.audience} seasonTitle={post.seasonTitle} />
      <Text variant="caption" className="text-muted-foreground">
        {announcementMeta(post, true)}
      </Text>
      <LinkifiedText text={post.body} />
      {post.canEdit || post.canDelete ? (
        <View className="flex-row flex-wrap gap-2">
          {post.canEdit ? (
            <Button
              variant="secondary"
              accessibilityLabel="Edit announcement"
              onPress={() =>
                router.push({ pathname: "/announcements/[id]/edit", params: { id: String(id) } })
              }
            >
              <Pencil size={14} className="text-foreground" />
              Edit
            </Button>
          ) : null}
          {post.canDelete ? (
            <Button
              variant="destructive"
              accessibilityLabel="Delete announcement"
              onPress={() => {
                setError(null);
                setConfirming(true);
              }}
            >
              <Trash2 size={14} className="text-bad" />
              Delete
            </Button>
          ) : null}
        </View>
      ) : null}
      {error ? (
        <Text variant="subhead" className="text-bad" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <DeletePostSheet
        open={confirming}
        pending={remove.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() =>
          remove.mutate(id, {
            onSuccess: () => {
              setConfirming(false);
              toast.success("Announcement deleted");
              router.dismissTo("/announcements");
            },
            onError: (err) => {
              setConfirming(false);
              setError(apiErrorMessage(err, "Couldn't delete the announcement."));
            },
          })
        }
      />
    </View>
  );
}
