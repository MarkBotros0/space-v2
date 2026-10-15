/**
 * Port of v1 components/quizzes/quiz-grade-form.tsx (paper quizzes). v1's
 * table is light-only (bg-white, neutral rings, no dark: classes) and scrolls
 * sideways inside its card at phone width; both are kept (B3-11, gap note).
 * The screen owns the edits and the save (touched rows only, D7).
 */
import type { QuizGradeSheet } from "@space/shared";
import { ScrollView, View } from "react-native";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Text } from "../ui/text";

const TABLE_SHADOW = { boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)" };
const HEAD = "px-4 py-3 text-sm font-semibold text-brand-navy-900";

export function QuizGradeForm({
  sheet,
  scoreOf,
  notesOf,
  onScore,
  onNotes,
  onSave,
  pending,
  saved,
  error,
}: {
  sheet: QuizGradeSheet;
  scoreOf: (studentUserId: number) => string;
  notesOf: (studentUserId: number) => string;
  onScore: (studentUserId: number, value: string) => void;
  onNotes: (studentUserId: number, value: string) => void;
  onSave: () => void;
  pending: boolean;
  saved: boolean;
  error: string | null;
}) {
  const graded = sheet.rows.filter((r) => scoreOf(r.studentUserId).trim() !== "").length;
  return (
    <View className="flex-col gap-4">
      <View className="overflow-hidden rounded-xl border border-neutral-200/60 bg-white" style={TABLE_SHADOW}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View className="flex-row border-b border-neutral-100">
              <Text className={`w-40 ${HEAD}`}>Student</Text>
              <Text className={`w-32 ${HEAD}`}>
                {"Score "}
                <Text className="text-sm font-normal text-neutral-400">{`/ ${sheet.maxScore}`}</Text>
              </Text>
              <Text className={`w-64 ${HEAD}`}>Notes</Text>
            </View>
            {sheet.rows.map((r, i) => {
              const name = r.studentName ?? "";
              return (
                <View key={r.studentUserId} className={`flex-row items-center ${i > 0 ? "border-t border-neutral-100" : ""}`}>
                  <Text className="w-40 px-4 py-3 text-sm font-medium text-brand-navy-900">{name}</Text>
                  <View className="w-32 px-4 py-3">
                    <Input
                      size="sm"
                      accessibilityLabel={`Score for ${name || "Student"}`}
                      keyboardType="number-pad"
                      placeholder="-"
                      value={scoreOf(r.studentUserId)}
                      onChangeText={(v) => onScore(r.studentUserId, v)}
                      className="w-24"
                    />
                  </View>
                  <View className="w-64 px-4 py-3">
                    <Input
                      size="sm"
                      accessibilityLabel={`Notes for ${name || "Student"}`}
                      placeholder="Optional note..."
                      value={notesOf(r.studentUserId)}
                      onChangeText={(v) => onNotes(r.studentUserId, v)}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>

      <View className="flex-row flex-wrap items-center gap-3">
        <Button onPress={onSave} disabled={pending}>
          {pending ? "Saving..." : "Save grades"}
        </Button>
        <Text className="text-sm text-neutral-500">{`${graded} / ${sheet.rows.length} graded`}</Text>
        {saved ? <Text className="text-sm font-semibold text-success-700">Saved</Text> : null}
        {error ? <Text className="text-sm text-error-600">{error}</Text> : null}
      </View>
    </View>
  );
}
