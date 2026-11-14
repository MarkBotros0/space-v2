/**
 * The rich editor runs in a WebView Jest can't drive. Tests that type into one mock its module with
 * this: a TextInput under the editor's label that sends what is typed as the editor would send HTML.
 * jest.mock("../design/ui/rich-text-editor", () => require("./helpers/rich-text-editor-mock"));
 */
import { TextInput } from "react-native";

export function RichTextEditor({
  value,
  onChange,
  accessibilityLabel,
  accessibilityHint,
}: {
  value: string;
  onChange: (html: string) => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  return (
    <TextInput
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      value={value}
      onChangeText={onChange}
    />
  );
}
