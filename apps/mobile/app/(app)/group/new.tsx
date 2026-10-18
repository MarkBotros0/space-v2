import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { GroupForm } from "../../../src/components/GroupForm";
import { PageTitle } from "../../../src/design/layout/page-title";
import { ShellFrame } from "../../../src/design/layout/shell-frame";
import { Card, CardContent, EmptyState } from "../../../src/design/ui";
import { useCreateGroup } from "../../../src/hooks/use-group-admin";
import { useSeasonDetail } from "../../../src/hooks/use-seasons";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { parsePositiveInt } from "../../../src/lib/params";

function NewGroupForm({ seasonId }: { seasonId: number }) {
  const router = useRouter();
  const season = useSeasonDetail(seasonId);
  const create = useCreateGroup(seasonId);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <View className="flex-col gap-4">
      <PageTitle
        title="New group"
        subtitle={
          season.data ? `Add a group to ${season.data.title}.` : "Add a group to this season."
        }
      />
      <Card>
        <CardContent className="pt-6">
          <GroupForm
            seasonId={seasonId}
            groupId={null}
            initial={{ name: "", description: "", leaderIds: [], studentIds: [] }}
            submitLabel="Create group"
            submitting={create.isPending}
            message={message}
            onSubmit={(body) => {
              setMessage(null);
              create.mutate(body, {
                onSuccess: (ref) =>
                  router.replace({ pathname: "/group/[id]", params: { id: String(ref.id) } }),
                onError: (err) => setMessage(apiErrorMessage(err, "Couldn't create the group.")),
              });
            }}
          />
        </CardContent>
      </Card>
    </View>
  );
}

/** v1 admin/season/[code]/groups/new (spec 05 §9). Reached with ?seasonId= from /groups or the season detail. */
export default function NewGroupScreen() {
  const { seasonId: raw } = useLocalSearchParams<{ seasonId: string }>();
  const seasonId = parsePositiveInt(raw);
  return (
    <ShellFrame>
      {seasonId === null ? (
        <EmptyState title="No season" description="Open a season first, then add a group to it." />
      ) : (
        <NewGroupForm seasonId={seasonId} />
      )}
    </ShellFrame>
  );
}
