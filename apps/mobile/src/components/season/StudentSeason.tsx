import { useRouter } from "expo-router";
import { CalendarDays, MapPin, Users } from "lucide-react-native";
import type { ReactNode } from "react";
import { Linking, Pressable, View } from "react-native";
import type { MySeason } from "@space/shared";

import { Eyebrow, PageTitle } from "../../design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { ShellFrame } from "../../design/layout/shell-frame";
import { cn } from "../../design/lib/cn";
import { iconWithClassName } from "../../design/lib/icon";
import { shadowStyle } from "../../design/lib/shadow";
import { Badge, Button, EmptyState, Progress, Text } from "../../design/ui";
import { useMySeason } from "../../hooks/use-self-service";
import { formatDate, formatSessionTime } from "../../lib/format";
import { initialsOf } from "../../lib/initials";
import { useSessionStore } from "../../store/session";

iconWithClassName(CalendarDays, MapPin, Users);

const CARD = "rounded-2xl border border-border bg-card";

/** "MMM" / "d" for the date tile, read from the org day key (X13). */
function dayTile(dayKey: string): { month: string; day: string } {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return { month: date.toLocaleString("en-US", { month: "short" }), day: String(d ?? "") };
}

function weekday(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleString("en-US", { weekday: "short" });
}

