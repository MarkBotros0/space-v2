import { fireEvent, screen, within } from "@testing-library/react-native";
import { ScrollView } from "react-native";

let mockSweep = true;
jest.mock("../lib/app-config", () => ({ ...jest.requireActual("../lib/app-config"), isSweepBuild: () => mockSweep }));
jest.mock("expo-router", () => ({
  ...jest.requireActual("expo-router"),
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  Link: "Link",
}));

import DesignCatalogue from "../../app/(app)/design-catalogue";
import { renderWithProviders } from "./helpers/render";

const SECTIONS = [
  "logo",
  "type",
  "buttons",
  "chips",
  "list",
  "hero",
  "stats",
  "controls",
  "states",
  "checkin",
  "toast",
  "sheet",
  "save-bar",
  "people-rows",
  "start-issues",
];

it("renders every section when this is a sweep build", () => {
  mockSweep = true;
  renderWithProviders(<DesignCatalogue />);
  for (const id of SECTIONS) expect(screen.getByTestId(`catalogue-${id}`)).toBeTruthy();
  expect(screen.queryByText("Not available")).toBeNull();
});

it("says Not available outside a dev or sweep build", () => {
  mockSweep = false;
  const dev = (globalThis as { __DEV__?: boolean }).__DEV__;
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  try {
    renderWithProviders(<DesignCatalogue />);
    expect(screen.getByText("Not available")).toBeTruthy();
    expect(screen.queryByTestId("catalogue-chips")).toBeNull();
  } finally {
    (globalThis as { __DEV__?: boolean }).__DEV__ = dev;
  }
});

it("lets the row of stat tiles wrap to two columns on a narrow phone", () => {
  mockSweep = true;
  renderWithProviders(<DesignCatalogue />);
  expect(screen.getByTestId("catalogue-stat-row").props.className).toContain("flex-wrap");
});

it("gives every section title the testID the sweep flow swipes from", () => {
  mockSweep = true;
  renderWithProviders(<DesignCatalogue />);
  for (const id of SECTIONS) expect(screen.getByTestId(`catalogue-${id}-title`)).toBeTruthy();
});

it("shows a full-screen SaveBar in the screen's footer, outside the scroll view, and hides it on Save", () => {
  mockSweep = true;
  renderWithProviders(<DesignCatalogue />);
  expect(screen.queryByTestId("save-bar")).toBeNull();
  fireEvent.press(screen.getByTestId("catalogue-toggle-save-bar"));
  expect(screen.getByTestId("screen-footer")).toBeTruthy();
  expect(within(screen.UNSAFE_getByType(ScrollView)).queryByTestId("save-bar")).toBeNull();
  fireEvent.press(screen.getByText("Save changes"));
  expect(screen.queryByTestId("save-bar")).toBeNull();
});

it("shows ListRow footer chips and the disabled save bar (final review M8)", () => {
  mockSweep = true;
  renderWithProviders(<DesignCatalogue />);
  expect(within(screen.getByTestId("list-row-footer")).getByText("Not marked")).toBeTruthy();
  fireEvent.press(screen.getByTestId("catalogue-toggle-save-bar-disabled"));
  const bar = within(screen.getByTestId("save-bar"));
  expect(bar.getByText("Nothing to save yet.")).toBeTruthy();
  expect(bar.getByRole("button", { name: "Save changes" })).toBeDisabled();
});

it("shows the poll sheets with fixed data: who voted, the edit lines, and New votes came in", async () => {
  mockSweep = true;
  renderWithProviders(<DesignCatalogue />);
  fireEvent.press(screen.getByTestId("catalogue-open-voters"));
  expect(await screen.findByText("Former member")).toBeTruthy();
  expect(screen.getByText("Karim Fawzy")).toBeTruthy();
  fireEvent.press(screen.getByTestId("catalogue-open-edit-warning"));
  expect(await screen.findByText("Removing ‘Saturday’ deletes its 1 vote")).toBeTruthy();
  fireEvent.press(screen.getByTestId("catalogue-open-edit-new-votes"));
  expect(await screen.findByText("New votes came in: this change now deletes 4 votes.")).toBeTruthy();
});
