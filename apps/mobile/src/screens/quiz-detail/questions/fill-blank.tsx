import { useWindowDimensions, View } from "react-native";

import { cn } from "../../../design/lib/cn";
import { useScreenReaderEnabled } from "../../../design/lib/screen-reader";
import { textDirection } from "../../../design/lib/text-direction";
import { ContentText, Input, Label } from "../../../design/ui";
import { blanksInline, splitBlanks } from "../blank-segments";
import { ANSWER_INPUT, type QuestionProps } from "./props";

type Props = QuestionProps<"FILL_BLANK">;

/** The sentence with each gap shown as a numbered line, for the fields-under-the-sentence layout. */
const marked = (prompt: string) =>
  splitBlanks(prompt)
    .map((s) => (s.kind === "text" ? s.text : `_____ (${s.index + 1})`))
    .join("");

/**
 * Fill in the blank. The sentence wraps with an input at each gap, in the sentence's direction.
 * On a phone under 360dp, at a font scale past 1.15, or with a screen reader on, the sentence
 * reads whole with numbered gaps and the fields sit under it, labelled "Blank 1", "Blank 2".
 */
export function FillBlank({ question, answer, onChange, disabled }: Props) {
  const dims = useWindowDimensions();
  const screenReader = useScreenReaderEnabled();
  const direction = textDirection(question.prompt);
  const blanks = [...question.blanks].sort((a, b) => a.position - b.position);
  const textOf = (blankId: number) => answer.blanks.find((b) => b.blankId === blankId)?.text ?? "";
  const setText = (blankId: number, text: string) =>
    onChange({ blanks: blanks.map((b) => ({ blankId: b.id, text: b.id === blankId ? text : textOf(b.id) })) });

  const field = (n: number, className?: string) => {
    const blank = blanks[n];
    if (!blank) return null;
    return (
      <Input
        {...ANSWER_INPUT}
        key={blank.id}
        accessibilityLabel={`Blank ${n + 1}`}
        direction={direction}
        value={textOf(blank.id)}
        disabled={disabled}
        onChangeText={(text) => setText(blank.id, text)}
        className={className}
      />
    );
  };

  if (!blanksInline(dims) || screenReader) {
    return (
      <View className="flex-col gap-3">
        <ContentText variant="headline">{marked(question.prompt)}</ContentText>
        {blanks.map((blank, n) => (
          <View key={blank.id} className="flex-col gap-1.5">
            <Label>{`Blank ${n + 1}`}</Label>
            {field(n)}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View
      className={cn("flex-wrap items-center gap-x-1.5 gap-y-2", direction === "rtl" ? "flex-row-reverse" : "flex-row")}
    >
      {splitBlanks(question.prompt).flatMap((s, i) =>
        s.kind === "blank"
          ? [field(s.index, "w-auto min-w-[88px] max-w-full")]
          : s.text
              .split(/\s+/)
              .filter(Boolean)
              .map((word, w) => (
                <ContentText key={`${i}-${w}`} variant="headline">
                  {word}
                </ContentText>
              )),
      )}
    </View>
  );
}
