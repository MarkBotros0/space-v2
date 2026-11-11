import { render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { ContentText } from "../design/ui";

function styleOf(node: { props: { style?: unknown } }) {
  return StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;
}

describe("ContentText", () => {
  it("renders Arabic right to left in the Arabic font", () => {
    const { getByText } = render(<ContentText>اختر الإجابة</ContentText>);
    const node = getByText("اختر الإجابة");
    expect(styleOf(node)).toMatchObject({
      writingDirection: "rtl",
      textAlign: "right",
      fontFamily: "IBMPlexSansArabic_400Regular",
    });
    expect(node.props.selectable).toBe(false);
  });

  it("uses the semibold Arabic face for a bold variant", () => {
    const { getByText } = render(<ContentText variant="headline">سؤال</ContentText>);
    expect(styleOf(getByText("سؤال")).fontFamily).toBe("IBMPlexSansArabic_600SemiBold");
  });

  it("renders Latin left to right with no Arabic font", () => {
    const { getByText } = render(<ContentText>John 3:16</ContentText>);
    const style = styleOf(getByText("John 3:16"));
    expect(style).toMatchObject({ writingDirection: "ltr", textAlign: "left" });
    expect(style.fontFamily).toBeUndefined();
  });
});
