import { render, screen } from "@testing-library/react-native";

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

  it("tiles share the row equally, pressable or not", () => {
    render(
      <>
        <StatCard label="Students" value="3" onPress={() => {}} />
        <StatCard label="Progress" value="40%" sublabel="Session 2/5" />
      </>,
    );
    const pressable = screen.getByLabelText("Students: 3").props.className as string;
    const plain = screen.getByLabelText("Progress: 40%").props.className as string;
    for (const c of [pressable, plain]) {
      expect(c.split(" ")).toEqual(expect.arrayContaining(["flex-1", "basis-0"]));
    }
  });
});
