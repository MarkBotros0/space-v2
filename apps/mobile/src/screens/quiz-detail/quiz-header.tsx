import { View } from "react-native";
import type { StudentQuizDetail } from "@space/shared";

import { Text as TextV1 } from "../../design/ui";

/** A question's card on the student quiz pages. */
export const QCARD = "rounded-group bg-surface dark:border dark:border-separator p-4";

/** Quiz page header: title (text-xl), session line. Back is the frame's pinned bar (R23). */
export function QuizHeader({ detail }: { detail: StudentQuizDetail }) {
  return (
    <View>
      <TextV1
        accessibilityRole="header"
        className="text-xl font-black text-brand-navy-900 dark:text-foreground"
      >
        {detail.title}
      </TextV1>
      {detail.sessionTitle ? (
        <TextV1 className="text-sm text-muted-foreground">{detail.sessionTitle}</TextV1>
      ) : null}
    </View>
  );
}
