import { useState, type ReactNode } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

import { DuplicateSeasonDialog } from "../../../../src/components/season/DuplicateSeasonDialog";
import { EditSeason } from "../../../../src/components/season/EditSeason";
import { SeasonAdmins } from "../../../../src/components/season/SeasonAdmins";
import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { SeasonDetailView, type ManageItem } from "../../../../src/design/seasons/season-detail";
import { CalendarList } from "../../../../src/design/sessions/calendar-list";
import { Button, EmptyState } from "../../../../src/design/ui";
import { useStaffOrgToday } from "../../../../src/hooks/use-dashboard";
import { useSeasonByCode } from "../../../../src/hooks/use-seasons";
import { useSeasonSessions } from "../../../../src/hooks/use-sessions";
import { useSessionStore } from "../../../../src/store/session";

/**
 * /seasons/[code] — any season, any role that may see it (spec 02 §9; G4).
 * v1 SeasonDetail (admin: read-only tabs; super: Edit season). V2-ONLY kept:
 * whoever the server says administers the season (canAdminister, C4) gets
 * the Roster / New group / New session buttons under the tabs, the group
 * cards open the group, and an ADMIN edits description and budgets (REG-72).
 * A SUPER gets the Admins card on the overview (owner decision; v1 had none).
 */
export default function SeasonDetailScreen() {
  const router = useRouter();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = typeof raw === "string" && raw.length > 0 ? raw : null;
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  const isAdmin = useSessionStore((s) => s.user?.role === "ADMIN");
  const [duplicating, setDuplicating] = useState(false);
  const detail = useSeasonByCode(code);
  const sessions = useSeasonSessions(detail.data?.id ?? null);
  // The org's day for the status badges; never waited on, and a failure leaves the device's.
  const orgToday = useStaffOrgToday(detail.data?.id ?? null).today;

  const refresh = () => {
    if (code !== null) void detail.refetch();
    if (detail.data) void sessions.refetch();
  };

  let body: ReactNode;
  if (code === null) {
    body = <EmptyState title="Not found" description="That season link isn't valid." />;
  } else if (detail.isPending) {
    body = <RouteSkeleton />;
  } else if (detail.isError) {
    body = <RouteError onRetry={() => void detail.refetch()} />;
  } else {
    const s = detail.data;
    const canAdminister = s.canAdminister;
    const manage = canAdminister || isSuper;
    let sessionsTab: ReactNode;
    if (sessions.isPending) sessionsTab = <RouteSkeleton />;
    else if (sessions.isError) sessionsTab = <RouteError onRetry={() => void sessions.refetch()} />;
    else
      sessionsTab = (
        <CalendarList
          sessions={sessions.data}
          today={orgToday}
          onOpen={(id) => router.push({ pathname: "/session/[id]", params: { id: String(id) } })}
          onMarkAttendance={
            manage
              ? (id) =>
                  router.push({ pathname: "/session/[id]/attendance", params: { id: String(id) } })
              : undefined
          }
          onCreate={
            canAdminister
              ? () => router.push({ pathname: "/session/new", params: { seasonId: String(s.id) } })
              : undefined
          }
        />
      );

    const manageItems: ManageItem[] = [];
    if (canAdminister) {
      manageItems.push(
        {
          label: "Roster",
          onPress: () =>
            router.push({ pathname: "/seasons/[code]/roster", params: { code: s.code } }),
        },
        {
          label: "New group",
          onPress: () =>
            router.push({ pathname: "/group/new", params: { seasonId: String(s.id) } }),
        },
        {
          label: "New session",
          onPress: () =>
            router.push({ pathname: "/session/new", params: { seasonId: String(s.id) } }),
        },
      );
    }
    if (isSuper) {
      manageItems.push(
        {
          label: "Edit season",
          onPress: () =>
            router.push({ pathname: "/seasons/[code]/edit", params: { code: s.code } }),
        },
        { label: "Duplicate season", onPress: () => setDuplicating(true) },
      );
    }

    body = (
      <>
        <SeasonDetailView
          season={s}
          sessionsTab={sessionsTab}
          onOpenGroup={(id) => router.push({ pathname: "/group/[id]", params: { id: String(id) } })}
          groupsAction={
            canAdminister ? (
              <Button
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: "/seasons/[code]/roster", params: { code: s.code } })
                }
              >
                Manage groups
              </Button>
            ) : undefined
          }
          manage={manageItems}
          overviewExtra={
            isAdmin && canAdminister ? (
              <EditSeason season={s} />
            ) : isSuper ? (
              <SeasonAdmins seasonId={s.id} seasonTitle={s.title} />
            ) : undefined
          }
        />
        {isSuper ? (
          <DuplicateSeasonDialog
            season={s}
            open={duplicating}
            onClose={() => setDuplicating(false)}
            onDuplicated={(newCode) =>
              router.push({ pathname: "/seasons/[code]", params: { code: newCode } })
            }
          />
        ) : null}
      </>
    );
  }

  return (
    <Screen
      title={detail.data?.title}
      subtitle={detail.data ? `Code: ${detail.data.code}` : undefined}
      refreshing={detail.isRefetching}
      onRefresh={refresh}
    >
      {body}
    </Screen>
  );
}
