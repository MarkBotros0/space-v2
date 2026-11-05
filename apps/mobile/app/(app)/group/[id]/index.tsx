import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import type { GroupMember } from "@space/shared";

import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { Button, EmptyState } from "../../../../src/design/ui";
import { GroupedList, ListRow } from "../../../../src/design/ui/grouped-list";
import { useGroupDetail } from "../../../../src/hooks/use-groups";
import { useSessionStore } from "../../../../src/store/session";

/** v1 admin/season/[code]/groups/[id]: a list per role, "name / email" rows. */
function MemberList({
  title,
  members,
  empty,
  onOpen,
}: {
  title: string;
  members: GroupMember[];
  empty: string;
  /** Set when the viewer may open a member's page; rows then show a chevron. */
  onOpen?: (member: GroupMember) => void;
}) {
  return (
    <GroupedList header={`${title} (${members.length})`}>
      {members.length === 0 ? (
        <ListRow title={empty} />
      ) : (
        members.map((member) => (
          <ListRow
            key={member.id}
            title={member.name ?? "Unnamed"}
            titleLines={2}
            // The optional field IS the staff/student switch (contract
            // withholds it from students) — no role check here.
            subtitle={member.email || undefined}
            chevron={onOpen !== undefined}
            onPress={onOpen ? () => onOpen(member) : undefined}
          />
        ))
      )}
    </GroupedList>
  );
}

export default function GroupDetailScreen() {
  const router = useRouter();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  const { data, isPending, isError, refetch, isRefetching } = useGroupDetail(id);

  if (id === null)
    return (
      <Screen>
        <EmptyState title="Not found" description="That group link isn't valid." />
      </Screen>
    );
  if (isPending)
    return (
      <Screen>
        <RouteSkeleton />
      </Screen>
    );
  if (isError)
    return (
      <Screen>
        <RouteError onRetry={() => void refetch()} />
      </Screen>
    );

  const openStudent =
    role === "STUDENT"
      ? undefined
      : (m: GroupMember) =>
          router.push({ pathname: "/student/[id]", params: { id: String(m.id) } });

  return (
    <Screen
      title={data.name}
      subtitle={data.description ?? `Group in ${data.seasonTitle}.`}
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
      trailing={
        data.canManage ? (
          <Button
            variant="outline"
            onPress={() =>
              router.push({ pathname: "/group/[id]/edit", params: { id: String(data.id) } })
            }
          >
            Edit group
          </Button>
        ) : undefined
      }
    >
      <View className="flex-col gap-6">
        <MemberList title="Leaders" members={data.leaders} empty="No leaders assigned." />
        <MemberList
          title="Students"
          members={data.students}
          empty="No students enrolled."
          onOpen={openStudent}
        />
      </View>
    </Screen>
  );
}
