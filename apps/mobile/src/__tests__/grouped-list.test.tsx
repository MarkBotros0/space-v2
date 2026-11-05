import { Text } from "react-native";
import { fireEvent, render, screen, within } from "@testing-library/react-native";

import { GroupedList, ListRow, ListSectionHeader } from "../design/ui/grouped-list";
import { StatusChip } from "../design/ui/status-chip";

describe("GroupedList / ListRow", () => {
  it("renders title, subtitle, trailing and a chevron", () => {
    render(
      <GroupedList header="Upcoming">
        <ListRow title="Session 4" subtitle="Tue 6pm" trailing={<StatusChip tone="ok" label="Present" />} chevron onPress={() => {}} />
      </GroupedList>,
    );
    expect(screen.getByText("UPCOMING")).toBeTruthy();
    expect(screen.getByText("Session 4")).toBeTruthy();
    expect(screen.getByText("Tue 6pm")).toBeTruthy();
    expect(screen.getByText("Present")).toBeTruthy();
    expect(screen.getByTestId("list-row-chevron", { includeHiddenElements: true })).toBeTruthy();
  });

  it("fires onPress and exposes a button", () => {
    const onPress = jest.fn();
    render(<ListRow title="Tap me" onPress={onPress} />);
    fireEvent.press(screen.getByRole("button", { name: /Tap me/ }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("announces a trailing StatusChip's word on a pressable row (I3)", () => {
    render(
      <ListRow
        title="Essay one"
        subtitle="Due Tue"
        trailing={<StatusChip tone="bad" label="Overdue" />}
        chevron
        onPress={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Essay one, Due Tue, Overdue" })).toBeTruthy();
  });

  it("announces trailingLabel for a trailing value that is not a chip, and it wins over a chip's label", () => {
    const { rerender } = render(<ListRow title="Score" trailing={<Text>8/10</Text>} trailingLabel="8 of 10" onPress={() => {}} />);
    expect(screen.getByRole("button", { name: "Score, 8 of 10" })).toBeTruthy();
    rerender(<ListRow title="Essay" trailing={<StatusChip tone="ok" label="Returned" />} trailingLabel="Returned with feedback" onPress={() => {}} />);
    expect(screen.getByRole("button", { name: "Essay, Returned with feedback" })).toBeTruthy();
  });

  it("is not a button without onPress", () => {
    render(<ListRow title="Static" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByTestId("list-row-chevron", { includeHiddenElements: true })).toBeNull();
  });

  it("keeps the title on one line at large font scale", () => {
    render(<ListRow title="A very long title that must ellipsize instead of wrapping" />);
    const title = screen.getByText(/A very long title/);
    expect(title.props.numberOfLines).toBe(1);
    expect(title.props.maxFontSizeMultiplier).toBeUndefined();
  });

  it("titleLines and subtitleLines pass through, defaulting to 1 and 2", () => {
    render(
      <>
        <ListRow title="Default row" subtitle="Default sub" />
        <ListRow title="Wide row" subtitle="Wide sub" titleLines={2} subtitleLines={3} />
      </>,
    );
    expect(screen.getByText("Default row").props.numberOfLines).toBe(1);
    expect(screen.getByText("Default sub").props.numberOfLines).toBe(2);
    expect(screen.getByText("Wide row").props.numberOfLines).toBe(2);
    expect(screen.getByText("Wide sub").props.numberOfLines).toBe(3);
  });

  it("onPressIn fires when a touch lands on a pressable row", () => {
    const onPressIn = jest.fn();
    render(<ListRow title="Warm me" onPress={() => {}} onPressIn={onPressIn} />);
    fireEvent(screen.getByRole("button", { name: /Warm me/ }), "pressIn");
    expect(onPressIn).toHaveBeenCalledTimes(1);
  });

  it("renders leading before the title and nothing extra without it", () => {
    render(<ListRow title="With" leading={<Text>LEAD</Text>} />);
    expect(screen.getByText("LEAD")).toBeTruthy();
    const plain = render(<ListRow title="Without" />);
    expect(screen.queryByText("LEAD")).toBeNull();
    // Without leading the row is title column + nothing: no shrink-0 wrapper.
    expect(JSON.stringify(plain.toJSON())).not.toContain("shrink-0");
  });

  it("section header renders uppercase label", () => {
    render(<ListSectionHeader>Past</ListSectionHeader>);
    expect(screen.getByText("PAST")).toBeTruthy();
  });
});

describe("ListRow titleLines", () => {
  it("lets the title take two lines when asked", () => {
    render(<ListRow title="A name that may need a second line" titleLines={2} />);
    expect(screen.getByText(/A name that may/).props.numberOfLines).toBe(2);
  });
});

describe("ListRow line caps", () => {
  it("caps by default and accepts null for no cap", () => {
    render(<ListRow title="Capped" subtitle="Sub" />);
    expect(screen.getByText("Capped").props.numberOfLines).toBe(1);
    expect(screen.getByText("Sub").props.numberOfLines).toBe(2);
    render(<ListRow title="Free" subtitle="Free sub" titleLines={null} subtitleLines={null} />);
    expect(screen.getByText("Free").props.numberOfLines).toBeUndefined();
    expect(screen.getByText("Free sub").props.numberOfLines).toBeUndefined();
  });
});

describe("ListRow trailingPlacement", () => {
  // The text column is the nearest View around the subtitle.
  function columnOf(text: string) {
    let n = screen.getByText(text).parent;
    while (n && (n.type as unknown) !== "View") n = n.parent;
    return n!;
  }
  it("below puts the trailing node inside the text column, after the subtitle", () => {
    render(<ListRow title="Body" subtitle="meta" trailing={<Text>Chip</Text>} trailingPlacement="below" />);
    expect(within(columnOf("meta")).queryByText("Chip")).not.toBeNull();
  });
  it("side keeps it out of the text column", () => {
    render(<ListRow title="Body" subtitle="meta" trailing={<Text>Chip</Text>} />);
    expect(within(columnOf("meta")).queryByText("Chip")).toBeNull();
  });
});
