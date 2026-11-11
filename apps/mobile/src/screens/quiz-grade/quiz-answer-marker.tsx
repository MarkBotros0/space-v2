/**
 * One attempt's answers as the grader sees them, the answer key beside each (R103), in the
 * author's order. Choice and matching questions are marked by the server and show read-only;
 * each fill-in-the-blank gap shows the student's text beside the expected answer, and each essay
 * its text, with Right / Wrong for the leader (spec "Marking (leaders)"); one left empty shows
 * as wrong, with nothing to mark. An essay marked with
 * points before right/wrong existed shows its points read-only. The sheet owns the marks and the
 * save; this draws them. "Reopen retake" shows on SUBMITTED attempts too, for every grader
 * (spec 12 D5).
 */
import type { QuizGradingAttempt } from "@space/shared";
import { RotateCcw } from "lucide-react-native";
import { View } from "react-native";

import { ToggleButtons } from "../../design/forms/form-parts";
import { cn } from "../../design/lib/cn";
import { iconWithClassName } from "../../design/lib/icon";
import { Button, ContentText, Text } from "../../design/ui";
import { formatScore } from "../../lib/format";
import { plural } from "../../lib/plural";
import { splitBlanks } from "../quiz-detail/blank-segments";
import { Mark } from "../quiz-detail/review/question-review";
import { isLeftEmpty, isLegacyEssay, type ItemMark } from "./marking-model";

iconWithClassName(RotateCcw);

type Answer = QuizGradingAttempt["answers"][number];
type Of<T extends Answer["type"]> = Extract<Answer, { type: T }>;
type OnMark = (questionId: number, blankId: number | null, correct: boolean) => void;
type Marking = { marks: ItemMark[]; readOnly: boolean; onMark: OnMark };

