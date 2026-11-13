/**
 * The top of the passing outlook (owner, 2026-11-13 redesign): two tiles with how many are on track
 * and below the mark, each with an icon and its words, then the pass criteria card: the mix as a
 * bar, the pass mark, and Edit for the season's admin or a super.
 */
import type { PassingOutlook } from "@space/shared";
import { CircleAlert, CircleCheck, type LucideIcon } from "lucide-react-native";
import { View } from "react-native";

import { iconWithClassName } from "../../design/lib/icon";
import { Button, Text } from "../../design/ui";
import { criteriaNotes, outlookHeader } from "./outlook-model";
import { WeightBar } from "./weight-bar";

iconWithClassName(CircleAlert, CircleCheck);

function Tile({
  icon: Icon,
  count,
  label,
  tone,
}: {
  icon: LucideIcon;
  count: number;
  label: string;
  tone: "ok" | "bad";
}) {
  const colour = tone === "ok" ? "text-ok" : "text-bad";
  return (
    <View
      className={`min-w-0 flex-1 flex-col gap-1 rounded-group p-4 ${tone === "ok" ? "bg-ok-soft" : "bg-bad-soft"}`}
      accessible
      accessibilityLabel={`${count} ${label.toLowerCase()}`}
    >
      <Icon size={20} className={colour} />
      <Text variant="largeTitle" tabular className={colour}>
        {String(count)}
      </Text>
      <Text variant="subhead" className="text-foreground">
        {label}
      </Text>
    </View>
  );
}

export function OutlookCounts({ outlook }: { outlook: PassingOutlook }) {
  const header = outlookHeader(outlook);
  return (
    <View className="flex-col gap-2">
      <View className="flex-row gap-3">
        <Tile icon={CircleCheck} count={header.onTrack} label="On track" tone="ok" />
        <Tile icon={CircleAlert} count={header.below} label="Below the mark" tone="bad" />
      </View>
      {header.noScore ? (
        <Text variant="subhead" className="px-1 text-muted-foreground">
          {header.noScore}
        </Text>
      ) : null}
    </View>
  );
}

const NOTHING_YET = "Nothing to count yet. Criteria can be set once the season has a session, an assignment or a quiz.";

export function CriteriaCard({ outlook, onEdit }: { outlook: PassingOutlook; onEdit?: () => void }) {
  const anything = outlook.available.attendance || outlook.available.assignments || outlook.available.quizzes;
  const notes = anything ? criteriaNotes(outlook) : [NOTHING_YET];
  return (
    <View className="flex-col gap-3 rounded-group bg-surface p-4">
      <View className="flex-row items-center gap-2">
        <Text variant="headline" accessibilityRole="header" className="min-w-0 flex-1">
          Pass criteria
        </Text>
        {onEdit && anything ? (
          <Button variant="secondary" size="sm" onPress={onEdit} accessibilityLabel="Edit criteria">
            Edit
          </Button>
        ) : null}
      </View>
      <WeightBar weights={outlook.criteria.weights} />
      <View className="flex-row items-baseline justify-between gap-2 border-t border-separator pt-3">
        <Text variant="body">Pass mark</Text>
        <Text variant="title" tabular accessibilityLabel={`Pass mark ${outlook.criteria.passMark}`}>
          {`${outlook.criteria.passMark} / 100`}
        </Text>
      </View>
      {notes.map((note) => (
        <Text key={note} variant="caption" className="text-muted-foreground">
          {note}
        </Text>
      ))}
    </View>
  );
}
