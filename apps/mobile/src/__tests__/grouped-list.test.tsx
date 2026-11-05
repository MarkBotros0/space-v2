import { fireEvent, render, screen } from "@testing-library/react-native";

import { GroupedList, ListRow, ListSectionHeader } from "../design/ui/grouped-list";
import { StatusChip } from "../design/ui/status-chip";
import { Text } from "../design/ui/text";

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

  it("section header renders uppercase label", () => {
    render(<ListSectionHeader>Past</ListSectionHeader>);
    expect(screen.getByText("PAST")).toBeTruthy();
  });
});
