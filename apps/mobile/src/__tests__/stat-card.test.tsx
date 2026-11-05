import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { StatCard, statLabelLines } from "../design/students/stat-card";

describe("StatCard label (dashboard stat rows)", () => {
  it("label and sublabel are one text in one style, split into balanced lines at word boundaries", () => {
    expect(statLabelLines("Absence budget left", "this season")).toEqual([
      "Absence budget",
      "left this season",
    ]);
    expect(statLabelLines("Assignments", "pending")).toEqual(["Assignments", "pending"]);
    expect(statLabelLines("Progress", "Session 3/10")).toEqual(["Progress", "Session 3/10"]);
    expect(statLabelLines("Streak")).toEqual(["Streak"]);
  });

  it("each line shrinks to fit instead of wrapping, so a word never breaks mid-word", () => {
    render(<StatCard label="Quizzes" value="2" sublabel="pending" />);
    const label = screen.getByText("Quizzes\npending", { includeHiddenElements: true });
    // Exactly as many lines as the text holds: a wrapped (or split) word would need
    // one more, so the label shrinks instead.
    expect(label.props).toMatchObject({
      numberOfLines: 2,
      adjustsFontSizeToFit: true,
      minimumFontScale: 0.6,
      maxFontSizeMultiplier: 1.15,
    });
    expect(screen.queryByText("pending", { includeHiddenElements: true })).toBeNull();
  });

  it("tiles share the row equally, pressable or not: one unpadded cell each", () => {
    render(
      <>
        <StatCard label="Students" value="3" onPress={() => {}} />
        <StatCard label="Progress" value="40%" sublabel="Session 2/5" />
        <StatCard label="Quizzes" value="1" sublabel="pending" onPress={() => {}} />
      </>,
    );
    const cells = screen.getAllByTestId("stat-card");
    expect(cells).toHaveLength(3);
    for (const cell of cells) {
      expect(StyleSheet.flatten(cell.props.style)).toEqual({
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: 0,
        minWidth: 0,
      });
      // The padding (p-4) is on the look inside, never on the cell, so no tile's basis grows by it.
      expect(String(cell.props.className ?? "")).not.toMatch(/\bp-/);
    }
    // The look fills the cell the same way in both kinds.
    for (const name of ["Students: 3", "Progress: 40%"]) {
      const el = screen.getByLabelText(name);
      const look = (el.props.className as string | undefined) ?? "";
      const inner = look.includes("p-4")
        ? look
        : (el.findAll(
            (n) => typeof n.props.className === "string" && n.props.className.includes("p-4"),
          )[0]?.props.className as string);
      expect(inner.split(" ")).toEqual(expect.arrayContaining(["flex-1", "p-4"]));
    }
  });
});
