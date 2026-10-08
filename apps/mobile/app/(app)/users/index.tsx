import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, FlatList, Pressable, View } from "react-native";
import { BULK_INVITE_BATCH_SIZE, type BulkInviteResponse, type UserListItem, type UserStatus } from "@space/shared";

import { usePendingInviteCount, useSendInvite, useSendPendingInvites, useUsers } from "../../../src/hooks/use-users";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { useSessionStore } from "../../../src/store/session";
import { useTheme } from "../../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../../src/ui";

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

function bulkSummary(r: BulkInviteResponse): string {
  return `Sent ${r.sent} · failed ${r.failed} · skipped ${r.skipped} · ${r.remaining} still pending.`;
}

/**
 * v1's SendPendingInvitesButton (invite-buttons.tsx:40-65) — now one bounded
 * batch per tap (Plan 10 Decision 12). Mounted only inside the SUPER branch,
 * so its count query never fires for anyone else. Hidden at zero (R87), and
 * also hidden while the count is unknown: a button whose reach we can't state
 * shouldn't offer to mail anyone.
 */
function PendingInvitesCard() {
  const theme = useTheme();
  const pending = usePendingInviteCount(true);
  const sendPending = useSendPendingInvites();

  if (!pending.data) return null;
  const count = pending.data;

  const run = () =>
    Alert.alert(
      `Send invites to ${count} ${count === 1 ? "person" : "people"}?`,
      `Up to ${BULK_INVITE_BATCH_SIZE} are sent per tap — tap again for the rest.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: () =>
            sendPending.mutate(undefined, {
              onSuccess: (result) => Alert.alert("Invites sent", bulkSummary(result)),
              onError: (err) => Alert.alert("Couldn't send invites", apiErrorMessage(err, "Try again later.")),
            }),
        },
      ],
    );

  return (
    <Card>
      <Text variant="body">{`${count} ${count === 1 ? "account has" : "accounts have"} no invite yet.`}</Text>
      <View style={{ marginTop: theme.spacing.sm }}>
        <Button
          title="Send pending invites"
          variant="secondary"
          loading={sendPending.isPending}
          onPress={run}
        />
      </View>
    </Card>
  );
}

export default function UsersScreen() {
  const theme = useTheme();
  const router = useRouter();
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
        <Button title="New user" onPress={() => router.push("/users/new")} />
        {/* Spec 16 §9: the importer is reached from its parent list's header
            action, as in v1 (super/users/page.tsx:59). */}
        <Button title="Import students" variant="secondary" onPress={() => router.push("/users/import")} />
        <PendingInvitesCard />
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
