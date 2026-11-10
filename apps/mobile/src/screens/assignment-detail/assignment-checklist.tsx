/**
 * The student's checklist (spec layout A): how many parts are done, as words
 * with the bar, then one row per part in the admin's order, each with its kind's
 * icon, its title and its own status in words. Status is never colour alone.
 */
import { MessagesSquare, PenLine, PlayCircle, type LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import { partsLeft, type AssignmentPart, type AssignmentPartKind, type PartWork } from "@space/shared";

import { iconWithClassName } from "../../design/lib/icon";
import { GroupedList, ListRow, Progress, Text } from "../../design/ui";
import { partKindLabel, partStatusLine } from "../../lib/assignment-labels";
import { plural } from "../../lib/plural";

iconWithClassName(MessagesSquare, PenLine, PlayCircle);

const KIND_ICONS: Record<AssignmentPartKind, LucideIcon> = {
  VIDEO: PlayCircle,
  ESSAY: PenLine,
  FORUM: MessagesSquare,
};

/** What a part is called on its row: a video's title, an essay's or forum's question. */
function partName(part: AssignmentPart): string {
  return part.kind === "VIDEO" ? part.title : part.prompt;
}

/** "2 parts left", or that every part is done: the count in words beside the bar. */
function leftLine(left: number): string {
  return left === 0 ? "Every part is done" : `${plural(left, "part")} left`;
}

export function AssignmentChecklist({
  parts,
  works,
  onOpen,
}: {
  parts: AssignmentPart[];
  works: PartWork[];
  onOpen: (part: AssignmentPart) => void;
}) {
  if (parts.length === 0) {
    return (
      <Text variant="subhead" className="rounded-group bg-surface p-4 text-muted-foreground">
        This assignment has no parts yet.
      </Text>
    );
  }
  const ordered = [...parts].sort((a, b) => a.position - b.position);
  const workOf = (part: AssignmentPart) => works.find((w) => w.partId === part.id);
  const total = ordered.length;
  // The shared rule, as Submit's gate counts it.
  const left = partsLeft(ordered, works);
  const done = total - left;
  return (
    <View className="gap-4">
      <View className="gap-1.5">
        {/* No fill animation: the bar appears at its value (docs/rules/motion.md). */}
        <Progress value={(done / total) * 100} label={`${done} of ${total} done`} />
        <Text variant="caption" className="text-muted-foreground">
          {leftLine(left)}
        </Text>
      </View>
      <GroupedList header="Parts">
        {ordered.map((part) => {
          const Icon = KIND_ICONS[part.kind];
          return (
            <ListRow
              key={part.id}
              // "Essay: Who are you in the story?", then its status: a screen reader hears both.
              title={`${partKindLabel(part.kind)}: ${partName(part)}`}
              titleLines={2}
              subtitle={partStatusLine(part, workOf(part))}
              leading={
                <Icon size={22} className="text-primary" accessibilityElementsHidden importantForAccessibility="no" />
              }
              chevron
              onPress={() => onOpen(part)}
            />
          );
        })}
      </GroupedList>
    </View>
  );
}
