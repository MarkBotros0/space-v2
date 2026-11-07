import { render, screen } from "@testing-library/react-native";
import { Animated } from "react-native";

import { setReducedMotionForTests } from "../design/motion";
import { Badge, Modal, ModalContent, ModalTitle } from "../design/ui";
import { StatusChip } from "../design/ui/status-chip";

const TONE_BG = { ok: "bg-ok-soft", warn: "bg-warn-soft", bad: "bg-bad-soft", info: "bg-info-soft", neutral: "bg-neutral-soft" };

describe("Badge draws as a StatusChip", () => {
  it.each([
    ["default", "neutral"],
    ["outline", "neutral"],
    ["secondary", "info"],
    ["info", "info"],
    ["teal", "info"],
    ["success", "ok"],
    ["warning", "warn"],
    ["error", "bad"],
  ] as const)("variant %s maps to the %s tone", (variant, tone) => {
    render(<Badge variant={variant}>Label</Badge>);
    const chip = screen.getByLabelText("Label");
    expect(chip.props.className).toContain(TONE_BG[tone]);
  });

  it("a plain-text badge renders exactly the StatusChip, with its self-start reset", () => {
    const { UNSAFE_getByType } = render(<Badge variant="success">Done</Badge>);
    const chip = UNSAFE_getByType(StatusChip);
    expect(chip.props).toMatchObject({ tone: "ok", label: "Done" });
    expect(screen.getByLabelText("Done").props.className).toContain("self-auto");
    expect(screen.getByLabelText("Done").props.className).not.toContain("self-start");
  });

  it("a call site's self-start still wins", () => {
    render(<Badge className="self-start">Late</Badge>);
    expect(screen.getByLabelText("Late").props.className).toContain("self-start");
    expect(screen.getByLabelText("Late").props.className).not.toContain("self-auto");
  });

  it("a role badge keeps its role colour in the chip shape", () => {
    render(<Badge role="student">Student</Badge>);
    const label = screen.getByText("Student");
    expect(label.props.className).toContain("text-role-student-foreground");
  });
});

describe("Modal motion", () => {
  afterEach(() => {
    setReducedMotionForTests(null);
    jest.restoreAllMocks();
  });

  const open = () =>
    render(
      <Modal open onOpenChange={() => {}}>
        <ModalContent>
          <ModalTitle>Title</ModalTitle>
        </ModalContent>
      </Modal>,
    );

  it("slides up when motion is allowed", () => {
    setReducedMotionForTests(false);
    const timing = jest.spyOn(Animated, "timing");
    open();
    expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 0, duration: 320 }));
  });

  it("appears in place under reduced motion", () => {
    setReducedMotionForTests(true);
    const timing = jest.spyOn(Animated, "timing");
    open();
    expect(timing).not.toHaveBeenCalled();
    expect(screen.getByText("Title")).toBeTruthy();
  });
});
