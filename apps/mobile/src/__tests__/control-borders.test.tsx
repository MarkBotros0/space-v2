import { readFileSync } from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { Input } from "../design/ui/input";
import { SearchField } from "../design/ui/search-field";

/**
 * R25: a control's border is 3:1 against its background. The v1 `input` and
 * `border` tokens (and `separator`) are hairlines at ~1.2-1.5:1, fine for list
 * separators but not for the edge of something you type into or press.
 */
describe("control borders", () => {
  it("Input uses the control-border token", () => {
    render(<Input accessibilityLabel="Name" />);
    expect(screen.getByLabelText("Name").props.className).toContain("border-control-border");
  });

  it("SearchField has a control-border edge", () => {
    render(<SearchField value="" onChangeText={() => {}} placeholder="Search students" />);
    expect(screen.getByTestId("search-field").props.className).toContain("border-control-border");
  });

  it("SearchField's edge turns to the focus ring while focused (R26)", () => {
    render(<SearchField value="" onChangeText={() => {}} placeholder="Search students" />);
    fireEvent(screen.getByLabelText("Search students"), "focus");
    expect(screen.getByTestId("search-field").props.className).toContain("border-ring");
    fireEvent(screen.getByLabelText("Search students"), "blur");
    expect(screen.getByTestId("search-field").props.className).not.toContain("border-ring");
  });

  // R26: every text-entry control shows the focus ring while focused.
  it.each(["input", "textarea", "combobox", "rich-text-editor", "search-field"])("%s.tsx marks focus with border-ring", (name) => {
    const source = readFileSync(path.resolve(__dirname, `../design/ui/${name}.tsx`), "utf8");
    expect(source).toMatch(/(focus:border-ring|&& "border-ring")/);
  });

  const CONTROLS = ["input", "textarea", "select", "combobox", "date-picker", "multi-select", "rich-text-editor", "checkbox"];
  it.each(CONTROLS)("%s.tsx draws no low-contrast border-input edge", (name) => {
    const source = readFileSync(path.resolve(__dirname, `../design/ui/${name}.tsx`), "utf8");
    expect(source).not.toMatch(/\bborder-input\b/);
    expect(source).toMatch(/\bborder-control-border\b/);
  });
});