function GroupCard({ group }: { group: NonNullable<MySeason["group"]> }) {
  return (
    <View className={cn(CARD, "p-4")} style={shadowStyle("soft")}>
      <View className="mb-3 flex-row items-center gap-2">
        <View className="size-7 items-center justify-center rounded-lg bg-brand-navy-100 dark:bg-brand-navy-900">
          <Users size={16} className="text-brand-navy-800 dark:text-brand-navy-100" />
        </View>
        <View>
          <Eyebrow>Your group</Eyebrow>
          <Text className="text-sm font-bold text-brand-navy-900 dark:text-foreground">
            {group.name}
          </Text>
        </View>
      </View>
      {group.description ? (
        <Text className="mb-4 text-sm text-muted-foreground">{group.description}</Text>
      ) : null}
      <Text className="mb-2 text-xs font-bold text-brand-navy-900 dark:text-foreground">
        {group.leaders.length === 1 ? "Leader" : "Leaders"}
      </Text>
      {group.leaders.length === 0 ? (
        <Text className="text-sm italic text-muted-foreground">No leaders assigned yet.</Text>
      ) : (
        <View className="flex-col gap-2.5">
          {group.leaders.map((leader) => (
            <View key={leader.id} className="flex-row items-center gap-3">
              <View className="size-9 shrink-0 items-center justify-center rounded-full bg-brand-navy-100 dark:bg-brand-navy-900">
                <Text className="text-xs font-bold text-brand-navy-800 dark:text-brand-navy-100">
                  {initialsOf(leader.name, leader.email.charAt(0).toUpperCase() || "?")}
                </Text>
              </View>
              <View className="min-w-0 flex-1">
                <Text
                  numberOfLines={1}
                  className="text-sm font-semibold text-brand-navy-900 dark:text-foreground"
                >
                  {leader.name}
                </Text>
                <Pressable
                  accessibilityRole="link"
                  onPress={() => void Linking.openURL(`mailto:${leader.email}`)}
                >
                  <Text numberOfLines={1} className="text-xs text-muted-foreground">
                    {leader.email}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
      <Text className="mb-2 mt-4 text-xs font-bold text-brand-navy-900 dark:text-foreground">
        Members
        <Text className="text-xs font-normal text-muted-foreground"> ({group.members.length})</Text>
      </Text>
      <View className="flex-row flex-wrap gap-1.5">
        {group.members.map((member) => (
          <View
            key={member.id}
            className={cn(
              "flex-row items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5",
              member.isYou
                ? "border border-brand-teal-300 bg-brand-teal-100 dark:border-brand-teal-900 dark:bg-brand-teal-950"
                : "bg-muted/60",
            )}
          >
            <View className="size-6 items-center justify-center rounded-full bg-card">
              <Text className="text-[10px] font-bold text-brand-navy-800 dark:text-brand-navy-100">
                {initialsOf(member.name, "?")}
              </Text>
            </View>
            <Text
              numberOfLines={1}
              className={cn(
                "max-w-32 text-xs font-medium",
                member.isYou ? "text-brand-teal-800 dark:text-brand-teal-200" : "text-foreground",
              )}
            >
              {member.isYou ? "You" : (member.name ?? "—")}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function UpcomingCard({ upcoming }: { upcoming: MySeason["upcoming"] }) {
  const router = useRouter();
  return (
    <View className={cn(CARD, "p-4")} style={shadowStyle("soft")}>
      <View className="mb-3 flex-row items-center justify-between">
        <Eyebrow>Upcoming sessions</Eyebrow>
        <Button
          variant="ghost"
          size="sm"
          textClassName="text-xs text-brand-teal-700 dark:text-brand-teal-300"
          onPress={() => router.push("/calendar")}
        >
          See calendar
        </Button>
      </View>
      {upcoming.length === 0 ? (
        <Text className="text-sm italic text-muted-foreground">No upcoming sessions.</Text>
      ) : (
        <View className="flex-col gap-3">
          {upcoming.slice(0, 3).map((s) => {
            const tile = dayTile(s.dayKey);
            return (
              <View key={s.id} className="flex-row items-center gap-3">
                <View className="size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal-100 dark:bg-brand-teal-950">
                  <Text className="text-[9px] font-bold uppercase leading-none text-brand-teal-800 dark:text-brand-teal-200">
                    {tile.month}
                  </Text>
                  <Text className="text-base font-black leading-tight text-brand-teal-800 dark:text-brand-teal-200">
                    {tile.day}
                  </Text>
                </View>
                <View className="min-w-0 flex-1">
                  <Pressable
                    accessibilityRole="link"
                    onPress={() =>
                      router.push({ pathname: "/session/[id]", params: { id: String(s.id) } })
                    }
                  >
                    <Text
                      numberOfLines={1}
                      className="text-sm font-semibold text-brand-navy-900 dark:text-foreground"
                    >
                      {s.title}
                    </Text>
                  </Pressable>
                  <View className="flex-row flex-wrap items-center gap-x-2">
                    {/* No org wall time in this payload: the time is the device's reading of startsAt (gap note). */}
                    <Text className="text-xs text-muted-foreground">{`${weekday(s.dayKey)} · ${formatSessionTime(s.startsAt)}`}</Text>
                    {s.location ? (
                      <View className="flex-row items-center gap-1">
                        <MapPin size={12} className="shrink-0 text-muted-foreground" />
                        <Text className="text-xs text-muted-foreground">{s.location}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

/**
 * The student's `/season` (v1 app/student/season/page.tsx, G21). One read,
 * GET /me/season (Plan 11 Decision 5): progress and "upcoming" are
 * server-derived (C4) and the group comes from this season's enrollment (C9).
 * Progress says "Session N of M" (spec 02 R29).
 */
export function StudentSeason() {
  const seasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  const { data, isPending, isError, refetch, isRefetching } = useMySeason(seasonId);

  const noSeason = (
    <View className="flex-col gap-3">
      <PageTitle title="Current season" />
      <EmptyState
        icon={Users}
        title="No active season"
        description="An admin will enroll you when you're ready."
      />
    </View>
  );
  let body: ReactNode;
  if (seasonId === null) body = noSeason;
  else if (isPending) body = <RouteSkeleton />;
  else if (isError) body = <RouteError onRetry={() => void refetch()} />;
  else if (data === null) body = noSeason;
  else {
    const { completedSessions, totalSessions, pct } = data.progress;
    body = (
      <View className="flex-col gap-3">
        <View className={cn(CARD, "p-5")} style={shadowStyle("soft")}>
          <View className="flex-row flex-wrap items-start justify-between gap-2">
            <View className="min-w-0">
              <Eyebrow tone="teal">Current season</Eyebrow>
              <Text
                accessibilityRole="header"
                className="mt-1 text-2xl font-black text-brand-navy-900 dark:text-foreground"
              >
                {data.title}
              </Text>
              <View className="mt-1 flex-row items-center gap-1.5">
                <CalendarDays size={14} className="shrink-0 text-muted-foreground" />
                <Text className="text-sm text-muted-foreground">{`${formatDate(data.startDate)} – ${formatDate(data.endDate)}`}</Text>
              </View>
            </View>
            <View className="shrink-0 flex-row flex-wrap justify-end gap-1.5">
              <Badge variant="teal">{data.status}</Badge>
              {data.group ? <Badge variant="outline">{data.group.name}</Badge> : null}
            </View>
          </View>
          {totalSessions > 0 ? (
            <View className="mt-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-semibold text-brand-navy-900 dark:text-foreground">
                  {`Session ${completedSessions} of ${totalSessions}`}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {pct >= 100 ? "Complete" : `${totalSessions - completedSessions} to go`}
                </Text>
              </View>
              <Progress value={pct} className="mt-1.5" />
            </View>
          ) : null}
        </View>
        {data.group ? <GroupCard group={data.group} /> : null}
        {data.description ? (
          <View className={cn(CARD, "p-4")} style={shadowStyle("soft")}>
            <Eyebrow className="mb-2">About this season</Eyebrow>
            <Text className="text-sm text-foreground/90">{data.description}</Text>
          </View>
        ) : null}
        <UpcomingCard upcoming={data.upcoming} />
      </View>
    );
  }

  return (
    <ShellFrame
      onRefresh={() => {
        if (seasonId !== null) void refetch();
      }}
      refreshing={isRefetching}
    >
      {body}
    </ShellFrame>
  );
}
