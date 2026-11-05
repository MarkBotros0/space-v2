import { fireEvent, render, screen } from "@testing-library/react-native";

import { setReducedMotionForTests } from "../design/motion";
import { StatTile } from "../design/ui/stat-tile";

beforeEach(() => setReducedMotionForTests(true));
afterEach(() => setReducedMotionForTests(null));

describe("StatTile", () => {
  it("is a plain labelled view without onPress", () => {
    render(<StatTile value={3} label="Students" />);
    expect(screen.getByLabelText("Students: 3")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("with onPress is a button that fires", () => {
    const onPress = jest.fn();
    render(<StatTile value={3} label="Students" onPress={onPress} />);
    fireEvent.press(screen.getByRole("button", { name: "Students: 3" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
