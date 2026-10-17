import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import { BULK_INVITE_BATCH_SIZE, type BulkInviteResponse } from "@space/shared";

import { PageTitle } from "../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { ShellFrame } from "../../../src/design/layout/shell-frame";
import { UsersList } from "../../../src/design/users/users-list";
import { Button, EmptyState, Input } from "../../../src/design/ui";
import {
  usePendingInviteCount,
  useSendInvite,
  useSendPendingInvites,
  useUsers,
} from "../../../src/hooks/use-users";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { useSessionStore } from "../../../src/store/session";

function bulkSummary(r: BulkInviteResponse): string {
  return `Sent ${r.sent} · failed ${r.failed} · skipped ${r.skipped} · ${r.remaining} still pending.`;
}

/**
 * v1's SendPendingInvitesButton (invite-buttons.tsx:40-65), drawn as its
 * outline "Send n invites" button — now one bounded batch per tap after a
 * confirm (Plan 10 Decision 12). Mounted only inside the SUPER branch, so its
 * count query never fires for anyone else. Hidden at zero (R87), and also
 * hidden while the count is unknown: a button whose reach we can't state
 * shouldn't offer to mail anyone.
 */
function PendingInvitesButton() {
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
              onError: (err) =>
                Alert.alert("Couldn't send invites", apiErrorMessage(err, "Try again later.")),
            }),
        },
      ],
    );

  return (
    <Button variant="outline" disabled={sendPending.isPending} onPress={run}>
      {sendPending.isPending ? "Sending…" : `Send ${count} invite${count === 1 ? "" : "s"}`}
    </Button>
  );
}

export default function UsersScreen() {
  const router = useRouter();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const sendInvite = useSendInvite();
  // `draft` is what the field shows; `q` is what was last submitted. Searching
  // on submit rather than per keystroke keeps a typed name from issuing one
  // request per character.
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const isSuper = role === "SUPER";

  const users$ = useUsers({ q }, { enabled: isSuper });

  if (!isSuper) {
    // navFor gives only SUPER a /users entry, but a route file is reachable
    // by URL regardless — the screen guards itself (ruling C8's spirit;
    // the API behind it 403s anyway).
    return (
      <ShellFrame>
        <EmptyState title="Users" description="Only SUPER accounts can manage users." />
      </ShellFrame>
    );
  }

  const users = users$.data?.pages.flatMap((page) => page.users) ?? [];
  const total = users$.data?.pages[0]?.total;

  return (
    <ShellFrame refreshing={users$.isRefetching} onRefresh={() => void users$.refetch()}>
      <View className="flex-col gap-4">
        <View className="flex-row items-start justify-between gap-4">
          <PageTitle
            className="min-w-0 flex-1"
            title="Users"
            subtitle={total === undefined ? undefined : `${total} total`}
          />
          <View className="shrink-0 flex-col gap-2">
            <PendingInvitesButton />
            {/* Spec 16 §9: the importer is reached from its parent list's header
                action, as in v1 (super/users/page.tsx:59). */}
            <Button variant="outline" onPress={() => router.push("/users/import")}>
              Import profiles
            </Button>
            <Button onPress={() => router.push("/users/new")}>New user</Button>
          </View>
        </View>
        <Input
          accessibilityLabel="Search"
          value={draft}
          onChangeText={setDraft}
          placeholder="Search name or email"
          returnKeyType="search"
          autoCapitalize="none"
          onSubmitEditing={() => setQ(draft.trim())}
        />
        {users$.isPending ? (
          <RouteSkeleton />
        ) : users$.isError ? (
          <RouteError onRetry={() => void users$.refetch()} />
        ) : users.length === 0 && q !== "" ? (
          <EmptyState title="No users" description="No accounts match this search." />
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
                    onPress={() => sendInvite.mutate({ userId: row.id })}
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
    </ShellFrame>
  );
}
