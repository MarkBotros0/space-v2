import { useRouter } from "expo-router";
import { GraduationCap, History } from "lucide-react-native";
import { View } from "react-native";
import { UPCOMING_EVENTS_LIMIT } from "@space/shared";

import { ShellFrame } from "../../design/layout/shell-frame";
import { iconWithClassName } from "../../design/lib/icon";
import { shadowStyle } from "../../design/lib/shadow";
import { Button, Text } from "../../design/ui";
import { useUpcomingEvents } from "../../hooks/use-events";
import { firstName } from "../../lib/format";
import { useSessionStore } from "../../store/session";
import { UpcomingEventsCard } from "./UpcomingEventsCard";

iconWithClassName(GraduationCap);
iconWithClassName(History);

/**
 * v1 app/alumni/dashboard/page.tsx: a welcome card, then the events card. Its
 * data is the session (`/me`) and the events card — never `/me/dashboard`,
 * which answers an alumnus 403 (spec 19 §7).
 */
export function AlumniDashboard() {
  const router = useRouter();
  const name = useSessionStore((s) => s.user?.name ?? null);
  const graduationYear = useSessionStore((s) => s.scopes?.graduationYear ?? null);
  const events = useUpcomingEvents(UPCOMING_EVENTS_LIMIT);

  return (
    <ShellFrame onRefresh={() => void events.refetch()} refreshing={events.isRefetching}>
      <View className="flex-col gap-4">
        <View className="rounded-2xl border border-border bg-card p-5" style={shadowStyle("soft")}>
          <View className="flex-row items-center gap-2">
            <GraduationCap size={16} className="text-brand-teal-700 dark:text-brand-teal-300" />
            <Text className="text-xs font-semibold uppercase tracking-wide text-brand-teal-700 dark:text-brand-teal-300">
              {`JPCS Alumnus · Class of ${graduationYear ?? "—"}`}
            </Text>
          </View>
          <Text
            accessibilityRole="header"
            className="mt-2 text-2xl font-black text-brand-navy-900 dark:text-foreground"
          >
            {`Welcome back, ${firstName(name)}`}
          </Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            Your journey with the community continues. Catch up on what&apos;s coming, and revisit
            the seasons you were part of.
          </Text>
          <View className="mt-4 flex-row">
            <Button
              variant="outline"
              className="self-start"
              onPress={() => router.push("/history")}
            >
              <History size={16} className="text-foreground" />
              View my history
            </Button>
          </View>
        </View>
        <UpcomingEventsCard query={events} />
      </View>
    </ShellFrame>
  );
}
