import { render, screen } from "@testing-library/react-native";
import {
  attendanceStatusSchema,
  enrollmentStatusSchema,
  quizAttemptStatusSchema,
  seasonStatusSchema,
  submissionStatusSchema,
  userStatusSchema,
} from "@space/shared";

import { setReducedMotionForTests } from "../design/motion";
import { dueChip, StatusChip, statusChip } from "../design/ui/status-chip";

const TONES = ["ok", "warn", "bad", "info", "neutral"];

const SCHEMAS = [
  ["season", seasonStatusSchema],
  ["enrollment", enrollmentStatusSchema],
  ["attendance", attendanceStatusSchema],
  ["submission", submissionStatusSchema],
  ["quizAttempt", quizAttemptStatusSchema],
  ["user", userStatusSchema],
] as const;

describe("statusChip vocabulary", () => {
  for (const [kind, schema] of SCHEMAS) {
    it(`maps every ${kind} value to a tone and a label`, () => {
      for (const value of schema.options) {
        const chip = statusChip(kind, value);
        expect(TONES).toContain(chip.tone);
        expect(chip.label.length).toBeGreaterThan(0);
      }
    });
  }

  it("uses the specified tones and labels", () => {
    expect(statusChip("season", "DRAFT")).toEqual({ tone: "neutral", label: "Draft" });
    expect(statusChip("season", "ACTIVE")).toEqual({ tone: "ok", label: "Active" });
    expect(statusChip("season", "COMPLETED")).toEqual({ tone: "info", label: "Completed" });
    expect(statusChip("season", "ARCHIVED")).toEqual({ tone: "neutral", label: "Archived" });
    expect(statusChip("enrollment", "WITHDRAWN")).toEqual({ tone: "bad", label: "Dropped" });
    expect(statusChip("attendance", "LATE").tone).toBe("warn");
    expect(statusChip("attendance", "ABSENT").tone).toBe("bad");
    expect(statusChip("submission", "RETURNED").tone).toBe("warn");
    expect(statusChip("quizAttempt", "IN_PROGRESS")).toEqual({ tone: "warn", label: "In progress" });
    expect(statusChip("user", "invited").tone).toBe("info");
    expect(statusChip("user", "inactive").tone).toBe("neutral");
  });
});

describe("dueChip", () => {
  const now = new Date(2026, 10, 4, 12, 0, 0); // Wed 4 Nov 2026, local

  it("is overdue one minute past due", () => {
    expect(dueChip(new Date(now.getTime() - 60_000), now)).toEqual({ tone: "bad", label: "Overdue" });
  });
  it("is due today later the same day", () => {
    expect(dueChip(new Date(2026, 10, 4, 23, 0), now)).toEqual({ tone: "warn", label: "Due today" });
  });
  it("counts calendar days up to two", () => {
    expect(dueChip(new Date(2026, 10, 5, 8, 0), now)).toEqual({ tone: "warn", label: "Due in 1 day" });
    expect(dueChip(new Date(2026, 10, 6, 23, 59), now)).toEqual({ tone: "warn", label: "Due in 2 days" });
  });
  it("names the weekday from three days out", () => {
    expect(dueChip(new Date(2026, 10, 7, 9, 0), now)).toEqual({ tone: "neutral", label: "Due Saturday" });
    expect(dueChip(new Date(2026, 10, 6, 9, 0), now).label).toBe("Due in 2 days");
  });
});

describe("StatusChip", () => {
  afterEach(() => setReducedMotionForTests(null));

  it("exposes its label as the accessibility label and uses tone classes", () => {
    render(<StatusChip tone="ok" label="Active" />);
    const chip = screen.getByLabelText("Active");
    expect(chip.props.className).toContain("bg-ok-soft");
    expect(chip.props.className).toContain("shrink-0");
    const text = screen.getByText("Active");
    expect(text.props.className).toContain("text-ok");
    expect(text.props.maxFontSizeMultiplier).toBe(1.3);
  });

  it("uses the neutral text token and re-renders on label change, also when reduced", () => {
    setReducedMotionForTests(true);
    const { rerender } = render(<StatusChip tone="neutral" label="Draft" />);
    expect(screen.getByText("Draft").props.className).toContain("text-neutral-strong");
    rerender(<StatusChip tone="neutral" label="Archived" />);
    expect(screen.getByLabelText("Archived")).toBeTruthy();
    expect(screen.queryByText("Draft")).toBeNull();
  });
});
