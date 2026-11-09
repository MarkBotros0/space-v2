import { render, screen } from "@testing-library/react-native";

import { Avatar, AvatarFallback } from "../design/ui/avatar";
import tokens from "../design/theme/tokens.json";

const hex = (t: Record<string, string>, k: string) => t[k] ?? "";
function lum(h: string) {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const s = parseInt(h.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

// mentor D s41-01, s42-01: a pale mint disc with navy initials on the dark page.
describe("Avatar adapts to dark mode", () => {
  it("draws a deep teal disc with light initials in dark", () => {
    render(
      <Avatar testID="avatar">
        <AvatarFallback>MM</AvatarFallback>
      </Avatar>,
    );
    const disc = screen.getByTestId("avatar").props.className.split(" ");
    expect(disc).toEqual(expect.arrayContaining(["bg-brand-teal-100", "dark:bg-brand-teal-900"]));
    const text = screen.getByText("MM").props.className.split(" ");
    expect(text).toEqual(expect.arrayContaining(["text-brand-navy-900", "dark:text-brand-teal-50"]));
  });

  it("initials are at least 4.5:1 on the disc in both themes", () => {
    const t = tokens.light as Record<string, string>;
    expect(contrast(hex(t, "brand-navy-900"), hex(t, "brand-teal-100"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex(t, "brand-teal-50"), hex(t, "brand-teal-900"))).toBeGreaterThanOrEqual(4.5);
  });
});
