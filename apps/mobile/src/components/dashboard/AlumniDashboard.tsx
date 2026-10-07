import { useRouter } from "expo-router";
import { UPCOMING_EVENTS_LIMIT } from "@space/shared";

import { useUpcomingEvents } from "../../hooks/use-events";
import { firstName } from "../../lib/format";
import { useSessionStore } from "../../store/session";
import { useTheme } from "../../theme";
import { Button, Card, Text } from "../../ui";
import { DashboardFrame } from "./DashboardFrame";
import { UpcomingEventsCard } from "./UpcomingEventsCard";

/**
 * v1's alumni page: a greeting, the class year, one link (R59–R61). Its data
 * is the session (`/me`) and the events card — never `/me/dashboard`, which
 * answers an alumnus 403 (spec 19 §7).
 */
export function AlumniDashboard() {
  const theme = useTheme();
  const router = useRouter();
  const name = useSessionStore((s) => s.user?.name ?? null);
  const graduationYear = useSessionStore((s) => s.scopes?.graduationYear ?? null);
  const events = useUpcomingEvents(UPCOMING_EVENTS_LIMIT);

  return (
    <DashboardFrame onRefresh={() => void events.refetch()} refreshing={events.isRefetching}>
      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="title">{`Welcome back, ${firstName(name)}`}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>
          {`JPCS Alumnus · Class of ${graduationYear ?? "—"}`}
        </Text>
        <Button
          title="View my history"
          variant="secondary"
          onPress={() => router.push("/history")}
        />
      </Card>
      <UpcomingEventsCard query={events} />
    </DashboardFrame>
  );
}
