import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import { BULK_INVITE_BATCH_SIZE } from "@space/shared";

import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { Screen } from "../../../src/design/layout/screen";
import { UsersList, parseUserStatus } from "../../../src/screens/community/users-list";
import { Button, EmptyState, GroupedList, ListRow, PillButton, SearchFilterRow, toast } from "../../../src/design/ui";
import { usePendingInviteCount, useSendInvite, useSendPendingInvites, useUsers } from "../../../src/hooks/use-users";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { useDebouncedSearch } from "../../../src/hooks/use-debounced-search";
import { bulkSummary, inviteErrorMessage, inviteSentMessage } from "../../../src/lib/invite-feedback";
import {
  CommunityFilterSheet,
  communityFilterCount,
  type CommunityFilters,
} from "../../../src/screens/community/community-filter-sheet";
import { useRole } from "../../../src/store/session";
import { LoadMoreButton } from "../../../src/design/ui/load-more-button";

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
              onError: (err) => Alert.alert("Couldn't send invites", apiErrorMessage(err, "Try again later.")),
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

/**
 * Community (owner, 2026-11-07): Super's tab of everyone in the community,
 * whatever their role, in place of the Students tab and the Users page. New
 * member creates any account (/users/new) and mails its invite.
 */
export default function CommunityScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string }>();
  const role = useRole();
  const sendInvite = useSendInvite();
  // Searching on submit or after a pause keeps a typed name from issuing one
  // request per character.
  const { search, q, setSearch, commit } = useDebouncedSearch();
  // Today links here with ?status=pending; the chips take over from there.
  const [filters, setFilters] = useState<CommunityFilters>(() => ({
    role: undefined,
    status: parseUserStatus(params.status),
  }));
  const [filtering, setFiltering] = useState(false);
  const { role: roleFilter, status } = filters;
  const isSuper = role === "SUPER";
  const pendingRow = usePendingInvitesRow(isSuper);

  const users$ = useUsers({ q, status, role: roleFilter }, { enabled: isSuper });

  if (!isSuper) {
    // navFor gives only SUPER a /users entry, but a route file is reachable
    // by URL regardless — the screen guards itself (ruling C8's spirit;
    // the API behind it 403s anyway).
    return (
      <Screen title="Community">
        <EmptyState title="Not available" description="Only a super admin can see the whole community." />
      </Screen>
    );
  }

  const users = users$.data?.pages.flatMap((page) => page.users) ?? [];
  const total = users$.data?.pages[0]?.total;

  return (
    <Screen
      title="Community"
      subtitle={total === undefined ? undefined : `${total} ${total === 1 ? "member" : "members"}`}
      trailing={
        <Button size="sm" onPress={() => router.push("/users/new")}>
          New member
        </Button>
      }
      refreshing={users$.isRefetching}
      onRefresh={() => void users$.refetch()}
    >
      <View className="flex-col gap-3">
        <GroupedList>
          {pendingRow}
          {/* Spec 16 §9: the importer is reached from its parent list, as in v1
              (super/users/page.tsx:59). */}
          <ListRow
            title="Add students in bulk"
            subtitle="Paste names and emails"
            chevron
            onPress={() => router.push("/users/import")}
          />
        </GroupedList>
        {/* Owner 2026-11-07: Filter is an icon button in the search row. */}
        <SearchFilterRow
          accessibilityLabel="Search"
          value={search}
          onChangeText={setSearch}
          placeholder="Search name or email"
          onSubmitEditing={commit}
          activeFilters={communityFilterCount(filters)}
          onFilter={() => setFiltering(true)}
        />
        <CommunityFilterSheet
          open={filtering}
          onClose={() => setFiltering(false)}
          filters={filters}
          onChange={setFilters}
        />
        {users$.isPending ? (
          <RouteSkeleton />
        ) : users$.isError ? (
          <RouteError onRetry={() => void users$.refetch()} />
        ) : users.length === 0 && (q !== "" || status !== undefined || roleFilter !== undefined) ? (
          <EmptyState
            title="No members"
            description={q !== "" ? "Nobody matches this search." : "Nobody matches these filters."}
          />
        ) : (
          <>
            <UsersList
              rows={users}
              onOpen={(row) => router.push({ pathname: "/user/[id]", params: { id: String(row.id) } })}
              renderAction={(row) =>
                // Row-level invite: only accounts that have never activated can be
                // invited (R14) — the server enforces it; the pill only renders
                // where it can work.
                row.deletedAt === null && (row.status === "pending" || row.status === "invited") ? (
                  <PillButton
                    label={
                      sendInvite.isPending && sendInvite.variables?.userId === row.id
                        ? "Sending…"
                        : row.status === "invited"
                          ? "Resend"
                          : "Invite"
                    }
                    accessibilityLabel={`${row.status === "invited" ? "Resend invite to" : "Send invite to"} ${row.name || row.email}`}
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
                  />
                ) : null
              }
            />
            <LoadMoreButton query={users$} label="Show more" loadingLabel="Loading…" />
          </>
        )}
      </View>
    </Screen>
  );
}
