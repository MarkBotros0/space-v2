import type { UseQueryResult } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Linking, Pressable } from "react-native";
import type { JpcEventListResponse } from "@space/shared";

import { formatEventWhen } from "../../lib/format";
import { useTheme } from "../../theme";
import { Card, EmptyState, ErrorState, LoadingState, Text } from "../../ui";

/**
 * The card on all six dashboards (spec 19 R5). The window (today onwards in
 * the org zone), the cap and the visibility rule are the server's (Plan 14);
 * this renders rows. Unlike v1 it says so when there is nothing (R10).
 */
export function UpcomingEventsCard({ query }: { query: UseQueryResult<JpcEventListResponse> }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Card style={{ marginBottom: theme.spacing.sm }}>
      <Text variant="heading">Upcoming events</Text>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState message="Couldn't load upcoming events." onRetry={() => void query.refetch()} />
      ) : query.data.events.length === 0 ? (
        <EmptyState title="No upcoming events" message="Nothing is scheduled from today onwards." />
      ) : (
        query.data.events.map((e) => {
          const when = formatEventWhen(e);
          return (
            <Pressable
              key={e.id}
              accessibilityRole={e.url ? "link" : "button"}
              accessibilityLabel={`${e.title}, ${when}`}
              onPress={() => {
                // v1: an event with a url is an external link as a whole row (R11).
                if (e.url) void Linking.openURL(e.url);
                else router.push({ pathname: "/event/[id]", params: { id: String(e.id) } });
              }}
              style={{ paddingVertical: theme.spacing.sm }}
            >
              <Text variant="label">{e.title}</Text>
              <Text variant="caption" color={theme.colors.neutral[600]}>
                {when}
              </Text>
            </Pressable>
          );
        })
      )}
    </Card>
  );
}
