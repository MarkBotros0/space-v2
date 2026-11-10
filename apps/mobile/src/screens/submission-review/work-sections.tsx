import { File as FileIcon } from "lucide-react-native";
import { View } from "react-native";
import { plainTextToHtml, type SubmissionDetail } from "@space/shared";

import { iconWithClassName } from "../../design/lib/icon";
import { RichTextView } from "../../design/ui/rich-text-view";
import { StatusChip } from "../../design/ui/status-chip";
import { Text } from "../../design/ui/text";
import { ListSectionHeader } from "../../design/ui/grouped-list";
import { formatKb, formatShortDateTime } from "../../lib/format";
import { plural } from "../../lib/plural";
import { essayStatusChip } from "./essay-status";

iconWithClassName(FileIcon);

function Section({ header, children }: { header: string; children: React.ReactNode }) {
  return (
    <View>
      <ListSectionHeader>{header}</ListSectionHeader>
      <View className="rounded-group bg-surface p-4">{children}</View>
    </View>
  );
}

type ChipFields = "status" | "isLate" | "groupName" | "submittedAt" | "assignmentDueAt";

/** The essay's status, Late, the student's group, and its dates: one chip each, wrapping. */
export function EssayChips({ data }: { data: Pick<SubmissionDetail, ChipFields> }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      <StatusChip {...essayStatusChip(data.status)} />
      {data.isLate ? <StatusChip tone="warn" label="Late" /> : null}
      {data.groupName ? <StatusChip tone="neutral" label={data.groupName} /> : null}
      {data.submittedAt ? (
        <StatusChip tone="neutral" label={`Handed in ${formatShortDateTime(data.submittedAt)}`} />
      ) : null}
      {data.assignmentDueAt ? (
        <StatusChip tone="neutral" label={`Due ${formatShortDateTime(data.assignmentDueAt)}`} />
      ) : null}
    </View>
  );
}

/** The essay's own question, as the student saw it above the field. */
export function QuestionSection({ prompt }: { prompt: string }) {
  return (
    <Section header="Question">
      <Text variant="body">{prompt}</Text>
    </Section>
  );
}

function Attachments({ files }: { files: SubmissionDetail["files"] }) {
  return (
    <View className="flex-col gap-1.5">
      <Text variant="subhead" className="font-medium">
        Attachments
      </Text>
      {files.map((f) => (
        <View key={f.id} className="flex-row items-center justify-between gap-2 py-1.5">
          <View className="min-w-0 flex-1 flex-row items-center gap-2">
            <FileIcon
              size={16}
              className="shrink-0 text-muted-foreground"
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text variant="subhead" numberOfLines={1} className="shrink">
              {f.originalName}
            </Text>
          </View>
          <Text variant="caption" className="shrink-0 text-muted-foreground">
            {formatKb(f.sizeBytes)}
          </Text>
        </View>
      ))}
      <Text variant="caption" className="italic text-muted-foreground">
        Files can't be opened in the app yet.
      </Text>
    </View>
  );
}

/** The essay as handed in (plain text), its word count, and any files (which can't be opened in the app yet). */
export function EssaySection({ data }: { data: Pick<SubmissionDetail, "text" | "wordCount" | "files"> }) {
  return (
    <Section header="Essay">
      <View className="flex-col gap-4">
        <RichTextView html={data.text ? plainTextToHtml(data.text) : null} emptyText="No written answer." />
        <Text variant="caption" className="text-muted-foreground">
          {plural(data.wordCount, "word")}
        </Text>
        {data.files.length > 0 ? <Attachments files={data.files} /> : null}
      </View>
    </Section>
  );
}

/** A returned essay is the student's to change; a reviewer only waits. */
export function ReturnedSection({ feedback }: { feedback: string | null }) {
  return (
    <Section header="Returned to the student">
      <View className="flex-col gap-3">
        <Text variant="subhead" className="text-muted-foreground">
          They can change it and hand it in again. You can review it once they do.
        </Text>
        {feedback ? <RichTextView html={plainTextToHtml(feedback)} /> : null}
      </View>
    </Section>
  );
}

/** Feedback on its own surface: read-only for someone who can't review, the current one for someone who can. */
export function FeedbackSection({ header, feedback }: { header: string; feedback: string }) {
  return (
    <Section header={header}>
      <RichTextView html={plainTextToHtml(feedback)} />
    </Section>
  );
}
