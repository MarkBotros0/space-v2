import { render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { Text } from "../design/ui/text";

const CASES = [
  ["largeTitle", 30, 34],
  ["title", 22, 28],
  ["headline", 17, 22],
  ["body", 16, 24],
  ["subhead", 14, 20],
  ["caption", 12, 16],
] as const;

function styleOf(node: { props: { style?: unknown } }) {
  return StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;
}

describe("Text variants", () => {
  it.each(CASES)("%s is %ipx / %ipx", (variant, fontSize, lineHeight) => {
    const { getByText } = render(<Text variant={variant}>hello</Text>);
    expect(styleOf(getByText("hello"))).toMatchObject({ fontSize, lineHeight });
  });

  it("defaults to body without inline sizing, so caller classes are never overridden", () => {
    const { getByText } = render(<Text>hello</Text>);
    expect(getByText("hello").props.className).toContain("text-base");
    expect(styleOf(getByText("hello")).fontSize).toBeUndefined();
    expect(styleOf(getByText("hello")).lineHeight).toBeUndefined();
  });

  it("text-base leading-tight keeps its own line height", () => {
    const { getByText } = render(<Text className="text-base leading-tight">t</Text>);
    expect(getByText("t").props.className).toContain("leading-tight");
    expect(styleOf(getByText("t")).lineHeight).toBeUndefined();
  });

  it("an explicit variant with leading-* sets no inline line height", () => {
    const { getByText } = render(<Text variant="title" className="leading-tight">t</Text>);
    expect(styleOf(getByText("t"))).toMatchObject({ fontSize: 22 });
    expect(styleOf(getByText("t")).lineHeight).toBeUndefined();
  });

  it("weights go through the font-* utilities (one Geist file per weight)", () => {
    const { getByText } = render(
      <>
        <Text variant="largeTitle">big</Text>
        <Text variant="title">mid</Text>
        <Text variant="headline">head</Text>
        <Text variant="body">plain</Text>
      </>,
    );
    expect(getByText("big").props.className).toContain("font-extrabold");
    expect(getByText("mid").props.className).toContain("font-semibold");
    expect(getByText("head").props.className).toContain("font-semibold");
    expect(getByText("plain").props.className).toContain("font-normal");
  });

  it("a caller size or weight class replaces the variant's, with no stale inline size", () => {
    const { getByText } = render(
      <Text variant="largeTitle" className="text-sm font-bold text-muted-foreground">x</Text>,
    );
    const node = getByText("x");
    expect(node.props.className).toContain("text-sm");
    expect(node.props.className).toContain("text-muted-foreground");
    expect(node.props.className).not.toContain("text-large-title");
    expect(node.props.className).not.toContain("font-extrabold");
    expect(styleOf(node).fontSize).toBeUndefined();
  });

  it("tabular sets tabular-nums", () => {
    const { getByText } = render(<Text tabular>1,234</Text>);
    expect(styleOf(getByText("1,234")).fontVariant).toEqual(["tabular-nums"]);
  });
});
