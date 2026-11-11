import type { QuizLive, QuizLiveRow } from "@space/shared";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { QueryGate } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { EmptyState, GroupedList, ListRow, StatTile, StatusChip, Text } from "../../design/ui";
import { useQuizLive } from "../../hooks/use-quizzes";
import { people } from "../../lib/plural";
import { clockOffsetMs } from "../quiz-detail/countdown";
import { LiveRowSheet } from "./live-row-sheet";
import { liveRowAction, liveRowView, liveSummary } from "./live-model";
import { useScreenActive } from "./use-screen-active";

const TICK_MS = 1000;

/** The phone's time, once a second while `on`: the rows' "12:30 left" counts down between reads. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [on]);
  return now;
}

function Summary({ rows }: { rows: QuizLiveRow[] }) {
  const s = liveSummary(rows);
  return (
    <View className="flex-col gap-2">
      <View className="flex-row flex-wrap gap-2">
        <StatTile value={s.inProgress} label="In progress" />
        <StatTile value={s.notStarted} label="Not started" />
        <StatTile value={s.finished} label="Finished" />
      </View>
      {s.withExits > 0 ? (
        <Text variant="subhead" className="text-muted-foreground">
          {`${people(s.withExits)} left the quiz at least once.`}
        </Text>
      ) : null}
    </View>
  );
}

function LiveBody({ id, data, offsetMs, now }: { id: number; data: QuizLive; offsetMs: number; now: number }) {
  const [shown, setShown] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const timed = data.timeLimitMinutes !== null;
  const view = (r: QuizLiveRow) => liveRowView(r, offsetMs, now, timed);
  const row = data.rows.find((r) => r.studentUserId === shown);

  if (data.rows.length === 0) {
    return <EmptyState title="No students" description="Students in your groups appear here once they are enrolled." />;
  }
  return (
    <View className="flex-col gap-4">
      <Summary rows={data.rows} />
      <GroupedList header="Students">
        {data.rows.map((r) => {
          const v = view(r);
          const pressable = liveRowAction(r) !== null;
          return (
            <ListRow
              key={r.studentUserId}
              title={v.title}
              titleLines={2}
              subtitle={v.detail}
              spokenDetail={v.spoken}
              trailing={<StatusChip {...v.stateChip} />}
              chevron={pressable}
              onPress={
                pressable
                  ? () => {
                      setShown(r.studentUserId);
                      setOpen(true);
                    }
                  : undefined
              }
            />
          );
        })}
      </GroupedList>
      {row ? (
        <LiveRowSheet
          key={row.studentUserId}
          quizId={id}
          row={row}
          view={view(row)}
          open={open}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </View>
  );
}

/**
 * Staff (leader, the season's admin, super): where every student in scope is while the quiz runs
 * (spec "Live screen"). Re-reads every 4 s while in front and the app is open; pull to refresh too.
 * No answer content crosses here.
 */
export function LiveScreen({ id }: { id: number }) {
  const active = useScreenActive();
  const query = useQuizLive(id, active);
  const { data, dataUpdatedAt } = query;
  const ticking = active && (data?.rows.some((r) => r.deadlineAt !== null) ?? false);
  const now = useNow(ticking);
  const offsetMs = data ? clockOffsetMs(data.serverNow, dataUpdatedAt) : 0;
  // Only a pull shows the spinner; the 4 s re-reads stay silent.
  const [pulling, setPulling] = useState(false);
  const onRefresh = () => {
    setPulling(true);
    void query.refetch().finally(() => setPulling(false));
  };

  return (
    <Screen title="Live" subtitle={data?.title} refreshing={pulling} onRefresh={onRefresh}>
      <QueryGate query={query}>{(live) => <LiveBody id={id} data={live} offsetMs={offsetMs} now={now} />}</QueryGate>
    </Screen>
  );
}
