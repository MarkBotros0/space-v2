/**
 * True and false as a tick and a cross, never the English words (owner, 2026-11-13: "sometimes the
 * quiz is in Arabic, so I don't want it to ... see true and false"). The server stores a true/false
 * question's options as "True" and "False"; every screen that draws one (the student's question and
 * review, grading, the answer key, the editor) draws this instead. The icon is in the text colour,
 * not green or red, so it never reads as right or wrong; a screen reader still says the word.
 */
import { Check, X } from "lucide-react-native";
import { View } from "react-native";

import { iconWithClassName } from "../../design/lib/icon";
import { ContentText } from "../../design/ui";

iconWithClassName(Check, X);

/** The value a stored true/false label stands for; null for any other label. */
function trueFalseOf(label: string): boolean | null {
  return label === "True" ? true : label === "False" ? false : null;
}

function TrueFalseGlyph({ value }: { value: boolean }) {
  const Icon = value ? Check : X;
  return (
    <View accessible accessibilityLabel={value ? "True" : "False"} className="flex-row items-center">
      <Icon size={24} strokeWidth={2.5} className="text-foreground" />
    </View>
  );
}

/** An option's label as text, or as the glyph on a true/false question. */
export function OptionLabel({
  label,
  trueFalse,
  className,
  style,
}: {
  label: string;
  trueFalse: boolean;
  className?: string;
  style?: { textAlign: "left" | "right" };
}) {
  const value = trueFalse ? trueFalseOf(label) : null;
  if (value !== null) return <TrueFalseGlyph value={value} />;
  return (
    <ContentText variant="subhead" className={className} style={style}>
      {label}
    </ContentText>
  );
}
