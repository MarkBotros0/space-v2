import { useRouter } from "expo-router";
import { View } from "react-native";
import type { MySeason } from "@space/shared";

import { GroupedList, ListRow, Text } from "../../design/ui";
import { formatSessionTime } from "../../lib/format";

/** "MMM" / "d" for the date tile, read from the org day key (X13). */
function dayTile(dayKey: string): { month: string; day: string; weekday: string } {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return {
    month: date.toLocaleString("en-US", { month: "short" }),
    day: String(d ?? ""),
    weekday: date.toLocaleString("en-US", { weekday: "short" }),
  };
}

function DateTile({ month, day }: { month: string; day: string }) {
  return (
    <View className="size-11 items-center justify-center rounded-full bg-brand-teal-100 dark:bg-brand-teal-950">
      <Text
        variant="caption"
        maxFontSizeMultiplier={1.15}
        className="font-bold uppercase leading-none text-brand-teal-800 dark:text-brand-teal-200"
      >
        {month}
      </Text>
      <Text
        variant="subhead"
        maxFontSizeMultiplier={1.15}
        className="font-black text-brand-teal-800 dark:text-brand-teal-200"
      >
        {day}
      </Text>
    </View>
  );
}

/** The next session only (owner, 2026-11-07); the rest are a tap away on the calendar. */
export function UpcomingSection({ upcoming }: { upcoming: MySeason["upcoming"] }) {
  const router = useRouter();
  return (
    <GroupedList
      header="Next session"
      headerAction={{ label: "See calendar", onPress: () => router.push("/calendar") }}
    >
      {upcoming.length === 0 ? (
        <View className="min-h-[52px] justify-center px-4 py-2">
          <Text variant="subhead" className="italic text-muted-foreground">
            No upcoming sessions.
          </Text>
        </View>
      ) : (
        upcoming.slice(0, 1).map((s) => {
          const tile = dayTile(s.dayKey);
          // No org wall time in this payload: the time is the device's reading of startsAt (gap note).
          const when = `${tile.weekday} · ${formatSessionTime(s.startsAt)}`;
          return (
            <ListRow
              key={s.id}
              title={s.title}
              subtitle={s.location ? `${when} · ${s.location}` : when}
              leading={<DateTile month={tile.month} day={tile.day} />}
              onPress={() => router.push({ pathname: "/session/[id]", params: { id: String(s.id) } })}
            />
          );
        })
      )}
    </GroupedList>
  );
}
