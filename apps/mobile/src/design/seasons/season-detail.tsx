/**
 * Port of v1 src/components/seasons/season-detail.tsx: Tabs Overview / Groups
 * (n) / Sessions (n). Overview = Status, Dates and Enrollment cards plus an
 * About card; Groups = one card per group ("{n} students", "Leaders: …") or
 * v1's empty state; Sessions is the caller's slot (CalendarList).
 * v1's tab list sits beside the Edit/Duplicate buttons; on a phone the
 * buttons wrap under it, so `actions` renders below the tabs list. The
 * selected tab is not drawn (a v1 bug reproduced in ui/tabs.tsx).
 */
import type { SeasonDetail } from "@space/shared";
import { Users } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";

import { formatSeasonDay } from "../../lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Text } from "../ui/text";
import { SeasonStatusBadge } from "./season-status-badge";

export function SeasonDetailView({
  season,
  actions,
  overviewExtra,
  sessionsTab,
  onOpenGroup,
  groupsAction,
}: {
  season: SeasonDetail;
  actions?: ReactNode;
  overviewExtra?: ReactNode;
  sessionsTab: ReactNode;
  onOpenGroup?: (id: number) => void;
  groupsAction?: ReactNode;
}) {
  return (
    <Tabs defaultValue="overview">
      <View className="flex-col gap-3">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="groups">{`Groups (${season.groups.length})`}</TabsTrigger>
          <TabsTrigger value="sessions">{`Sessions (${season.sessionCount})`}</TabsTrigger>
        </TabsList>
        {actions}
      </View>

      <TabsContent value="overview" className="flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            <SeasonStatusBadge status={season.status} className="self-start" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Dates</CardTitle>
          </CardHeader>
          <CardContent>
            <Text className="text-sm text-muted-foreground">
              {`${formatSeasonDay(season.startDate)} – ${formatSeasonDay(season.endDate)}`}
            </Text>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Enrollment</CardTitle>
          </CardHeader>
          <CardContent>
            <Text className="text-sm text-muted-foreground">
              {`${season.studentCount} students across ${season.groups.length} groups`}
            </Text>
          </CardContent>
        </Card>
        {season.description ? (
          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent>
              <Text className="text-sm text-foreground">{season.description}</Text>
            </CardContent>
          </Card>
        ) : null}
        {overviewExtra}
      </TabsContent>

      <TabsContent value="groups">
        {season.groups.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No groups yet"
            description="Add groups so students can be placed and leaders assigned."
            action={groupsAction}
          />
        ) : (
          <View className="flex-col gap-3">
            {season.groups.map((g) => (
              <Card key={g.id} onPress={onOpenGroup ? () => onOpenGroup(g.id) : undefined}>
                <CardHeader>
                  <CardTitle>{g.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex-col gap-2">
                  <Text className="text-sm text-muted-foreground">{`${g.studentCount} students`}</Text>
                  <Text className="text-sm text-muted-foreground">
                    {`Leaders: ${g.leaderNames.length ? g.leaderNames.join(", ") : "Unassigned"}`}
                  </Text>
                </CardContent>
              </Card>
            ))}
            {groupsAction ? <View className="items-center">{groupsAction}</View> : null}
          </View>
        )}
      </TabsContent>

      <TabsContent value="sessions">{sessionsTab}</TabsContent>
    </Tabs>
  );
}
