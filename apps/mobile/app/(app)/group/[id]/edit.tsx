import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { GroupDetail, SeasonRosterRow } from "@space/shared";

import { GroupForm } from "../../../../src/components/GroupForm";
import { FormErrorBox } from "../../../../src/design/forms/form-parts";
import { PageTitle } from "../../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { ShellFrame } from "../../../../src/design/layout/shell-frame";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Text,
} from "../../../../src/design/ui";
import {
  useDeleteGroup,
  useGroupImpact,
  useSeasonRoster,
  useUpdateGroup,
} from "../../../../src/hooks/use-group-admin";
import { useGroupDetail } from "../../../../src/hooks/use-groups";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { parsePositiveInt } from "../../../../src/lib/params";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

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
      onSuccess: () => router.replace("/groups"),
      onError: (err) => setMessage(apiErrorMessage(err, "Couldn't delete the group.")),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Delete</CardTitle>
      </CardHeader>
      <CardContent className="flex-col gap-3">
        {impact.isPending ? (
          <RouteSkeleton />
        ) : impact.isError ? (
          <RouteError onRetry={() => void impact.refetch()} />
        ) : (
          <>
            <Text className="text-sm">
              {`Deleting unassigns ${plural(impact.data.studentCount, "student")} and removes ${plural(impact.data.leaderCount, "leader")}.`}
            </Text>
            {impact.data.soleTargetAssignments.length > 0 ? (
              <View className="flex-col gap-1">
                <Text className="text-sm font-medium">
                  These assignments target only this group — retarget them first:
                </Text>
                {impact.data.soleTargetAssignments.map((a) => (
                  <Text key={a.id} className="text-xs text-muted-foreground">
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
      </CardContent>
    </Card>
  );
}

function EditGroupLoaded({ detail, roster }: { detail: GroupDetail; roster: SeasonRosterRow[] }) {
  const router = useRouter();
  const update = useUpdateGroup(detail.id);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <View className="flex-col gap-4">
      <PageTitle title={`Edit ${detail.name}`} subtitle="Update group details and membership." />
      <Card>
        <CardContent className="pt-6">
          <GroupForm
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
          />
        </CardContent>
      </Card>
      <DeleteGroup groupId={detail.id} />
    </View>
  );
}

export default function EditGroupScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(raw);
  const detail = useGroupDetail(id);
  const roster = useSeasonRoster(detail.data?.canManage ? detail.data.seasonId : null);

  let body: ReactNode;
  if (id === null)
    body = <EmptyState title="Not found" description="That group link isn't valid." />;
  else if (detail.isPending) body = <RouteSkeleton />;
  else if (detail.isError) body = <RouteError onRetry={() => void detail.refetch()} />;
  else if (!detail.data.canManage)
    body = (
      <EmptyState
        title="Not available"
        description="Only this season's admins can edit its groups."
      />
    );
  else if (roster.isPending) body = <RouteSkeleton />;
  else if (roster.isError) body = <RouteError onRetry={() => void roster.refetch()} />;
  else body = <EditGroupLoaded key={detail.data.id} detail={detail.data} roster={roster.data} />;

  return <ShellFrame>{body}</ShellFrame>;
}
