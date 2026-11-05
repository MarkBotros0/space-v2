import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

import { GroupForm } from "../../../src/components/GroupForm";
import { Screen } from "../../../src/design/layout/screen";
import { EmptyState } from "../../../src/design/ui";
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
    <GroupForm
      title="New group"
      subtitle={
        season.data ? `Add a group to ${season.data.title}.` : "Add a group to this season."
      }
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
  );
}

/** v1 admin/season/[code]/groups/new (spec 05 §9). Reached with ?seasonId= from /groups or the season detail. */
export default function NewGroupScreen() {
  const { seasonId: raw } = useLocalSearchParams<{ seasonId: string }>();
  const seasonId = parsePositiveInt(raw);
  if (seasonId === null) {
    return (
      <Screen title="New group">
        <EmptyState title="No season" description="Open a season first, then add a group to it." />
      </Screen>
    );
  }
  return <NewGroupForm seasonId={seasonId} />;
}
