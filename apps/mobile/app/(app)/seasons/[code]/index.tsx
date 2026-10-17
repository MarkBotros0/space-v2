import type { ReactNode } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pencil } from "lucide-react-native";

import { DuplicateSeasonDialog } from "../../../../src/components/season/DuplicateSeasonDialog";
import { EditSeason } from "../../../../src/components/season/EditSeason";
import { PageTitle } from "../../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { ShellFrame } from "../../../../src/design/layout/shell-frame";
import { iconWithClassName } from "../../../../src/design/lib/icon";
import { SeasonDetailView } from "../../../../src/design/seasons/season-detail";
import { CalendarList } from "../../../../src/design/sessions/calendar-list";
import { Button, EmptyState } from "../../../../src/design/ui";
import { useSeasonByCode } from "../../../../src/hooks/use-seasons";
import { useSeasonSessions } from "../../../../src/hooks/use-sessions";
import { useSessionStore } from "../../../../src/store/session";

iconWithClassName(Pencil);

/**
 * /seasons/[code] — any season, any role that may see it (spec 02 §9; G4).
 * v1 SeasonDetail (admin: read-only tabs; super: Edit season). V2-ONLY kept:
 * whoever the server says administers the season (canAdminister, C4) gets
 * the Roster / New group / New session buttons under the tabs, the group
 * cards open the group, and an ADMIN edits description and budgets (REG-72).
 */
export default function SeasonDetailScreen() {
  const router = useRouter();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = typeof raw === "string" && raw.length > 0 ? raw : null;
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  const isAdmin = useSessionStore((s) => s.user?.role === "ADMIN");
  const detail = useSeasonByCode(code);
  const sessions = useSeasonSessions(detail.data?.id ?? null);

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

    body = (
      <View className="flex-col gap-4">
        <PageTitle title={s.title} subtitle={`Code: ${s.code}`} />
        <SeasonDetailView
          season={s}
          sessionsTab={sessionsTab}
          onOpenGroup={(id) => router.push({ pathname: "/group/[id]", params: { id: String(id) } })}
          groupsAction={
            canAdminister ? (
              <Button
                variant="outline"
                onPress={() =>
                  router.push({ pathname: "/seasons/[code]/roster", params: { code: s.code } })
                }
              >
                Manage groups
              </Button>
            ) : undefined
          }
          actions={
            isSuper || canAdminister ? (
              <View className="flex-row flex-wrap gap-2">
                {isSuper ? (
                  <>
                    <DuplicateSeasonDialog
                      season={s}
                      onDuplicated={(newCode) =>
                        router.push({ pathname: "/seasons/[code]", params: { code: newCode } })
                      }
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={() =>
                        router.push({ pathname: "/seasons/[code]/edit", params: { code: s.code } })
                      }
                    >
                      <Pencil size={14} className="text-foreground" />
                      Edit season
                    </Button>
                  </>
                ) : null}
                {canAdminister ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={() =>
                        router.push({
                          pathname: "/seasons/[code]/roster",
                          params: { code: s.code },
                        })
                      }
                    >
                      Roster
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={() =>
                        router.push({ pathname: "/group/new", params: { seasonId: String(s.id) } })
                      }
                    >
                      New group
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={() =>
                        router.push({
                          pathname: "/session/new",
                          params: { seasonId: String(s.id) },
                        })
                      }
                    >
                      New session
                    </Button>
                  </>
                ) : null}
              </View>
            ) : undefined
          }
          overviewExtra={isAdmin && canAdminister ? <EditSeason season={s} /> : undefined}
        />
      </View>
    );
  }

  return (
    <ShellFrame refreshing={detail.isRefetching} onRefresh={refresh}>
      {body}
    </ShellFrame>
  );
}
