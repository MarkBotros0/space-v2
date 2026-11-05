import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import { BULK_INVITE_BATCH_SIZE, type BulkInviteResponse, type UserStatus } from "@space/shared";

import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { Screen } from "../../../src/design/layout/screen";
import { UsersList, parseUserStatus } from "../../../src/design/users/users-list";
import {
  Button,
  ChoiceChip,
  EmptyState,
  GroupedList,
  ListRow,
  SearchField,
  toast,
} from "../../../src/design/ui";
import {
  usePendingInviteCount,
  useSendInvite,
  useSendPendingInvites,
  useUsers,
} from "../../../src/hooks/use-users";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { useDebouncedSearch } from "../../../src/screens/students-list/use-debounced-search";
import { inviteErrorMessage, inviteSentMessage } from "../../../src/lib/invite-feedback";
import { useSessionStore } from "../../../src/store/session";

function bulkSummary(r: BulkInviteResponse): string {
  return `Sent ${r.sent} · failed ${r.failed} · skipped ${r.skipped} · ${r.remaining} still pending.`;
}

/**
 * v1's SendPendingInvitesButton (invite-buttons.tsx:40-65), drawn as its
 * "Send n invites" row — now one bounded batch per tap after a
 * confirm (Plan 10 Decision 12). The count query is enabled for SUPER only. Hidden at zero (R87), and also
 * hidden while the count is unknown: a button whose reach we can't state
 * shouldn't offer to mail anyone.
 */
function usePendingInvitesRow(enabled: boolean) {
  const pending = usePendingInviteCount(enabled);
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
              onError: (err) =>
                Alert.alert("Couldn't send invites", apiErrorMessage(err, "Try again later.")),
            }),
        },
      ],
    );

  return (
    <ListRow
      title={sendPending.isPending ? "Sending…" : `Send ${count} invite${count === 1 ? "" : "s"}`}
      chevron
      onPress={sendPending.isPending ? undefined : run}
    />
  );
}

const FILTERS: { status: UserStatus | undefined; label: string }[] = [
  { status: undefined, label: "All" },
  { status: "active", label: "Active" },
  { status: "invited", label: "Invited" },
  { status: "pending", label: "No invite" },
  { status: "inactive", label: "Inactive" },
];

export default function UsersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string }>();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const sendInvite = useSendInvite();
  // Searching on submit or after a pause keeps a typed name from issuing one
  // request per character.
  const { search, q, setSearch, commit } = useDebouncedSearch();
  // Today links here with ?status=pending; the chips take over from there.
  const [status, setStatus] = useState<UserStatus | undefined>(() => parseUserStatus(params.status));
  const isSuper = role === "SUPER";
  const pendingRow = usePendingInvitesRow(isSuper);

  const users$ = useUsers({ q, status }, { enabled: isSuper });

  if (!isSuper) {
    // navFor gives only SUPER a /users entry, but a route file is reachable
    // by URL regardless — the screen guards itself (ruling C8's spirit;
    // the API behind it 403s anyway).
    return (
      <Screen title="Users">
        <EmptyState title="Not available" description="Only SUPER accounts can manage users." />
      </Screen>
    );
  }

  const users = users$.data?.pages.flatMap((page) => page.users) ?? [];
  const total = users$.data?.pages[0]?.total;

  return (
    <Screen
      title="Users"
      subtitle={total === undefined ? undefined : `${total} total`}
      trailing={<Button size="sm" onPress={() => router.push("/users/new")}>New user</Button>}
      refreshing={users$.isRefetching}
      onRefresh={() => void users$.refetch()}
    >
      <View className="flex-col gap-3">
        <GroupedList>
          {pendingRow}
          {/* Spec 16 §9: the importer is reached from its parent list, as in v1
              (super/users/page.tsx:59). */}
          <ListRow title="Import profiles" chevron onPress={() => router.push("/users/import")} />
        </GroupedList>
        <SearchField
          accessibilityLabel="Search"
          value={search}
          onChangeText={setSearch}
          placeholder="Search name or email"
          onSubmitEditing={commit}
        />
        <View className="flex-row flex-wrap gap-2">
          {FILTERS.map((f) => (
            <ChoiceChip
              key={f.label}
              label={f.label}
              selected={status === f.status}
              onPress={() => setStatus(f.status)}
            />
          ))}
        </View>
        {users$.isPending ? (
          <RouteSkeleton />
        ) : users$.isError ? (
          <RouteError onRetry={() => void users$.refetch()} />
        ) : users.length === 0 && (q !== "" || status !== undefined) ? (
          <EmptyState
            title="No users"
            description={
              q !== "" ? "No accounts match this search." : "No accounts match this filter."
            }
          />
        ) : (
          <>
            <UsersList
              rows={users}
              onOpen={(row) =>
                router.push({ pathname: "/user/[id]", params: { id: String(row.id) } })
              }
              renderActions={(row) =>
                // Row-level invite: only accounts that have never activated can be
                // invited (R14) — the server enforces it; the button only renders
                // where it can work.
                row.deletedAt === null && (row.status === "pending" || row.status === "invited") ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={sendInvite.isPending}
                    onPress={() =>
                      sendInvite.mutate(
                        { userId: row.id },
                        {
                          onSuccess: () => toast.success(inviteSentMessage(row.email)),
                          onError: (err) => toast.error(inviteErrorMessage(err)),
                        },
                      )
                    }
                  >
                    {row.status === "invited" ? "Resend invite" : "Send invite"}
                  </Button>
                ) : null
              }
            />
            {users$.hasNextPage ? (
              <Button
                variant="outline"
                disabled={users$.isFetchingNextPage}
                onPress={() => void users$.fetchNextPage()}
              >
                {users$.isFetchingNextPage ? "Loading…" : "Show more"}
              </Button>
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}
