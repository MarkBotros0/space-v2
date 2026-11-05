import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { GroupDetail, SeasonRosterRow } from "@space/shared";

import { GroupForm } from "../../../../src/components/GroupForm";
import { FormErrorBox } from "../../../../src/design/forms/form-parts";
import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { Button, EmptyState, Text } from "../../../../src/design/ui";
import {
  useDeleteGroup,
  useGroupImpact,
  useSeasonRoster,
  useUpdateGroup,
} from "../../../../src/hooks/use-group-admin";
import { useGroupDetail } from "../../../../src/hooks/use-groups";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { parsePositiveInt } from "../../../../src/lib/params";
import { countOf } from "../../../../src/lib/plural";

/** The confirmation v1 never had (spec 05 R45, Plan 6 D-16.13). V2-ONLY: drawn as a v1 card. */
function DeleteGroup({ groupId }: { groupId: number }) {
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
      // Pops this edit and the deleted group's detail under it.
      onSuccess: () => router.dismissTo("/groups"),
      onError: (err) => setMessage(apiErrorMessage(err, "Couldn't delete the group.")),
    });
  };

  return (
    <View className="flex-col gap-3">
      <Text variant="headline" accessibilityRole="header">
        Delete
      </Text>
      {impact.isPending ? (
        <RouteSkeleton />
      ) : impact.isError ? (
        <RouteError onRetry={() => void impact.refetch()} />
      ) : (
        <>
          <Text variant="subhead">
            {`Deleting unassigns ${countOf(impact.data.studentCount, "student")} and removes ${countOf(impact.data.leaderCount, "leader")}.`}
          </Text>
          {impact.data.soleTargetAssignments.length > 0 ? (
            <View className="flex-col gap-1">
              <Text variant="subhead" className="font-medium">
                These assignments target only this group — retarget them first:
              </Text>
              {impact.data.soleTargetAssignments.map((a) => (
                <Text key={a.id} variant="caption" className="text-muted-foreground">
                  {a.title}
                </Text>
              ))}
            </View>
          ) : null}
        </>
      )}
      <FormErrorBox message={message} />
      <Button
        variant="destructive"
        className="self-start"
        disabled={remove.isPending}
        onPress={onDelete}
      >
        {armed ? "Really delete?" : "Delete group"}
      </Button>
    </View>
  );
}

function EditGroupLoaded({ detail, roster }: { detail: GroupDetail; roster: SeasonRosterRow[] }) {
  const router = useRouter();
  const update = useUpdateGroup(detail.id);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <GroupForm
      title={`Edit ${detail.name}`}
      subtitle="Update group details and membership."
      seasonId={detail.seasonId}
      groupId={detail.id}
      initial={{
        name: detail.name,
        description: detail.description ?? "",
        leaderIds: detail.leaders.map((l) => l.id),
        // Membership from the season roster (SeasonEnrollment.groupId, C9) —
        // the same set the server's setGroupStudents keeps or removes.
        studentIds: roster.filter((r) => r.groupId === detail.id).map((r) => r.userId),
      }}
      submitLabel="Save changes"
      submitting={update.isPending}
      message={message}
      onSubmit={(body) => {
        setMessage(null);
        update.mutate(body, {
          onSuccess: () => router.back(),
          onError: (err) => setMessage(apiErrorMessage(err, "Couldn't save the group.")),
        });
      }}
    >
      <DeleteGroup groupId={detail.id} />
    </GroupForm>
  );
}

export default function EditGroupScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(raw);
  const detail = useGroupDetail(id);
  const roster = useSeasonRoster(detail.data?.canManage ? detail.data.seasonId : null);

  const shell = (child: ReactNode) => <Screen title="Edit group">{child}</Screen>;
  if (id === null)
    return shell(<EmptyState title="Not found" description="That group link isn't valid." />);
  if (detail.isPending) return shell(<RouteSkeleton />);
  if (detail.isError) return shell(<RouteError onRetry={() => void detail.refetch()} />);
  if (!detail.data.canManage)
    return shell(
      <EmptyState
        title="Not available"
        description="Only this season's admins can edit its groups."
      />,
    );
  if (roster.isPending) return shell(<RouteSkeleton />);
  if (roster.isError) return shell(<RouteError onRetry={() => void roster.refetch()} />);
  return <EditGroupLoaded key={detail.data.id} detail={detail.data} roster={roster.data} />;
}
