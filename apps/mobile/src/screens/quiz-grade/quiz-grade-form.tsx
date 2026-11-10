/**
 * Port of v1 components/quizzes/quiz-grade-form.tsx (paper quizzes), as the
 * fields of one student's grade sheet: a score and a note. The screen owns the
 * drafts and the save (one student at a time; the server is the bound on the
 * score, D7), so this only draws what it is given.
 */
import { View } from "react-native";

import { Input } from "../../design/ui/input";
import { Text } from "../../design/ui/text";
import { Textarea } from "../../design/ui/textarea";

export function QuizGradeFields({
  name,
  maxScore,
  score,
  notes,
  onScore,
  onNotes,
}: {
  name: string;
  maxScore: number;
  score: string;
  notes: string;
  onScore: (value: string) => void;
  onNotes: (value: string) => void;
}) {
  return (
    <View className="flex-col gap-3 pb-4">
      <Text variant="subhead" className="text-muted-foreground">{`Out of ${maxScore}`}</Text>
      <Input
        accessibilityLabel={`Score for ${name}`}
        keyboardType="number-pad"
        placeholder="-"
        value={score}
        onChangeText={onScore}
      />
      <Textarea
        accessibilityLabel={`Notes for ${name}`}
        placeholder="Optional note..."
        value={notes}
        onChangeText={onNotes}
      />
    </View>
  );
}
