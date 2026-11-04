import { screen } from "@testing-library/react-native";

let mockSweep = true;
jest.mock("../lib/app-config", () => ({ ...jest.requireActual("../lib/app-config"), isSweepBuild: () => mockSweep }));
jest.mock("expo-router", () => ({ ...jest.requireActual("expo-router"), useRouter: () => ({ back: jest.fn(), push: jest.fn() }), Link: "Link" }));

import DesignCatalogue from "../../app/(app)/design-catalogue";
import { renderWithProviders } from "./helpers/render";

const SECTIONS = ["type", "buttons", "chips", "list", "hero", "stats", "controls", "states", "toast", "sheet"];

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
