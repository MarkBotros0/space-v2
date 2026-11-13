import { Check, X } from "lucide-react-native";
import { View } from "react-native";
import type { QuizQuestionStudent } from "@space/shared";

import { cn } from "../../../design/lib/cn";
import { iconWithClassName } from "../../../design/lib/icon";
import { Badge, ContentText, StatusChip, Text, type ChipSpec } from "../../../design/ui";
import { formatScore } from "../../../lib/format";
import { plural } from "../../../lib/plural";
import { splitBlanks } from "../blank-segments";
import { questionTypeLabel } from "../questions";
import { OptionLabel } from "../true-false-glyph";
import { QCARD } from "../quiz-header";
import { blankRows, matchRows, reviewRows, verdictOf, type Verdict } from "./review-model";

iconWithClassName(Check);
iconWithClassName(X);

const VERDICT_CHIP: Record<Verdict, ChipSpec> = {
  right: { tone: "ok", label: "Right" },
  wrong: { tone: "bad", label: "Wrong" },
  partly: { tone: "warn", label: "Partly right" },
  pending: { tone: "neutral", label: "Not marked" },
};

/** A tick or a cross with its word: the verdict is never colour alone. */
export function Mark({ right, word }: { right: boolean; word: string }) {
  const Icon = right ? Check : X;
  return (
    <View className="flex-row items-center gap-1">
      <Icon size={14} className={right ? "text-ok" : "text-bad"} />
      {/* The row's width, not the word's: at font 1.3 Android measured "Your answer, right" short
          and dropped "right" (UI sweep s06). */}
      <Text variant="caption" className={cn("min-w-0 flex-1 font-medium", right ? "text-ok" : "text-bad")}>
        {word}
      </Text>
    </View>
  );
}

function Row({ right, children }: { right: boolean | null; children: React.ReactNode }) {
  return (
    <View
      className={cn(
        "flex-col gap-1 rounded-control border px-3 py-2",
        right === null ? "border-control-border bg-surface" : right ? "border-ok bg-ok-soft" : "border-bad bg-bad-soft",
      )}
    >
      {children}
    </View>
  );
}

function Choices({ q }: { q: Extract<QuizQuestionStudent, { options: unknown }> }) {
  const multi = q.type === "MULTI_CHOICE";
  return (
    <View className="flex-col gap-2">
      {reviewRows(q).map((row) => {
        const missedKey = row.isAnswerKey && !row.mine;
        // A missed correct option is not a mistake of the student's: ok tone for one-pick questions,
        // neutral for multiple choice (the mistake there is the ticks they left out as a whole).
        const tone = row.mine ? row.correct : missedKey && !multi ? true : null;
        return (
          <Row key={row.id} right={tone}>
            <OptionLabel label={row.label} trueFalse={q.type === "TRUE_FALSE"} />
            {row.mine ? (
              <Mark right={row.correct} word={row.correct ? "Your answer, right" : "Your answer, wrong"} />
            ) : null}
            {missedKey ? <Mark right word={multi ? "Correct answer, not ticked" : "Correct answer"} /> : null}
          </Row>
        );
      })}
    </View>
  );
}

function Matches({ q }: { q: Extract<QuizQuestionStudent, { type: "MATCHING" }> }) {
  return (
    <View className="flex-col gap-2">
      {matchRows(q).map((row) => (
        <Row key={row.left} right={row.correct}>
          <ContentText variant="subhead" className="font-medium">
            {row.left}
          </ContentText>
          <ContentText variant="subhead">{`Your match: ${row.mine ?? "none"}`}</ContentText>
          <Mark right={row.correct} word={row.correct ? "Right" : "Wrong"} />
          {row.correct || row.correctRight === "" ? null : (
            <ContentText variant="subhead">{`Correct answer: ${row.correctRight}`}</ContentText>
          )}
        </Row>
      ))}
    </View>
  );
}

function Blanks({ q }: { q: Extract<QuizQuestionStudent, { type: "FILL_BLANK" }> }) {
  const sentence = splitBlanks(q.prompt)
    .map((s) => (s.kind === "text" ? s.text : `(${s.index + 1})`))
    .join("");
  return (
    <View className="flex-col gap-2">
      <ContentText variant="subhead" className="text-muted-foreground">
        {sentence}
      </ContentText>
      {blankRows(q).map((row) => (
        <Row key={row.index} right={row.correct}>
          <Text variant="caption" className="font-bold text-muted-foreground">{`Blank ${row.index}`}</Text>
          <ContentText variant="subhead">{`Your answer: ${row.text === "" ? "none" : row.text}`}</ContentText>
          {row.correct === null ? null : <Mark right={row.correct} word={row.correct ? "Right" : "Wrong"} />}
          {row.correct !== true && row.expected !== "" ? (
            <ContentText variant="subhead">{`Correct answer: ${row.expected}`}</ContentText>
          ) : null}
        </Row>
      ))}
    </View>
  );
}

/**
 * The essay with its mark. An essay can earn part of its points (owner 2026-11-13), which reads
 * "Partly right" in a neutral row rather than "Wrong"; the points are in the card's header.
 */
function Essay({ q }: { q: Extract<QuizQuestionStudent, { type: "ESSAY" }> }) {
  const marked = q.review !== null && q.review.correct !== null;
  const verdict = marked ? verdictOf(q) : "pending";
  const text = <ContentText variant="subhead">{q.answer.text || "No answer"}</ContentText>;
  if (verdict === "partly") {
    return (
      <Row right={null}>
        {text}
        <Text variant="caption" className="font-medium text-muted-foreground">
          Partly right
        </Text>
      </Row>
    );
  }
  const right = verdict === "pending" ? null : verdict === "right";
  return (
    <Row right={right}>
      {text}
      {right === null ? null : <Mark right={right} word={right ? "Right" : "Wrong"} />}
    </Row>
  );
}

function Body({ q }: { q: QuizQuestionStudent }) {
  switch (q.type) {
    case "MATCHING":
      return <Matches q={q} />;
    case "FILL_BLANK":
      return <Blanks q={q} />;
    case "ESSAY":
      return <Essay q={q} />;
    default:
      return <Choices q={q} />;
  }
}

/** One question after the answers are out: its marks, the student's answers marked, the key where they missed. */
export function QuestionReview({ q, index }: { q: QuizQuestionStudent; index: number }) {
  const outOf = plural(Number(formatScore(q.points)), "pt");
  const points = q.pointsAwarded === null ? outOf : `${formatScore(q.pointsAwarded)} / ${outOf}`;
  return (
    <View className={QCARD}>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text variant="caption" className="font-bold text-muted-foreground">{`Q${index + 1}`}</Text>
          <Badge variant="outline">{questionTypeLabel(q)}</Badge>
        </View>
        <View className="flex-row flex-wrap items-center gap-2">
          <Text variant="caption" tabular className="text-muted-foreground">
            {points}
          </Text>
          <StatusChip {...VERDICT_CHIP[verdictOf(q)]} />
        </View>
      </View>
      <View className="mt-2 flex-col gap-3">
        {q.type === "FILL_BLANK" ? null : <ContentText variant="headline">{q.prompt}</ContentText>}
        <Body q={q} />
      </View>
    </View>
  );
}
