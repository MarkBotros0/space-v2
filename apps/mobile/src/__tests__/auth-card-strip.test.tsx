import { screen } from "@testing-library/react-native";

import { AuthCard } from "../design/layout/auth-card";
import { renderWithProviders } from "./helpers/render";

describe("AuthCard top strip", () => {
  it("covers the top inset with a solid strip so scrolled text never meets the clock", () => {
    renderWithProviders(<AuthCard title="Sign in" description="Welcome back" />);
    const strip = screen.getByTestId("auth-top-strip");
    // renderWithProviders reports a 47dp top inset.
    expect(strip.props.style).toEqual(expect.objectContaining({ height: 47 }));
    expect(strip.props.pointerEvents).toBe("none");
  });
});
