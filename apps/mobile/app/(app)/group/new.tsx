import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

import { GroupForm } from "../../../src/components/GroupForm";
import { useCreateGroup } from "../../../src/hooks/use-group-admin";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { parsePositiveInt } from "../../../src/lib/params";
import { EmptyState, Screen } from "../../../src/ui";

function NewGroupForm({ seasonId }: { seasonId: number }) {
  const router = useRouter();
  const create = useCreateGroup(seasonId);
  const [message, setMessage] = useState<string | null>(null);
  return (
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
          onSuccess: (ref) => router.replace({ pathname: "/group/[id]", params: { id: String(ref.id) } }),
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
  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {seasonId === null ? (
        <EmptyState title="No season" message="Open a season first, then add a group to it." />
      ) : (
        <NewGroupForm seasonId={seasonId} />
      )}
    </Screen>
  );
}
