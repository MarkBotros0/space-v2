import { fireEvent, screen } from "@testing-library/react-native";

import { UserMenu } from "../design/layout/user-menu";
import { renderWithProviders } from "./helpers/render";

describe("UserMenu (Home's avatar)", () => {
  it("is a button to Profile settings, with no dropdown (owner, 2026-11-07)", () => {
    const onPress = jest.fn();
    renderWithProviders(<UserMenu initials="SA" onPress={onPress} />);
    expect(screen.getByText("SA")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Profile settings" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Sign out")).toBeNull();
    expect(screen.queryByText("Dark mode")).toBeNull();
  });
});
