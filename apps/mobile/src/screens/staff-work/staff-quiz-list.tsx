/**
 * The Quizzes side of the staff Work tab (owner, 2026-11-13: "easily see what is draft and what is
 * published, and sort by creation time"). Drafts sit in their own section above, saying students
 * can't see them; published and paper quizzes below with how far grading has got. Both newest first.
 */
import type { QuizSummary } from "@space/shared";
import { useRouter } from "expo-router";
import { View } from "react-native";

import { NAV_ICONS } from "../../design/icons/nav-icon";
import { EmptyState } from "../../design/ui/empty-state";
import { GroupedList, ListRow } from "../../design/ui/grouped-list";
import { StatusChip, type ChipSpec } from "../../design/ui/status-chip";
import { Text } from "../../design/ui/text";
import { staffQuizHref } from "../quiz-detail/staff-quiz-href";
import { quizSections, quizSubtitle } from "./quiz-sections";

function gradingChip(q: QuizSummary): ChipSpec {
  const label = `${q.gradedCount} of ${q.studentCount} graded`;
  if (q.studentCount > 0 && q.gradedCount >= q.studentCount) return { tone: "ok", label };
  if (q.gradedCount > 0) return { tone: "info", label };
  return { tone: "neutral", label };
}

function Section({
  header,
  caption,
  rows,
  chip,
  canAuthor,
}: {
  header: string;
  caption: string;
  rows: QuizSummary[];
  chip: (q: QuizSummary) => ChipSpec;
  canAuthor: boolean;
}) {
  const router = useRouter();
  return (
    <View className="flex-col gap-1.5">
      <GroupedList header={`${header} (${rows.length})`}>
        {rows.map((q) => (
          <ListRow
            key={q.id}
            title={q.title}
            titleLines={2}
            subtitle={quizSubtitle(q)}
            trailing={<StatusChip {...chip(q)} />}
            trailingPlacement="below"
            chevron
            onPress={() => router.push(staffQuizHref(q, canAuthor))}
          />
        ))}
      </GroupedList>
      <Text variant="caption" className="px-4 text-muted-foreground">
        {caption}
      </Text>
    </View>
  );
}

export function StaffQuizList({ rows, canAuthor }: { rows: readonly QuizSummary[]; canAuthor: boolean }) {
  if (rows.length === 0)
    return <EmptyState icon={NAV_ICONS.quizzes} title="No quizzes yet" description="Add a quiz for a session." />;
  const { drafts, published } = quizSections(rows);
  return (
    <View className="flex-col gap-5">
      {drafts.length > 0 ? (
        <Section
          header="Drafts"
          caption="Students can't see these yet. Publish one when it's ready."
          rows={drafts}
          chip={() => ({ tone: "warn", label: "Draft" })}
          canAuthor={canAuthor}
        />
      ) : null}
      {published.length > 0 ? (
        <Section
          header="Published"
          caption="Students can see these. Paper quizzes show once their grade is entered."
          rows={published}
          chip={gradingChip}
          canAuthor={canAuthor}
        />
      ) : null}
    </View>
  );
}
