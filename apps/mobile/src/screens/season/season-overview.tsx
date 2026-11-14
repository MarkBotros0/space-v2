/**
 * The body of /seasons/[code] once the season has loaded (refactor FE-001): the tiles and next step
 * from seasonOverviewModel, the People card, the season's needs and the admin's own edit. The route
 * keeps the queries, refresh, the frame and the duplicate dialog.
 */
import type { SeasonAdminItem, SeasonDetail, SeasonRosterRow } from "@space/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Award, CalendarDays, ClipboardList, Flag, ListChecks, TrendingUp, type LucideIcon } from "lucide-react-native";

import { EditSeason } from "./edit-season";
import { NextStepCard } from "./next-step-card";
import { PeopleCard, type PeopleCardAdmins } from "./people-card";
import { SeasonDetailView, type SeasonAction } from "./season-detail";
import type { seasonSuggestion } from "../season-people/source";
import { seasonOverviewModel, type OverviewNextStepKey, type OverviewTileKey } from "./overview-model";
import { SeasonNeeds } from "./season-needs";
import { useSessionStore } from "../../store/session";

function peopleCardAdmins(isSuper: boolean, admins: UseQueryResult<SeasonAdminItem[]>): PeopleCardAdmins | undefined {
  if (!isSuper) return undefined;
  if (admins.isPending) return { state: "loading" };
  if (admins.isError) return { state: "error" };
  return { state: "ready", names: admins.data.map((a) => a.name) };
}

export function SeasonOverview({
  season: s,
  today,
  isSuper,
  isAdmin,
  admins,
  roster,
  suggested,
  onDuplicate,
}: {
  season: SeasonDetail;
  today: string;
  isSuper: boolean;
  isAdmin: boolean;
  /** Read by a Super only. */
  admins: UseQueryResult<SeasonAdminItem[]>;
  roster: SeasonRosterRow[] | undefined;
  suggested: ReturnType<typeof seasonSuggestion>;
  onDuplicate: () => void;
}) {
  const router = useRouter();
  // A leader of one of this season's groups reads its passing outlook (their groups' students).
  const leads = useSessionStore(
    (st) => st.user?.role === "LEADER" && s.groups.some((g) => st.scopes?.groupLeaderIds.includes(g.id)),
  );
  const model = seasonOverviewModel(s, { isSuper, today, leads });
  const { finished, canAdminister, manage } = model;
  const params = { code: s.code };
  const seasonParam = { seasonId: String(s.id) };
  const go = {
    people: () => router.push({ pathname: "/seasons/[code]/people", params }),
    invite: () => router.push({ pathname: "/seasons/[code]/invite", params }),
    start: () => router.push({ pathname: "/seasons/[code]/start", params }),
    end: () => router.push({ pathname: "/seasons/[code]/end", params }),
  };
  const tileTargets: Record<OverviewTileKey, { icon: LucideIcon; onPress: () => void }> = {
    sessions: { icon: CalendarDays, onPress: () => router.push({ pathname: "/seasons/[code]/sessions", params }) },
    assignments: { icon: ClipboardList, onPress: () => router.push({ pathname: "/assignments", params: seasonParam }) },
    quizzes: { icon: ListChecks, onPress: () => router.push({ pathname: "/quizzes", params: seasonParam }) },
    passing: { icon: TrendingUp, onPress: () => router.push({ pathname: "/seasons/[code]/passing", params }) },
    end: { icon: Flag, onPress: go.end },
    results: { icon: Award, onPress: () => router.push({ pathname: "/seasons/[code]/results", params }) },
  };
  const actions: SeasonAction[] = model.tiles.map((tile) => ({ ...tile, ...tileTargets[tile.key] }));
  const nextStepActions: Record<OverviewNextStepKey, () => void> = {
    start: go.start,
    duplicate: onDuplicate,
    end: go.end,
  };
  const step = model.nextStep;

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
      admins={peopleCardAdmins(isSuper, admins)}
      roster={roster}
      onManageAdmins={
        isSuper && !finished ? () => router.push({ pathname: "/seasons/[code]/admins", params }) : undefined
      }
      onOpenGroup={(id) => router.push({ pathname: "/group/[id]", params: { id: String(id) } })}
      onNewGroup={canAdminister ? () => router.push({ pathname: "/group/new", params: seasonParam }) : undefined}
      onMoveStudents={canAdminister ? () => router.push({ pathname: "/seasons/[code]/roster", params }) : undefined}
    />
  );

  return (
    <SeasonDetailView
      season={s}
      today={today}
      actions={actions}
      nextStep={
        step ? (
          <NextStepCard
            tone={step.tone}
            title={step.title}
            body={step.body}
            action={{ label: step.actionLabel, onPress: nextStepActions[step.key] }}
          />
        ) : undefined
      }
      // Owner 2026-11-07: Super finds a season's work here, not on Home.
      attention={s.status === "ACTIVE" && manage ? <SeasonNeeds seasonId={s.id} /> : undefined}
      people={people}
      extra={isAdmin && canAdminister ? <EditSeason season={s} /> : undefined}
    />
  );
}
