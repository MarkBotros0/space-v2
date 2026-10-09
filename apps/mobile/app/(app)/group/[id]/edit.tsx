import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { GroupDetail, SeasonRosterRow } from "@space/shared";

import { GroupForm } from "../../../../src/components/GroupForm";
import { useDeleteGroup, useGroupImpact, useSeasonRoster, useUpdateGroup } from "../../../../src/hooks/use-group-admin";
import { useGroupDetail } from "../../../../src/hooks/use-groups";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { parsePositiveInt } from "../../../../src/lib/params";
import { useTheme } from "../../../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../../../src/ui";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The confirmation v1 never had (spec 05 R45, Plan 6 D-16.13). */
function DeleteGroup({ groupId }: { groupId: number }) {
  const theme = useTheme();
  const router = useRouter();
  const impact = useGroupImpact(groupId);
  const remove = useDeleteGroup();
  const [armed, setArmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onDelete = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    setMessage(null);
    remove.mutate(groupId, {
      onSuccess: () => router.replace("/groups"),
      onError: (err) => setMessage(apiErrorMessage(err, "Couldn't delete the group.")),
    });
  };

  return (
    <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      <Text variant="heading">Delete</Text>
      {impact.isPending ? (
        <LoadingState />
      ) : impact.isError ? (
        <ErrorState message="Couldn't check what deleting would do." onRetry={() => void impact.refetch()} />
      ) : (
        <>
          <Text variant="body">
            {`Deleting unassigns ${plural(impact.data.studentCount, "student")} and removes ${plural(impact.data.leaderCount, "leader")}.`}
          </Text>
          {impact.data.soleTargetAssignments.length > 0 ? (
            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="label">These assignments target only this group — retarget them first:</Text>
              {impact.data.soleTargetAssignments.map((a) => (
                <Text key={a.id} variant="caption">{a.title}</Text>
              ))}
            </View>
          ) : null}
        </>
      )}
      {message ? <Text variant="label" color={theme.colors.error[500]}>{message}</Text> : null}
      <Button title={armed ? "Really delete?" : "Delete group"} variant="ghost" onPress={onDelete} loading={remove.isPending} />
    </Card>
  );
}

function EditGroupLoaded({ detail, roster }: { detail: GroupDetail; roster: SeasonRosterRow[] }) {
  const router = useRouter();
  const update = useUpdateGroup(detail.id);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <>
      <GroupForm
        initial={{
          name: detail.name,
          description: detail.description ?? "",
          leaderIds: detail.leaders.map((l) => l.id),
          // Membership from the season roster (SeasonEnrollment.groupId, C9) —
          // the same set the server's setGroupStudents keeps or removes.
          studentIds: roster.filter((r) => r.groupId === detail.id).map((r) => r.userId),
        }}
        submitLabel="Save group"
        submitting={update.isPending}
        message={message}
        onSubmit={(body) => {
          setMessage(null);
          update.mutate(body, {
            // v1 parity 2026-10-09 (spec 05 R97): v1 group-form.tsx:107 returns to the season's groups.
            onSuccess: () => router.replace({ pathname: "/groups", params: { seasonId: String(detail.seasonId) } }),
            onError: (err) => setMessage(apiErrorMessage(err, "Couldn't save the group.")),
          });
        }}
      />
      <DeleteGroup groupId={detail.id} />
    </>
  );
}

export default function EditGroupScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(raw);
  const detail = useGroupDetail(id);
  const roster = useSeasonRoster(detail.data?.canManage ? detail.data.seasonId : null);

  let body: ReactNode;
  if (id === null) body = <EmptyState title="Not found" message="That group link isn't valid." />;
  else if (detail.isPending) body = <LoadingState />;
  else if (detail.isError) body = <ErrorState message="Couldn't load this group." onRetry={() => void detail.refetch()} />;
  else if (!detail.data.canManage)
    body = <EmptyState title="Not available" message="Only this season's admins can edit its groups." />;
  else if (roster.isPending) body = <LoadingState />;
  else if (roster.isError) body = <ErrorState message="Couldn't load the roster." onRetry={() => void roster.refetch()} />;
  else body = <EditGroupLoaded key={detail.data.id} detail={detail.data} roster={roster.data} />;

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {body}
    </Screen>
  );
}
