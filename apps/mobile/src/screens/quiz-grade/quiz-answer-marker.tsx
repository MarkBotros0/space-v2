/**
 * One attempt's answers as the grader sees them, the answer key beside each (R103), in the
 * author's order. Choice and matching questions are marked by the server and show read-only;
 * each fill-in-the-blank gap shows the student's text beside the expected answer with Right / Wrong,
 * and each essay its text with the points to give (`EssayPoints`, owner 2026-11-13); one left empty
 * shows as wrong, with nothing to mark. The sheet owns the marks and the save; this draws them.
 *
 * Each question is its own section (owner, 2026-11-13 redesign): "Q2", its type and its points, or
 * "To mark" while something in it waits for the grader. Only the options that say something carry a
 * box (picked, or the correct one missed); the rest are a plain line, so the eye lands on the mark.
 */
import type { QuizGradingAttempt } from "@space/shared";
import { View } from "react-native";

import { ToggleButtons } from "../../design/forms/form-parts";
import { cn } from "../../design/lib/cn";
import { ContentText, StatusChip, Text } from "../../design/ui";
import { formatScore } from "../../lib/format";
import { plural } from "../../lib/plural";
import { splitBlanks } from "../quiz-detail/blank-segments";
import { questionTypeLabel } from "../quiz-detail/questions";
import { OptionLabel } from "../quiz-detail/true-false-glyph";
import { Mark } from "../quiz-detail/review/question-review";
import { EssayPoints } from "./essay-points";
import { isLeftEmpty, type ItemMark } from "./marking-model";

type Answer = QuizGradingAttempt["answers"][number];
type Of<T extends Answer["type"]> = Extract<Answer, { type: T }>;
type OnMark = (questionId: number, blankId: number, correct: boolean) => void;
type OnPoints = (questionId: number, points: number) => void;
type Marking = { marks: ItemMark[]; onMark: OnMark; onPoints: OnPoints };

/** Right / Wrong for one item. Never colour alone: the words carry the mark. */
function RightWrong({ value, onChange }: { value: boolean | null; onChange: (correct: boolean) => void }) {
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
  marks.find((m) => m.questionId === questionId && m.blankId === blankId);

function Choices({ a }: { a: Of<"SINGLE_CHOICE" | "TRUE_FALSE" | "MULTI_CHOICE"> }) {
  const picked = new Set(a.type === "MULTI_CHOICE" ? a.selectedOptionIds : [a.selectedOptionId]);
  return (
    <View className="flex-col gap-2">
      {a.options.map((o) =>
        picked.has(o.id) || o.isCorrect ? (
          <View key={o.id} className="flex-col gap-1 rounded-control border border-control-border bg-surface px-3 py-2">
            <OptionLabel label={o.label} trueFalse={a.type === "TRUE_FALSE"} />
            {picked.has(o.id) ? (
              <Mark right={o.isCorrect} word={o.isCorrect ? "Picked, right" : "Picked, wrong"} />
            ) : (
              <Mark right word="Correct answer, not picked" />
            )}
          </View>
        ) : (
          <View key={o.id} className="px-3">
            <OptionLabel label={o.label} trueFalse={a.type === "TRUE_FALSE"} className="text-muted-foreground" />
          </View>
        ),
      )}
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
            className="flex-col gap-1 rounded-control border border-control-border bg-surface px-3 py-2"
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

function Blanks({ a, marks, onMark }: { a: Of<"FILL_BLANK"> } & Marking) {
  const sorted = [...a.blanks].sort((x, y) => x.position - y.position);
  return (
    <View className="flex-col gap-2">
      {sorted.map((b, i) => (
        <View
          key={b.blankId}
          className="flex-col gap-2 rounded-control border border-control-border bg-surface px-3 py-2"
        >
          <Text variant="caption" className="font-bold text-muted-foreground">{`Blank ${i + 1}`}</Text>
          <ContentText variant="subhead">{`Student's answer: ${b.text || "none"}`}</ContentText>
          <ContentText variant="subhead" className="text-muted-foreground">{`Expected: ${b.expected}`}</ContentText>
          {isLeftEmpty(b.text) ? (
            <LeftEmpty />
          ) : (
            <RightWrong
              value={markOf(marks, a.questionId, b.blankId)?.correct ?? null}
              onChange={(c) => onMark(a.questionId, b.blankId, c)}
            />
          )}
        </View>
      ))}
    </View>
  );
}

function Essay({ a, marks, onPoints }: { a: Of<"ESSAY"> } & Marking) {
  return (
    <View className="flex-col gap-2">
      <ContentText variant="subhead" className="rounded-control border border-control-border bg-surface px-3 py-2">
        {a.text || "No answer"}
      </ContentText>
      {isLeftEmpty(a.text) ? (
        <LeftEmpty />
      ) : (
        <EssayPoints
          points={markOf(marks, a.questionId, null)?.points ?? null}
          max={a.points}
          onChange={(points) => onPoints(a.questionId, points)}
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

/** Whether something in this question still waits for the grader's mark. */
function waitsForMark(a: Answer, marks: ItemMark[]): boolean {
  return marks.some(
    (m) => m.questionId === a.questionId && (m.blankId === null ? m.points === null : m.correct === null),
  );
}

/** "Q2 · Fill in the blank" and, on the right, its points or "To mark". */
function QuestionHeader({ a, index, toMark }: { a: Answer; index: number; toMark: boolean }) {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Text variant="caption" className="font-bold text-muted-foreground">{`Q${index + 1}`}</Text>
      <StatusChip tone="neutral" label={questionTypeLabel(a)} />
      <View className="min-w-0 flex-1" />
      {toMark ? (
        <StatusChip tone="warn" label="To mark" />
      ) : (
        <Text variant="caption" tabular className="shrink-0 font-semibold text-muted-foreground">
          {a.pointsAwarded === null
            ? plural(a.points, "pt")
            : `${formatScore(a.pointsAwarded)} / ${plural(a.points, "pt")}`}
        </Text>
      )}
    </View>
  );
}

export function QuizAttemptAnswers({ attempt, ...marking }: { attempt: QuizGradingAttempt } & Marking) {
  return (
    <View className="flex-col gap-3">
      {attempt.answers.map((a, i) => (
        <View
          key={a.questionId}
          className={cn(
            "flex-col gap-3 rounded-group bg-background p-4",
            waitsForMark(a, marking.marks) && "border border-warn",
          )}
        >
          <QuestionHeader a={a} index={i} toMark={waitsForMark(a, marking.marks)} />
          <ContentText variant="subhead" className="font-semibold">
            {promptOf(a)}
          </ContentText>
          <Body a={a} {...marking} />
        </View>
      ))}
    </View>
  );
}
