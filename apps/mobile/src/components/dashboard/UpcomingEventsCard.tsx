import type { UseQueryResult } from "@tanstack/react-query";
import { View } from "react-native";
import type { JpcEventListResponse } from "@space/shared";

import { InlineError } from "../../design/layout/route-states";
import { GroupedList, Skeleton } from "../../design/ui";
import { UpcomingEventsGroup } from "../../screens/events/upcoming-events-group";

const HEADER = "Upcoming events";

/**
 * v1 components/events/upcoming-events-card.tsx — the events on all six Homes
 * (spec 19 R5). The window (today onwards in the org zone), the cap and the
 * visibility rule are the server's (Plan 14); this renders rows. With no
 * upcoming events it renders nothing (owner, 2026-11-07: Today hides an empty
 * card; the Events screen still says so). The rows are the same grouped rows,
 * label above and chevron, as every other list on Home (owner, 2026-11-09): a
 * row with a url opens it, otherwise v2's event screen (v1 R11).
 */
export function UpcomingEventsCard({ query }: { query: UseQueryResult<JpcEventListResponse> }) {
  if (query.isSuccess && query.data.events.length === 0) return null;
  if (query.isSuccess) return <UpcomingEventsGroup events={query.data.events} header={HEADER} />;
  return (
    <GroupedList header={HEADER}>
      {query.isPending ? (
        <View accessible accessibilityLabel="Loading" className="flex-col gap-2.5 p-4">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </View>
      ) : (
        <InlineError
          className="p-4"
          message="Couldn't load upcoming events."
          onRetry={() => void query.refetch()}
        />
      )}
    </GroupedList>
  );
}
