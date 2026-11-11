/**
 * One question as staff preview it: in the author's order, read-only, with the
 * answer key (rules: staff screens show the author's order; the key is for them).
 */
import { Check } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import type { QuizQuestionAuthoring } from "@space/shared";

import { cn } from "../../design/lib/cn";
import { iconWithClassName } from "../../design/lib/icon";
import { Badge, ContentText, Text } from "../../design/ui";
import { plural } from "../../lib/plural";
import { readablePrompt } from "./blank-segments";
import { questionTypeLabel } from "./questions";

iconWithClassName(Check);

function KeyRow({ correct, label, children }: { correct: boolean; label: string; children: ReactNode }) {
  return (
    <View
      accessible
      accessibilityLabel={correct ? `${label}, correct answer` : label}
      className={cn(
        "flex-col gap-1 rounded-control border px-3 py-2",
        correct ? "border-ok bg-ok-soft" : "border-control-border bg-surface",
      )}
    >
      {children}
      {correct ? (
        <View className="flex-row items-center gap-1">
          <Check size={14} className="text-ok" />
          <Text variant="caption" className="font-medium text-ok">
            Correct answer
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Options({ options }: { options: { key: string; label: string; isCorrect: boolean }[] }) {
  return (
    <View className="flex-col gap-2">
      {options.map((o) => (
        <KeyRow key={o.key} correct={o.isCorrect} label={o.label}>
          <ContentText variant="subhead">{o.label}</ContentText>
        </KeyRow>
      ))}
    </View>
  );
}

function Pairs({ q }: { q: Extract<QuizQuestionAuthoring, { type: "MATCHING" }> }) {
  return (
    <View className="flex-col gap-2">
      {q.pairs.map((p) => (
        <View key={p.leftId} className="flex-col gap-1 rounded-control border border-control-border px-3 py-2">
          <ContentText variant="subhead" className="font-medium">
            {p.left}
          </ContentText>
          <Text variant="caption" className="text-muted-foreground">
            Matches
          </Text>
          <ContentText variant="subhead">{p.right}</ContentText>
        </View>
      ))}
    </View>
  );
}

function Blanks({ q }: { q: Extract<QuizQuestionAuthoring, { type: "FILL_BLANK" }> }) {
  const blanks = [...q.blanks].sort((a, b) => a.position - b.position);
  return (
    <View className="flex-col gap-2">
      {blanks.map((b, i) => (
        <View key={b.id} className="flex-col gap-1 rounded-control border border-control-border px-3 py-2">
          <Text variant="caption" className="font-bold text-muted-foreground">{`Blank ${i + 1}, expected answer`}</Text>
          <ContentText variant="subhead">{b.expected}</ContentText>
        </View>
      ))}
    </View>
  );
}

function Body({ q }: { q: QuizQuestionAuthoring }) {
  switch (q.type) {
    case "SINGLE_CHOICE":
    case "MULTI_CHOICE":
      return <Options options={q.options.map((o) => ({ ...o, key: String(o.id) }))} />;
    case "TRUE_FALSE":
      return (
        <Options
          options={[
            { key: "true", label: "True", isCorrect: q.correct },
            { key: "false", label: "False", isCorrect: !q.correct },
          ]}
        />
      );
    case "MATCHING":
      return <Pairs q={q} />;
    case "FILL_BLANK":
      return <Blanks q={q} />;
    case "ESSAY":
      return (
        <Text variant="caption" className="text-muted-foreground">
          Free text, marked right or wrong by a leader.
        </Text>
      );
  }
}

export function StaffQuestionKey({ q, index }: { q: QuizQuestionAuthoring; index: number }) {
  return (
    <View className="flex-col gap-3 rounded-group bg-surface p-4">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text variant="caption" className="font-bold text-muted-foreground">{`Question ${index + 1}`}</Text>
        <Badge variant="outline">{questionTypeLabel(q)}</Badge>
        <Text variant="caption" tabular className="text-muted-foreground">
          {plural(q.points, "point")}
        </Text>
      </View>
      <ContentText variant="headline">{readablePrompt(q.prompt)}</ContentText>
      <Body q={q} />
    </View>
  );
}
