import { fireEvent, render, screen } from "@testing-library/react-native";

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
