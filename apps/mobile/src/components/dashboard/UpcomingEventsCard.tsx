import type { UseQueryResult } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { CalendarDays } from "lucide-react-native";
import { Linking, Pressable, View } from "react-native";
import type { JpcEventListResponse } from "@space/shared";

import { Eyebrow } from "../../design/layout/page-title";
import { iconWithClassName } from "../../design/lib/icon";
import { shadowStyle } from "../../design/lib/shadow";
import { Button, Skeleton, Text } from "../../design/ui";
import { formatEventWhenShort } from "../../lib/format";

iconWithClassName(CalendarDays);

/**
 * v1 components/events/upcoming-events-card.tsx — the card on all six
 * dashboards (spec 19 R5). The window (today onwards in the org zone), the cap
 * and the visibility rule are the server's (Plan 14); this renders rows.
 * Unlike v1 it says so when there is nothing (D19/R10), and a row without a
 * url opens v2's event screen.
 */
export function UpcomingEventsCard({ query }: { query: UseQueryResult<JpcEventListResponse> }) {
  const router = useRouter();

  return (
    <View className="rounded-2xl border border-border bg-card p-4" style={shadowStyle("soft")}>
      <Eyebrow>Upcoming events</Eyebrow>
      {query.isPending ? (
        <View accessible accessibilityLabel="Loading" className="mt-2 flex-col gap-2.5">
          <Skeleton className="h-9 rounded-lg" />
          <Skeleton className="h-9 rounded-lg" />
        </View>
      ) : query.isError ? (
        <View className="mt-2 flex-col items-start gap-2">
          <Text className="text-sm text-error-600 dark:text-error-400">Couldn't load upcoming events.</Text>
          <Button variant="outline" size="sm" onPress={() => void query.refetch()}>
            Try again
          </Button>
        </View>
      ) : query.data.events.length === 0 ? (
        <View className="mt-2">
          <Text className="text-sm font-semibold text-foreground">No upcoming events</Text>
          <Text className="text-sm italic text-muted-foreground">Nothing is scheduled from today onwards.</Text>
        </View>
      ) : (
        <View className="mt-2 flex-col gap-2.5">
          {query.data.events.map((e) => {
            const when = formatEventWhenShort(e);
            return (
              <Pressable
                key={e.id}
                accessibilityRole={e.url ? "link" : "button"}
                accessibilityLabel={`${e.title}, ${when}`}
                className="flex-row items-start gap-3 active:opacity-80"
                onPress={() => {
                  // v1: an event with a url is an external link as a whole row (R11).
                  if (e.url) void Linking.openURL(e.url);
                  else router.push({ pathname: "/event/[id]", params: { id: String(e.id) } });
                }}
              >
                <CalendarDays size={16} className="mt-0.5 shrink-0 text-brand-teal-500" />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-sm font-bold text-brand-navy-900 dark:text-foreground">
                    {e.title}
                  </Text>
                  <Text className="text-xs text-muted-foreground">{when}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
