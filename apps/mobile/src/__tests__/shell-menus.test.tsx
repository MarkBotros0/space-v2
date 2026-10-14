import { fireEvent, screen } from "@testing-library/react-native";

import { NotificationBell } from "../design/layout/notification-bell";
import { TopBar } from "../design/layout/top-bar";
import { UserMenu } from "../design/layout/user-menu";
import { renderWithProviders } from "./helpers/render";

const now = new Date().toISOString();
const items = [
  { id: 1, title: "New assignment", body: "Week 3 reflection", readAt: null, createdAt: now, linked: true },
  { id: 2, title: "Graded", body: null, readAt: now, createdAt: now, linked: false },
];

describe("NotificationBell (v1 notification-bell.tsx)", () => {
  it("labels the unread count and caps the badge at 9+", () => {
    renderWithProviders(<NotificationBell items={items} unread={12} onMarkAllRead={jest.fn()} onViewAll={jest.fn()} onSelect={jest.fn()} />);
    expect(screen.getByLabelText("Notifications (12 unread)")).toBeTruthy();
    expect(screen.getByText("9+")).toBeTruthy();
  });

  it("opens the list; Mark all read is disabled with nothing unread; empty copy", () => {
    const onMarkAllRead = jest.fn();
    renderWithProviders(<NotificationBell items={[]} unread={0} onMarkAllRead={onMarkAllRead} onViewAll={jest.fn()} onSelect={jest.fn()} />);
    fireEvent.press(screen.getByLabelText("Notifications"));
    expect(screen.getByText("No notifications yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark all read" }).props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("selecting a linked row and View all report back", () => {
    const onSelect = jest.fn();
    const onViewAll = jest.fn();
    renderWithProviders(<NotificationBell items={items} unread={1} onMarkAllRead={jest.fn()} onViewAll={onViewAll} onSelect={onSelect} />);
    fireEvent.press(screen.getByLabelText("Notifications (1 unread)"));
    fireEvent.press(screen.getByText("New assignment"));
    expect(onSelect).toHaveBeenCalledWith(items[0]);
    fireEvent.press(screen.getByLabelText("Notifications (1 unread)"));
    fireEvent.press(screen.getByText("View all"));
    expect(onViewAll).toHaveBeenCalled();
  });
});

describe("UserMenu (v1 user-menu.tsx)", () => {
  it("shows name, role, v1's items, and signs out", () => {
    const onSignOut = jest.fn();
    const onProfile = jest.fn();
    renderWithProviders(
      <UserMenu role="STUDENT" userName="Sara Adel" initials="SA" isDark={false} onToggleTheme={jest.fn()} onProfile={onProfile} onSignOut={onSignOut} />,
    );
    fireEvent.press(screen.getByLabelText("User menu"));
    expect(screen.getByText("Sara Adel")).toBeTruthy();
    expect(screen.getByText("STUDENT")).toBeTruthy();
    expect(screen.getByText("Dark mode")).toBeTruthy();
    fireEvent.press(screen.getByText("Profile settings"));
    expect(onProfile).toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText("User menu"));
    fireEvent.press(screen.getByText("Sign out"));
    expect(onSignOut).toHaveBeenCalled();
  });

  it("offers Light mode when dark", () => {
    renderWithProviders(
      <UserMenu role="ADMIN" userName={null} initials="A" isDark onToggleTheme={jest.fn()} onProfile={jest.fn()} onSignOut={jest.fn()} />,
    );
    fireEvent.press(screen.getByLabelText("User menu"));
    expect(screen.getByText("Light mode")).toBeTruthy();
  });
});

it("TopBar shows v1's logo wordmark and its right-hand slot", () => {
  const { Text } = jest.requireActual("react-native");
  renderWithProviders(<TopBar right={<Text>RIGHT</Text>} />);
  expect(screen.getByText("JPC Space")).toBeTruthy();
  expect(screen.getByText("RIGHT")).toBeTruthy();
});
