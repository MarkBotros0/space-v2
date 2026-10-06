import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import type { UserListItem, UserStatus } from "@space/shared";

import { useSendInvite, useUsers } from "../../src/hooks/use-users";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../src/ui";

/** The four badge states, labelled exactly as v1's vocabulary (R82). */
const STATUS_LABEL: Record<UserStatus, string> = {
  active: "Active",
  invited: "Invited",
  pending: "No invite",
  inactive: "Inactive",
};

function UserRow({ item }: { item: UserListItem }) {
  const theme = useTheme();
  const router = useRouter();
  const sendInvite = useSendInvite();

  // Row-level invite: only accounts that have never activated can be invited
  // (R14) — the server enforces it; the button only renders where it can work.
  const canInvite = item.deletedAt === null && (item.status === "pending" || item.status === "invited");

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/user/[id]", params: { id: String(item.id) } })}
    >
      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="heading">{item.name}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>
          {`${item.email} · ${item.role}`}
        </Text>
        {/* The badge is its own Text node, so it is findable (and readable by
            a screen reader) as the status word alone. */}
        <Text variant="label" color={theme.colors.neutral[700]}>
          {STATUS_LABEL[item.status]}
        </Text>
        {canInvite ? (
          <View style={{ marginTop: theme.spacing.sm }}>
            <Button
              title={item.status === "invited" ? "Resend invite" : "Send invite"}
              variant="secondary"
              loading={sendInvite.isPending}
              onPress={() => sendInvite.mutate({ userId: item.id })}
            />
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

export default function UsersScreen() {
  const theme = useTheme();
  const role = useSessionStore((s) => s.user?.role ?? null);
  // `draft` is what the field shows; `q` is what was last submitted. Searching
  // on submit rather than per keystroke keeps a typed name from issuing one
  // request per character.
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const isSuper = role === "SUPER";

  const { data, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useUsers({ q }, { enabled: isSuper });

  if (!isSuper) {
    // navFor gives only SUPER a /users entry, but a route file is reachable
    // by URL regardless — the screen guards itself (ruling C8's spirit;
    // the API behind it 403s anyway).
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Users" message="Only SUPER accounts can manage users." />
      </Screen>
    );
  }

  const users = data?.pages.flatMap((page) => page.users) ?? [];

  return (
    <Screen edges={["top", "left", "right"]} padded scroll={false}>
      <View style={{ gap: theme.spacing.sm, flex: 1 }}>
        <Input
          label="Search"
          value={draft}
          onChangeText={setDraft}
          placeholder="Name or email"
          returnKeyType="search"
          autoCapitalize="none"
          onSubmitEditing={() => setQ(draft.trim())}
        />
        {isPending ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="Couldn't load users." onRetry={() => void refetch()} />
        ) : users.length === 0 ? (
          <EmptyState title="No users" message="No accounts match this search." />
        ) : (
          <FlatList
            data={users}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => <UserRow item={item} />}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
            }}
            onEndReachedThreshold={0.5}
          />
        )}
      </View>
    </Screen>
  );
}
