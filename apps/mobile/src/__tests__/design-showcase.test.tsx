import { render, screen } from "@testing-library/react-native";

let mockShow = false;
jest.mock("../lib/app-config", () => ({ ...jest.requireActual("../lib/app-config"), showDevRoutes: () => mockShow }));
jest.mock("expo-router", () => ({ Redirect: () => null }));

import DesignSystem from "../../app/dev/design-system";
import { renderWithProviders } from "./helpers/render";

it("is unreachable when dev routes are off", () => {
  mockShow = false;
  render(<DesignSystem />);
  expect(screen.queryByText(/Buttons/)).toBeNull();
});

it("renders v1's sections in v1's order when dev routes are on", () => {
  mockShow = true;
  renderWithProviders(<DesignSystem />);
  const order = [
    "Identity", "Theme", "Motion", "Elevation", "Palette", "Semantic aliases", "Role colors", "Typography",
    "Buttons", "Badges", "Avatars", "Tabs", "Progress", "Attendance pills", "Submission status badges",
    "File upload", "Data table", "Cards", "Form fields", "Modal", "Empty states", "Skeletons", "Icons",
  ];
  const headers = screen.getAllByRole("header").map((h) => h.props.children);
  expect(headers.filter((h) => order.includes(h))).toEqual(order);
});
