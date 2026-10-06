import { useLocalSearchParams } from "expo-router";
import type { GroupMember } from "@space/shared";

import { useGroupDetail } from "../../../../src/hooks/use-groups";
import { useTheme } from "../../../../src/theme";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../../../src/ui";

function MemberSection({ title, members }: { title: string; members: GroupMember[] }) {
  const theme = useTheme();
  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <Text variant="heading">{title}</Text>
      {members.length === 0 ? (
        <Text variant="body" color={theme.colors.neutral[600]}>
          None yet.
        </Text>
      ) : (
        members.map((member) => (
          <Card key={member.id} style={{ marginTop: theme.spacing.sm }}>
            <Text variant="body">{member.name ?? "Unnamed"}</Text>
            {/* The optional field IS the staff/student switch (contract
                withholds it from students) — no role check here. */}
            {member.email ? (
              <Text variant="caption" color={theme.colors.neutral[600]}>
                {member.email}
              </Text>
            ) : null}
          </Card>
        ))
      )}
    </Card>
  );
}

export default function GroupDetailScreen() {
  const theme = useTheme();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  const { data, isPending, isError, refetch } = useGroupDetail(id);

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {id === null ? (
        <EmptyState title="Not found" message="That group link isn't valid." />
      ) : isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load this group." onRetry={refetch} />
      ) : (
        <>
          <Text variant="title">{data.name}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {data.seasonTitle}
          </Text>
          {data.description ? (
            <Text variant="body" style={{ marginTop: theme.spacing.sm }}>
              {data.description}
            </Text>
          ) : null}
          <MemberSection title="Leaders" members={data.leaders} />
          <MemberSection title="Students" members={data.students} />
        </>
      )}
    </Screen>
  );
}
