import { fireEvent, screen } from "@testing-library/react-native";

import { NotificationBell } from "../design/layout/notification-bell";
import { renderWithProviders } from "./helpers/render";

const classes = (el: { props: { className?: string } }) => (el.props.className ?? "").split(" ");

describe("NotificationBell", () => {
  it("is a button that opens the Notifications screen, no dropdown (owner, 2026-11-07)", () => {
    const onPress = jest.fn();
    renderWithProviders(<NotificationBell unread={0} onPress={onPress} />);
    fireEvent.press(screen.getByRole("button", { name: "Notifications" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Mark all read")).toBeNull();
    expect(screen.queryByTestId("bell-count")).toBeNull();
  });

  it("labels the unread count; the badge is a white-on-error-600 circle capped at 9+", () => {
    renderWithProviders(<NotificationBell unread={42} onPress={jest.fn()} />);
    expect(screen.getByLabelText("Notifications (42 unread)")).toBeTruthy();
    expect(screen.getByText("9+")).toBeTruthy();
    // A circle: as tall as its minimum width (an oval before, owner 2026-11-07).
    expect(classes(screen.getByTestId("bell-count"))).toEqual(
      expect.arrayContaining(["h-[18px]", "min-w-[18px]", "rounded-full", "bg-error-600"]),
    );
  });
});
