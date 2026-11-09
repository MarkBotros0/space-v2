import { File as FileIcon } from "lucide-react-native";
import { View } from "react-native";
import { plainTextToHtml, type SubmissionDetail } from "@space/shared";

import { iconWithClassName } from "../../design/lib/icon";
import { RichTextView } from "../../design/ui/rich-text-view";
import { Text } from "../../design/ui/text";
import { ListSectionHeader } from "../../design/ui/grouped-list";
import { storedTextToHtml } from "../../lib/stored-text";
import { formatKb } from "../../lib/format";

iconWithClassName(FileIcon);

function Section({ header, children }: { header: string; children: React.ReactNode }) {
  return (
    <View>
      <ListSectionHeader>{header}</ListSectionHeader>
      <View className="rounded-group bg-surface p-4">{children}</View>
    </View>
  );
}

/** The assignment's prompt, when it has one. */
export function PromptSection({ description }: { description: string | null }) {
  if (!description) return null;
  return (
    <Section header="Assignment prompt">
      <RichTextView html={storedTextToHtml(description)} />
    </Section>
  );
}

/** The written response and the attached files (which can't be opened in the app yet). */
export function WorkSection({ text, files }: { text: string | null; files: SubmissionDetail["files"] }) {
  return (
    <Section header="Submission">
      <View className="flex-col gap-4">
        <RichTextView html={text ? plainTextToHtml(text) : null} emptyText="No written response." />
        {files.length > 0 ? (
          <View className="flex-col gap-1.5">
            <Text variant="subhead" className="font-medium">
              Attachments
            </Text>
            {files.map((f) => (
              <View key={f.id} className="flex-row items-center justify-between gap-2 py-1.5">
                <View className="min-w-0 flex-1 flex-row items-center gap-2">
                  <FileIcon size={16} className="shrink-0 text-muted-foreground" />
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
        ) : null}
      </View>
    </Section>
  );
}

/** Returned work is the student's to edit; a reviewer only waits. */
export function ReturnedSection({ feedback }: { feedback: string | null }) {
  return (
    <Section header="Returned to the student">
      <View className="flex-col gap-3">
        <Text variant="subhead" className="text-muted-foreground">
          They can edit and submit again. You'll review it once they do.
        </Text>
        {feedback ? <RichTextView html={plainTextToHtml(feedback)} /> : null}
      </View>
    </Section>
  );
}

/** Feedback on its own surface: read-only for someone who can't review, the current one above the bar for someone who can. */
export function FeedbackSection({ header, feedback }: { header: string; feedback: string }) {
  return (
    <Section header={header}>
      <RichTextView html={plainTextToHtml(feedback)} />
    </Section>
  );
}
