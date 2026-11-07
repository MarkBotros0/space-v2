import { useRouter } from "expo-router";
import { Linking } from "react-native";
import type { JpcEventListItem } from "@space/shared";

import { GroupedList, ListRow } from "../../design/ui";
import { formatEventWhenShort } from "../../lib/format";

/** Events as grouped rows. v1 R11: a row with a url opens it, otherwise v2's event screen. */
export function UpcomingEventsGroup({ events, header }: { events: JpcEventListItem[]; header: string }) {
  const router = useRouter();
  return (
    <GroupedList header={header}>
      {events.map((e) => (
        <ListRow
          key={e.id}
          title={e.title}
          titleLines={2}
          subtitle={formatEventWhenShort(e)}
          chevron
          onPress={() => {
            if (e.url) void Linking.openURL(e.url);
            else router.push({ pathname: "/event/[id]", params: { id: String(e.id) } });
          }}
        />
      ))}
    </GroupedList>
  );
}
