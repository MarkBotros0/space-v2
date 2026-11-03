import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Pressable, View } from "react-native";
import type { StudentQuizDetail } from "@space/shared";

import { iconWithClassName } from "../../design/lib/icon";
import { Text as TextV1 } from "../../design/ui";

iconWithClassName(ArrowLeft);

/** A question's card on the student quiz pages. */
export const QCARD = "rounded-2xl border border-border bg-card p-4";

/** v1 quiz page header: "← Quizzes" link, title (text-xl), session line. */
export function QuizHeader({ detail }: { detail: StudentQuizDetail }) {
  const router = useRouter();
  return (
    <View>
      <Pressable
        accessibilityRole="link"
        onPress={() => router.back()}
        className="flex-row items-center gap-1 self-start"
      >
        <ArrowLeft size={12} className="text-brand-teal-700 dark:text-brand-teal-300" />
        <TextV1 className="text-xs font-semibold text-brand-teal-700 dark:text-brand-teal-300">
          Quizzes
        </TextV1>
      </Pressable>
      <TextV1
        accessibilityRole="header"
        className="mt-1 text-xl font-black text-brand-navy-900 dark:text-foreground"
      >
        {detail.title}
      </TextV1>
      {detail.sessionTitle ? (
        <TextV1 className="text-sm text-muted-foreground">{detail.sessionTitle}</TextV1>
      ) : null}
    </View>
  );
}