export function ReopenButton({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  return (
    <Button size="sm" variant="secondary" className="self-start" onPress={onPress} disabled={disabled}>
      <RotateCcw size={16} className="text-foreground" />
      Reopen retake
    </Button>
  );
}

/** Right / Wrong for one item, or the mark it holds when the attempt is read-only. Never colour alone. */
function RightWrong({
  value,
  readOnly,
  onChange,
}: {
  value: boolean | null;
  readOnly: boolean;
  onChange: (correct: boolean) => void;
}) {
  if (readOnly) return value === null ? null : <Mark right={value} word={value ? "Right" : "Wrong"} />;
  return (
    <ToggleButtons<"right" | "wrong" | "">
      options={[
        { value: "right", label: "Right" },
        { value: "wrong", label: "Wrong" },
      ]}
      value={value === null ? "" : value ? "right" : "wrong"}
      onChange={(v) => onChange(v === "right")}
    />
  );
}

/** An item the student left empty: wrong already, nothing for the leader to mark. */
function LeftEmpty() {
  return <Mark right={false} word="Left empty, wrong" />;
}

const markOf = (marks: ItemMark[], questionId: number, blankId: number | null) =>
  marks.find((m) => m.questionId === questionId && m.blankId === blankId)?.correct ?? null;

function Choices({ a }: { a: Of<"SINGLE_CHOICE" | "TRUE_FALSE" | "MULTI_CHOICE"> }) {
  const picked = new Set(a.type === "MULTI_CHOICE" ? a.selectedOptionIds : [a.selectedOptionId]);
  return (
    <View className="flex-col gap-2">
      {a.options.map((o) => (
        <View
          key={o.id}
          className="flex-col gap-1 rounded-control border border-control-border bg-surface-raised px-3 py-2"
        >
          <ContentText variant="subhead">{o.label}</ContentText>
          {picked.has(o.id) ? (
            <Mark right={o.isCorrect} word={o.isCorrect ? "Picked, right" : "Picked, wrong"} />
          ) : o.isCorrect ? (
            <Mark right word="Correct answer, not picked" />
          ) : null}
        </View>
      ))}
    </View>
  );
}

function Matches({ a }: { a: Of<"MATCHING"> }) {
  return (
    <View className="flex-col gap-2">
      {a.pairs.map((p) => {
        const chosenId = a.chosen.find((c) => c.leftId === p.leftId)?.rightId;
        const chosen = a.pairs.find((x) => x.rightId === chosenId)?.right ?? null;
        const right = chosenId === p.rightId;
        return (
          <View
            key={p.leftId}
            className="flex-col gap-1 rounded-control border border-control-border bg-surface-raised px-3 py-2"
          >
            <ContentText variant="subhead" className="font-medium">
              {p.left}
            </ContentText>
            <ContentText variant="subhead">{`Student's match: ${chosen ?? "none"}`}</ContentText>
            <Mark right={right} word={right ? "Right" : "Wrong"} />
            {right ? null : <ContentText variant="subhead">{`Correct answer: ${p.right}`}</ContentText>}
          </View>
        );
      })}
    </View>
  );
}

function Blanks({ a, marks, readOnly, onMark }: { a: Of<"FILL_BLANK"> } & Marking) {
  const sorted = [...a.blanks].sort((x, y) => x.position - y.position);
  return (
    <View className="flex-col gap-2">
      {sorted.map((b, i) => (
        <View
          key={b.blankId}
          className="flex-col gap-2 rounded-control border border-control-border bg-surface-raised px-3 py-2"
        >
          <Text variant="caption" className="font-bold text-muted-foreground">{`Blank ${i + 1}`}</Text>
          <ContentText variant="subhead">{`Student's answer: ${b.text || "none"}`}</ContentText>
          <ContentText variant="subhead" className="text-muted-foreground">{`Expected: ${b.expected}`}</ContentText>
          {isLeftEmpty(b.text) ? (
            <LeftEmpty />
          ) : (
            <RightWrong
              value={markOf(marks, a.questionId, b.blankId)}
              readOnly={readOnly}
              onChange={(c) => onMark(a.questionId, b.blankId, c)}
            />
          )}
        </View>
      ))}
    </View>
  );
}

function Essay({ a, marks, readOnly, onMark }: { a: Of<"ESSAY"> } & Marking) {
  return (
    <View className="flex-col gap-2">
      <ContentText
        variant="subhead"
        className="rounded-control border border-control-border bg-surface-raised px-3 py-2"
      >
        {a.text || "No answer"}
      </ContentText>
      {isLegacyEssay(a) ? (
        <Text variant="caption" className="font-medium text-muted-foreground">
          {`Marked: ${plural(a.pointsAwarded ?? 0, "pt")}`}
        </Text>
      ) : isLeftEmpty(a.text) ? (
        <LeftEmpty />
      ) : (
        <RightWrong
          value={markOf(marks, a.questionId, null)}
          readOnly={readOnly}
          onChange={(c) => onMark(a.questionId, null, c)}
        />
      )}
    </View>
  );
}

function Body({ a, ...marking }: { a: Answer } & Marking) {
  switch (a.type) {
    case "MATCHING":
      return <Matches a={a} />;
    case "FILL_BLANK":
      return <Blanks a={a} {...marking} />;
    case "ESSAY":
      return <Essay a={a} {...marking} />;
    default:
      return <Choices a={a} />;
  }
}

/** A fill-in-the-blank prompt reads with its gaps numbered, so "Blank 2" points somewhere. */
function promptOf(a: Answer): string {
  if (a.type !== "FILL_BLANK") return a.prompt;
  return splitBlanks(a.prompt)
    .map((s) => (s.kind === "text" ? s.text : `(${s.index + 1})`))
    .join("");
}

/** `readOnly`: nothing to save (a legacy point-marked attempt), so marks show as they stand. */
export function QuizAttemptAnswers({ attempt, ...marking }: { attempt: QuizGradingAttempt } & Marking) {
  return (
    <View className="flex-col gap-3">
      {attempt.answers.map((a, i) => (
        <View key={a.questionId} className={cn("flex-col gap-2", i > 0 && "border-t border-separator pt-3")}>
          <View className="flex-row items-start gap-2">
            <ContentText variant="subhead" className="min-w-0 flex-1 font-semibold">
              {promptOf(a)}
            </ContentText>
            {a.pointsAwarded === null ? null : (
              <Text variant="caption" tabular className="shrink-0 text-muted-foreground">
                {`${formatScore(a.pointsAwarded)}/${formatScore(a.points)}`}
              </Text>
            )}
          </View>
          <Body a={a} {...marking} />
        </View>
      ))}
    </View>
  );
}
