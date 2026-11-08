import { useState, type ReactNode } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Award,
  CalendarDays,
  ClipboardList,
  Copy,
  FileQuestion,
  Flag,
  Pencil,
} from "lucide-react-native";

import { DuplicateSeasonDialog } from "../../../../src/components/season/DuplicateSeasonDialog";
import { EditSeason } from "../../../../src/components/season/EditSeason";
import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { iconWithClassName } from "../../../../src/design/lib/icon";
import { NextStepCard } from "../../../../src/design/seasons/next-step-card";
import { PeopleCard, type PeopleCardAdmins } from "../../../../src/design/seasons/people-card";
import { SeasonDetailView, type SeasonAction } from "../../../../src/design/seasons/season-detail";
import { SeasonNeeds } from "../../../../src/screens/season/season-needs";
import { phoneDayKey } from "../../../../src/design/seasons/season-timeline";
import { Button, EmptyState } from "../../../../src/design/ui";
import { useStaffOrgToday } from "../../../../src/hooks/use-dashboard";
import { useSeasonRoster } from "../../../../src/hooks/use-group-admin";
import { useSeasonAdmins } from "../../../../src/hooks/use-season-admins";
import { useSeasonPeople } from "../../../../src/hooks/use-season-people";
import { seasonSuggestion } from "../../../../src/screens/season-people/source";
import { useSeasonByCode } from "../../../../src/hooks/use-seasons";
import { countOf } from "../../../../src/lib/plural";
import { useSessionStore } from "../../../../src/store/session";

iconWithClassName(Pencil, Copy);

/**
 * /seasons/[code] — any season, any role that may see it (spec 02 §9; G4).
 * One overview, no tabs (owner, 2026-11-07): the season at a glance, its
 * figures, the next step it waits for, who is in it as one People card
 * (admins, then groups with their leaders, then students), and what can be
 * done to it as tiles: Sessions, Assignments, Quizzes, End season, Results.
 * Adding people lives in the People card, not a tile (owner, 2026-11-07). Whoever the server says administers it (canAdminister, C4) reads the
 * roster and manages; a SUPER also reads the admins, and edits or duplicates
 * from the buttons beside the name. An ADMIN edits description and budgets
 * (REG-72) at the foot.
 */
