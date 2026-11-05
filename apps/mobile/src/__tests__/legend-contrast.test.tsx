import { render, screen } from "@testing-library/react-native";

import { Legend } from "../components/calendar/CalendarEntries";

const { colors, semantic } = require("../design/theme/tailwind-theme.js") as {
  colors: Record<string, Record<string, string> | string>;
  semantic: Record<"light" | "dark", Record<string, string>>;
};

/** The hex a `text-*`/`bg-*` class resolves to in a theme (dark: classes win in dark). */
function resolve(className: string, prefix: "text" | "bg", scheme: "light" | "dark"): string {
  const all = className.split(" ");
  const pick = (cs: string[]) =>
    cs.find((c) => c.startsWith(`${prefix}-`) && !/^text-(xs|sm|base|caption)$/.test(c));
  const dark = pick(all.filter((c) => c.startsWith("dark:")).map((c) => c.slice(5)));
  const cls = (scheme === "dark" && dark) || pick(all.filter((c) => !c.includes(":")));
  const name = cls!.slice(prefix.length + 1);
  if (semantic[scheme][name]) return semantic[scheme][name]!;
  const m = /^(.*)-(\d{2,3})$/.exec(name)!;
  return (colors[m[1]!] as Record<string, string>)[m[2]!]!;
}

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

// alumni s48-01: "Upcoming" and "Past" read at ~3:1 on device: 12px regular text on a tint.
describe.each(["light", "dark"] as const)("events legend chips (%s)", (scheme) => {
  it.each(["Today", "Upcoming", "Past", "JPC event", "Alumni only"])(
    "%s is 4.5:1 on its chip, at medium weight",
    (label) => {
      render(<Legend slots={null} />);
      const text = screen.getByText(label);
      const chip = screen.getByTestId(`chip-${label}`);
      const fg = resolve(text.props.className, "text", scheme);
      const bg = resolve(chip.props.className, "bg", scheme);
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
      expect(text.props.className.split(" ")).toContain("font-medium");
    },
  );

  it("Upcoming keeps a wide margin over 4.5 (it sat at 4.6 with teal-800)", () => {
    render(<Legend slots={null} />);
    const text = screen.getByText("Upcoming");
    const chip = screen.getByTestId("chip-Upcoming");
    expect(
      contrast(
        resolve(text.props.className, "text", scheme),
        resolve(chip.props.className, "bg", scheme),
      ),
    ).toBeGreaterThanOrEqual(6);
  });
});
