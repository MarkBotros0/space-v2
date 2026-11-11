/** The essay screen's read-only pieces: the leader's note, the handed-in text, the files. */
import { File as FileIcon } from "lucide-react-native";
import { View } from "react-native";
import { plainTextToHtml, type SubmissionDetail } from "@space/shared";

import { iconWithClassName } from "../../design/lib/icon";
import { GroupedList, ListRow, RichTextView, Text } from "../../design/ui";
import { ListSectionHeader } from "../../design/ui/grouped-list";
import { formatKb } from "../../lib/format";

iconWithClassName(FileIcon);

/** The reviewer's note on a returned essay, above the box (spec "Essay part"). */
export function ReturnNote({ note }: { note: string }) {
  return (
    <View accessible className="gap-1 rounded-control bg-warn-soft p-3">
      <Text variant="subhead" className="font-semibold text-warn">
        Your leader's note
      </Text>
      <Text variant="subhead" className="text-warn">
        {note}
      </Text>
    </View>
  );
}

/** The essay as it was handed in, or left when the season finished. */
export function EssayText({ prompt, text }: { prompt: string; text: string | null }) {
  return (
    <View className="gap-2">
      <ListSectionHeader>Your essay</ListSectionHeader>
      <View className="gap-3 rounded-group bg-surface p-4">
        <Text variant="headline">{prompt}</Text>
        <RichTextView html={text ? plainTextToHtml(text) : null} emptyText="No written response." />
      </View>
    </View>
  );
}

export function LeaderFeedback({ feedback }: { feedback: string }) {
  return (
    <View className="gap-2">
      <ListSectionHeader>Leader feedback</ListSectionHeader>
      <View className="rounded-group bg-surface p-4">
        <RichTextView html={plainTextToHtml(feedback)} />
      </View>
    </View>
  );
}

/**
 * The essay work's files, on an essay that takes them (`maxFileSizeMb` set).
 * Reading them needs no upload; when uploading isn't on, the note says so
 * rather than offering a control the server refuses.
 */
export function EssayFiles({ essay, readOnly }: { essay: SubmissionDetail; readOnly: boolean }) {
  if (essay.maxFileSizeMb === null) return null;
  const header = `Files (max ${essay.maxFileSizeMb} MB each)`;
  // A finished season can't attach anything, so the upload note would only mislead.
  const note = !essay.canUploadFiles && !readOnly;
  return (
    <View className="gap-2">
      {essay.files.length > 0 ? (
        <GroupedList header={header}>
          {essay.files.map((f) => (
            <ListRow
              key={f.id}
              title={f.originalName}
              titleLines={2}
              leading={
                <FileIcon
                  size={16}
                  className="text-muted-foreground"
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              }
              trailing={
                <Text variant="caption" tabular className="text-muted-foreground">
                  {formatKb(f.sizeBytes)}
                </Text>
              }
              trailingLabel={formatKb(f.sizeBytes)}
            />
          ))}
        </GroupedList>
      ) : (
        <ListSectionHeader>{header}</ListSectionHeader>
      )}
      {essay.files.length === 0 ? (
        <Text variant="caption" className="text-muted-foreground">
          No files attached.
        </Text>
      ) : null}
      {note ? (
        <Text variant="caption" className="text-muted-foreground">
          This essay takes files, but attachments aren't available in the app yet.
        </Text>
      ) : null}
    </View>
  );
}
