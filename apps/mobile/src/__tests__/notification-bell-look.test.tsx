import { fireEvent, screen } from "@testing-library/react-native";

import { NotificationBell } from "../design/layout/notification-bell";
import { renderWithProviders } from "./helpers/render";

const now = new Date().toISOString();
const items = [
  { id: 1, title: "New assignment", body: null, readAt: null, createdAt: now, linked: true },
  { id: 2, title: "Graded", body: null, readAt: now, createdAt: now, linked: false },
];
const classes = (el: { props: { className?: string } }) => (el.props.className ?? "").split(" ");

function open(unread = 1) {
  const onMarkAllRead = jest.fn();
  renderWithProviders(
    <NotificationBell items={items} unread={unread} onMarkAllRead={onMarkAllRead} onViewAll={jest.fn()} onSelect={jest.fn()} />,
  );
  fireEvent.press(screen.getByLabelText(/^Notifications/));
  return onMarkAllRead;
}

describe("NotificationBell look (super s29-05)", () => {
  it("Mark all read is a small link-style button with a 44dp target", () => {
    const onMarkAllRead = open();
    const button = screen.getByRole("button", { name: "Mark all read" });
    expect(classes(button)).toContain("min-h-[44px]");
    const label = classes(screen.getByText("Mark all read"));
    expect(label).toEqual(expect.arrayContaining(["text-sm", "font-medium", "text-info"]));
    expect(label).not.toContain("font-semibold");
    fireEvent.press(button);
    expect(onMarkAllRead).toHaveBeenCalled();
  });

  it("Mark all read mutes its label when there is nothing to mark", () => {
    open(0);
    expect(classes(screen.getByText("Mark all read"))).toContain("text-muted-foreground");
  });

  it("View all uses the info token, which reaches 4.5:1 on the popover in both themes", () => {
    open();
    expect(classes(screen.getByText("View all"))).toContain("text-info");
    expect(classes(screen.getByRole("link", { name: "View all" }))).toContain("min-h-[44px]");
  });

  it("an unread row is tinted with unread-soft in both themes; a read row is not", () => {
    open();
    expect(classes(screen.getByTestId("notification-row-1"))).toContain("bg-unread-soft");
    expect(classes(screen.getByTestId("notification-row-2"))).not.toContain("bg-unread-soft");
    expect(classes(screen.getByTestId("notification-row-1")).join(" ")).not.toMatch(/info-950/);
  });

  it("the count badge is white on error-600 (4.8:1), capped at 9+", () => {
    renderWithProviders(
      <NotificationBell items={items} unread={42} onMarkAllRead={jest.fn()} onViewAll={jest.fn()} onSelect={jest.fn()} />,
    );
    expect(screen.getByText("9+")).toBeTruthy();
    expect(classes(screen.getByTestId("bell-count"))).toContain("bg-error-600");
  });
});
