import { useState, type ReactNode } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Award,
  CalendarPlus,
  Copy,
  Flag,
  FolderPlus,
  Pencil,
  UserPlus,
  Users,
} from "lucide-react-native";

import { DuplicateSeasonDialog } from "../../../../src/components/season/DuplicateSeasonDialog";
import { EditSeason } from "../../../../src/components/season/EditSeason";
import { SeasonAdmins } from "../../../../src/components/season/SeasonAdmins";
import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { NextStepCard } from "../../../../src/design/seasons/next-step-card";
import { SeasonDetailView, type SeasonAction } from "../../../../src/design/seasons/season-detail";
import { phoneDayKey } from "../../../../src/design/seasons/season-timeline";
import { CalendarList } from "../../../../src/design/sessions/calendar-list";
import { EmptyState } from "../../../../src/design/ui";
import { useStaffOrgToday } from "../../../../src/hooks/use-dashboard";
import { useSeasonByCode } from "../../../../src/hooks/use-seasons";
import { useSeasonSessions } from "../../../../src/hooks/use-sessions";
import { useSessionStore } from "../../../../src/store/session";

/**
 * /seasons/[code] — any season, any role that may see it (spec 02 §9; G4).
 * One overview, no tabs (owner, 2026-11-07): the season at a glance, its
 * figures, the next step it waits for, its actions as tiles (whoever the
 * server says administers it, canAdminister C4, gets Students and groups /
 * New group / New session), its groups, its sessions on demand. An ADMIN
 * edits description and budgets (REG-72); a SUPER gets the Admins card.
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
  // Only those who can read this season's dashboard ask for it: anyone else would get a 403.
  const orgToday = useStaffOrgToday(
    detail.data && (detail.data.canAdminister || isSuper) ? detail.data.id : null,
  ).today;

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

    const go = {
      roster: () => router.push({ pathname: "/seasons/[code]/roster", params: { code: s.code } }),
      people: () => router.push({ pathname: "/seasons/[code]/people", params: { code: s.code } }),
      start: () => router.push({ pathname: "/seasons/[code]/start", params: { code: s.code } }),
      end: () => router.push({ pathname: "/seasons/[code]/end", params: { code: s.code } }),
    };
    const today = orgToday ?? phoneDayKey();
    const pastEnd = s.status === "ACTIVE" && today > s.endDate.slice(0, 10);
    const actions: SeasonAction[] = [];
    if (canAdminister) {
      actions.push(
        {
          label: "Students and groups",
          hint: "Move students between groups",
          icon: Users,
          onPress: go.roster,
        },
        {
          label: "New group",
          icon: FolderPlus,
          onPress: () =>
            router.push({ pathname: "/group/new", params: { seasonId: String(s.id) } }),
        },
        {
          label: "New session",
          icon: CalendarPlus,
          onPress: () =>
            router.push({ pathname: "/session/new", params: { seasonId: String(s.id) } }),
        },
      );
    }
    // Setup entry points. Only a season that is still running or about to: a finished one takes no one.
    const open = s.status === "DRAFT" || s.status === "ACTIVE";
    if (open && manage) {
      actions.push({
        label: "Add people",
        hint: "Students, leaders and admins",
        icon: UserPlus,
        onPress: go.people,
      });
    }
    // Past its end date, End season is the next step instead of a tile.
    if (s.status === "ACTIVE" && manage && !pastEnd) {
      actions.push({
        label: "End season",
        hint: "Results and graduation",
        icon: Flag,
        onPress: go.end,
      });
    }
    if (isSuper && (s.status === "COMPLETED" || s.status === "ARCHIVED")) {
      actions.push({
        label: "Results",
        icon: Award,
        onPress: () =>
          router.push({ pathname: "/seasons/[code]/results", params: { code: s.code } }),
      });
    }
    if (isSuper) {
      actions.push(
        {
          label: "Edit season",
          icon: Pencil,
          onPress: () =>
            router.push({ pathname: "/seasons/[code]/edit", params: { code: s.code } }),
        },
        { label: "Duplicate season", icon: Copy, onPress: () => setDuplicating(true) },
      );
    }

    let nextStep: ReactNode;
    if (isSuper && s.status === "DRAFT") {
      nextStep = (
        <NextStepCard
          title="This season is a draft"
          body="Nobody sees it until it starts. Set up its groups and people, then start it."
          action={{ label: "Start season", onPress: go.start }}
        />
      );
    } else if (pastEnd && manage) {
      nextStep = (
        <NextStepCard
          tone="warn"
          title="The end date has passed"
          body="End the season to record who passed and lock it."
          action={{ label: "End season", onPress: go.end }}
        />
      );
    }

    body = (
      <>
        <SeasonDetailView
          season={s}
          today={today}
          actions={actions}
          nextStep={nextStep}
          sessions={sessionsTab}
          onOpenGroup={(id) => router.push({ pathname: "/group/[id]", params: { id: String(id) } })}
          extra={
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
