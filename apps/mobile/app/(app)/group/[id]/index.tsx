import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { GroupMember } from "@space/shared";

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
import { useGroupDetail } from "../../../../src/hooks/use-groups";

/** v1 admin/season/[code]/groups/[id]: a card per list, "name / email" rows split by hairlines. */
function MemberCard({
  title,
  members,
  empty,
}: {
  title: string;
  members: GroupMember[];
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{`${title} (${members.length})`}</CardTitle>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <Text className="text-sm italic text-muted-foreground">{empty}</Text>
        ) : (
          <View className="flex-col">
            {members.map((member, i) => (
              <View
                key={member.id}
                className={i === 0 ? "flex-col pb-2" : "flex-col border-t border-border py-2"}
              >
                <Text className="font-medium">{member.name ?? "Unnamed"}</Text>
                {/* The optional field IS the staff/student switch (contract
                    withholds it from students) — no role check here. */}
                {member.email ? (
                  <Text className="text-xs text-muted-foreground">{member.email}</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </CardContent>
    </Card>
  );
}

export default function GroupDetailScreen() {
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  const { data, isPending, isError, refetch, isRefetching } = useGroupDetail(id);

  return (
    <ShellFrame refreshing={isRefetching} onRefresh={() => void refetch()}>
      {id === null ? (
        <EmptyState title="Not found" description="That group link isn't valid." />
      ) : isPending ? (
        <RouteSkeleton />
      ) : isError ? (
        <RouteError onRetry={() => void refetch()} />
      ) : (
        <View className="flex-col gap-4">
          <View className="flex-row items-start justify-between gap-4">
            <PageTitle
              className="min-w-0 flex-1"
              title={data.name}
              subtitle={data.description ?? `Group in ${data.seasonTitle}.`}
            />
            {data.canManage ? (
              <Button
                variant="outline"
                onPress={() =>
                  router.push({ pathname: "/group/[id]/edit", params: { id: String(data.id) } })
                }
              >
                Edit group
              </Button>
            ) : null}
          </View>
          <MemberCard title="Leaders" members={data.leaders} empty="No leaders assigned." />
          <MemberCard title="Students" members={data.students} empty="No students enrolled." />
        </View>
      )}
    </ShellFrame>
  );
}
