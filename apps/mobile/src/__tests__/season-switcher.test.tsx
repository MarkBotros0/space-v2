import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { SeasonSwitcher } from "../components/SeasonSwitcher";

const seasons = [
  { id: 1, title: "GBV 2026" },
  { id: 2, title: "TW 2025" },
] as unknown as Parameters<typeof SeasonSwitcher>[0]["seasons"];

it("does not grow to fill a screen's spare height (horizontal ScrollView defaults to flexGrow 1)", () => {
  render(<SeasonSwitcher seasons={seasons} selectedId={1} onSelect={() => {}} />);
  const scroll = screen.getByTestId("season-switcher");
  expect(StyleSheet.flatten(scroll.props.style)).toMatchObject({ flexGrow: 0 });
});
