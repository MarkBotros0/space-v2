/**
 * One part on the Parts tab: its number and kind, what it asks (a video shows
 * its player), and Edit, Move up, Move down and Remove. Each fact is its own
 * line; no facts joined on one line with a dot.
 */
import { ChevronDown, ChevronUp, MessagesSquare, PenLine, PlayCircle, type LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import { formatTimestamp, parseYouTubeId, type AssignmentPartKind } from "@space/shared";

import { cn } from "../../design/lib/cn";
import { iconWithClassName } from "../../design/lib/icon";
import { Button } from "../../design/ui/button";
import { PillButton } from "../../design/ui/pill-button";
import { StatusChip, type ChipSpec } from "../../design/ui/status-chip";
import { Text } from "../../design/ui/text";
import type { PartDraft } from "../../lib/assignment-form-values";
import { plural } from "../../lib/plural";
import { PART_KIND_NAMES } from "./part-sheets/part-fields";
import type { PartStanding } from "./use-parts-draft";
import { VideoPreview } from "./video-preview";

iconWithClassName(ChevronDown, ChevronUp, MessagesSquare, PenLine, PlayCircle);

const KIND_ICONS: Record<AssignmentPartKind, LucideIcon> = {
  VIDEO: PlayCircle,
  ESSAY: PenLine,
  FORUM: MessagesSquare,
};

/** "150–300 words" kept in one run (word joiners round the dash), "At least 150 words", "Any length". */
function wordRangeLine(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${min}\u2060–\u2060${max} words`;
  if (min !== null) return `At least ${plural(min, "word")}`;
  if (max !== null) return `At most ${plural(max, "word")}`;
  return "Any length";
}

/** What the part asks, one fact per line, after its title or prompt. */
function partFacts(part: PartDraft): string[] {
  switch (part.kind) {
    case "VIDEO":
      return [
        `Length ${formatTimestamp(part.durationSeconds)}`,
        part.blockSkipping ? "Students can't skip ahead" : "Students can skip ahead",
      ];
    case "ESSAY":
      return [
        wordRangeLine(part.minWords, part.maxWords),
        part.maxFileSizeMb === null ? "No file uploads" : `Files up to ${part.maxFileSizeMb} MB`,
      ];
    case "FORUM":
      return [
        wordRangeLine(part.minWords, null),
        part.postToRead ? "Posts before reading others" : "Can read others first",
        part.allowComments ? "Peer comments on" : "No peer comments",
      ];
  }
}

/** A part changed since the last save says so in words; the card's edge says it too, never alone. */
const STANDING_CHIPS: Record<Exclude<PartStanding, null>, ChipSpec> = {
  new: { tone: "info", label: "New, not saved yet" },
  edited: { tone: "warn", label: "Edited, not saved yet" },
  moved: { tone: "neutral", label: "Moved, not saved yet" },
};

export function PartCard({
  part,
  index,
  count,
  error,
  standing = null,
  onEdit,
  onMove,
  onRemove,
}: {
  part: PartDraft;
  index: number;
  count: number;
  error?: string;
  /** How it differs from the saved assignment; null when it is as saved. */
  standing?: PartStanding;
  onEdit: () => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const name = PART_KIND_NAMES[part.kind];
  const Icon = KIND_ICONS[part.kind];
  const videoId = part.kind === "VIDEO" ? parseYouTubeId(part.youtubeUrl) : null;
  return (
    <View
      testID={`part-card-${part.key}`}
      className={cn(
        "flex-col gap-3 rounded-group bg-surface p-4 dark:border dark:border-separator",
        standing === "edited" || standing === "new" ? "border border-warn dark:border-warn" : null,
      )}
    >
      <View className="flex-row items-center gap-2" accessibilityRole="header">
        <Icon size={20} className="text-muted-foreground" />
        <Text variant="headline" className="min-w-0 flex-1 text-foreground">
          {`${index + 1}. ${name}`}
        </Text>
      </View>
      {standing !== null ? (
        <View className="self-start">
          <StatusChip {...STANDING_CHIPS[standing]} />
        </View>
      ) : null}
      <Text variant="body" className="text-foreground">
        {part.kind === "VIDEO" ? part.title : part.prompt}
      </Text>
      {videoId !== null ? <VideoPreview videoId={videoId} /> : null}
      <View className="flex-col gap-0.5">
        {partFacts(part).map((fact) => (
          <Text key={fact} variant="subhead" className="text-muted-foreground">
            {fact}
          </Text>
        ))}
      </View>
      {error ? (
        <Text variant="subhead" accessibilityRole="alert" className="text-bad">
          {`Fix this part: ${error}`}
        </Text>
      ) : null}
      <View className="flex-row flex-wrap items-center gap-2">
        <PillButton label="Edit" accessibilityLabel={`Edit ${name}`} onPress={onEdit} />
        <Button
          variant="secondary"
          size="icon"
          accessibilityLabel={`Move ${name} up`}
          disabled={index === 0}
          onPress={() => onMove(-1)}
        >
          <ChevronUp size={20} className="text-foreground" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          accessibilityLabel={`Move ${name} down`}
          disabled={index === count - 1}
          onPress={() => onMove(1)}
        >
          <ChevronDown size={20} className="text-foreground" />
        </Button>
        <PillButton label="Remove" accessibilityLabel={`Remove ${name}`} destructive onPress={onRemove} />
      </View>
    </View>
  );
}