export default function SeasonDetailScreen() {
  const router = useRouter();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = typeof raw === "string" && raw.length > 0 ? raw : null;
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  const isAdmin = useSessionStore((s) => s.user?.role === "ADMIN");
  const [duplicating, setDuplicating] = useState(false);
  const detail = useSeasonByCode(code);
  const seasonId = detail.data?.id ?? null;
  // Nobody but a Super reads or changes admins.
  const admins = useSeasonAdmins(seasonId, { enabled: isSuper && seasonId !== null });
  // The students under each group; only whoever administers the season may read them.
  const roster = useSeasonRoster(detail.data?.canAdminister ? seasonId : null);
  // A draft's "N people passed <last season>" suggestion reads the picker's own list (cached for it).
  const suggestFor = detail.data?.canAdminister && detail.data.status === "DRAFT";
  const candidates = useSeasonPeople(seasonId, { enabled: !!suggestFor });
  // The org's day for the timeline; never waited on, and a failure leaves the device's.
  const orgToday = useStaffOrgToday(
    detail.data && (detail.data.canAdminister || isSuper) ? detail.data.id : null,
  ).today;

  const refresh = () => {
    if (code !== null) void detail.refetch();
    if (isSuper && seasonId !== null) void admins.refetch();
    if (detail.data?.canAdminister) void roster.refetch();
    if (suggestFor) void candidates.refetch();
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
    // A finished season is locked (owner, 2026-11-07): its people, groups and
    // sessions can be read, nothing changed; Duplicate starts a draft from it.
    const finished = s.status === "COMPLETED" || s.status === "ARCHIVED";
    const canAdminister = s.canAdminister && !finished;
    const manage = (s.canAdminister || isSuper) && !finished;
    const params = { code: s.code };
    const go = {
      people: () => router.push({ pathname: "/seasons/[code]/people", params }),
      invite: () => router.push({ pathname: "/seasons/[code]/invite", params }),
      start: () => router.push({ pathname: "/seasons/[code]/start", params }),
      end: () => router.push({ pathname: "/seasons/[code]/end", params }),
    };
    const today = orgToday ?? phoneDayKey();
    const pastEnd = s.status === "ACTIVE" && today > s.endDate.slice(0, 10);

    // Each tile names what it opens (owner, 2026-11-07: not "Manage ..." on every card).
    const actions: SeasonAction[] = [
      {
        label: "Sessions",
        hint: s.sessionCount === 0 ? "None yet" : countOf(s.sessionCount, "session"),
        icon: CalendarDays,
        onPress: () => router.push({ pathname: "/seasons/[code]/sessions", params }),
      },
    ];
    if (manage) {
      const seasonParam = { seasonId: String(s.id) };
      actions.push(
        {
          label: "Assignments",
          hint: "Set work and review it",
          icon: ClipboardList,
          onPress: () => router.push({ pathname: "/assignments", params: seasonParam }),
        },
        {
          label: "Quizzes",
          hint: "Write, give and grade",
          icon: FileQuestion,
          onPress: () => router.push({ pathname: "/quizzes", params: seasonParam }),
        },
      );
    }
    // Past its end date, End season is the next step instead of a tile.
    if (s.status === "ACTIVE" && manage && !pastEnd) {
      actions.push({ label: "End season", hint: "Results and graduation", icon: Flag, onPress: go.end });
    }
    if (isSuper && (s.status === "COMPLETED" || s.status === "ARCHIVED")) {
      actions.push({
        label: "Results",
        icon: Award,
        onPress: () => router.push({ pathname: "/seasons/[code]/results", params }),
      });
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
    } else if (isSuper && finished) {
      nextStep = (
        <NextStepCard
          title="This season has finished"
          body="It's read-only now. Duplicate it to start the next one as a draft."
          action={{ label: "Duplicate as a draft", onPress: () => setDuplicating(true) }}
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

    let adminState: PeopleCardAdmins | undefined;
    if (isSuper) {
      if (admins.isPending) adminState = { state: "loading" };
      else if (admins.isError) adminState = { state: "error" };
      else adminState = { state: "ready", names: admins.data.map((a) => a.name) };
    }

    const suggested = suggestFor && candidates.data ? seasonSuggestion(candidates.data) : null;
    const people = (
      <PeopleCard
        seasonTitle={s.title}
        onSelectFromCommunity={canAdminister ? go.people : undefined}
        onInviteNew={canAdminister ? go.invite : undefined}
        suggestion={
          suggested
            ? {
                title: suggested.source.title,
                count: suggested.count,
                onAdd: () =>
                  router.push({
                    pathname: "/seasons/[code]/people",
                    params: { code: s.code, from: String(suggested.source.id) },
                  }),
              }
            : null
        }
        groups={s.groups}
        studentCount={s.studentCount}
        admins={adminState}
        roster={roster.data}
        onManageAdmins={
          isSuper && !finished
            ? () => router.push({ pathname: "/seasons/[code]/admins", params })
            : undefined
        }
        onOpenGroup={(id) => router.push({ pathname: "/group/[id]", params: { id: String(id) } })}
        onNewGroup={
          canAdminister
            ? () => router.push({ pathname: "/group/new", params: { seasonId: String(s.id) } })
            : undefined
        }
        onMoveStudents={
          canAdminister
            ? () => router.push({ pathname: "/seasons/[code]/roster", params })
            : undefined
        }
      />
    );

    body = (
      <>
        <SeasonDetailView
          season={s}
          today={today}
          actions={actions}
          nextStep={nextStep}
          // Owner 2026-11-07: Super finds a season's work here, not on Home.
          attention={s.status === "ACTIVE" && manage ? <SeasonNeeds seasonId={s.id} /> : undefined}
          people={people}
          extra={isAdmin && canAdminister ? <EditSeason season={s} /> : undefined}
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
      // Owner 2026-11-07: Edit and Duplicate sit beside the name, not among the Manage cards.
      trailing={
        isSuper && detail.data ? (
          <>
            <Button
              variant="secondary"
              size="icon"
              accessibilityLabel="Edit season"
              onPress={() =>
                router.push({ pathname: "/seasons/[code]/edit", params: { code: detail.data.code } })
              }
            >
              <Pencil size={18} className="text-foreground" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              accessibilityLabel="Duplicate season"
              onPress={() => setDuplicating(true)}
            >
              <Copy size={18} className="text-foreground" />
            </Button>
          </>
        ) : undefined
      }
      refreshing={detail.isRefetching}
      onRefresh={refresh}
    >
      {body}
    </Screen>
  );
}
