import { useState } from "react";
import { Pressable, Text } from "react-native";
import { fireEvent, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import type { MyAttendanceSession } from "@space/shared";

import { setReducedMotionForTests } from "../design/motion";
import { attendanceTally } from "../lib/check-in-result";
import { renderWithProviders } from "./helpers/render";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(() => Promise.reject(new Error("not served"))) },
}));
jest.mock("expo-camera", () => require("./helpers/expo-camera"));
jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void | (() => void)) => require("react").useEffect(effect, [effect]),
}));
const mockHaptic = jest.fn();
jest.mock("../design/motion/haptics", () => ({ haptic: (k: string) => mockHaptic(k) }));

import { CheckInSuccess } from "../components/check-in/check-in-success";
import { StudentCheckInCard } from "../components/check-in/StudentCheckInCard";

beforeEach(() => {
  mockHaptic.mockClear();
  setReducedMotionForTests(true);
});
afterAll(() => setReducedMotionForTests(null));

const row = (status: MyAttendanceSession["status"]): MyAttendanceSession => ({
  sessionId: 1,
  title: "S",
  startsAt: "2099-01-01T10:00:00.000Z",
  dayKey: "2099-01-01",
  startTime: "10:00",
  status,
  checkedInAt: null,
  lateMinutes: null,
  costMinutes: null,
});

describe("attendanceTally", () => {
  it("counts marked sessions, LATE as attended, and ignores unmarked rows", () => {
    expect(attendanceTally([row("PRESENT"), row("LATE"), row("ABSENT"), row(null), row("PRESENT")])).toEqual({
      attended: 3,
      total: 4,
    });
  });
  it("is null when nothing is marked", () => {
    expect(attendanceTally([])).toBeNull();
    expect(attendanceTally([row(null)])).toBeNull();
  });
});

describe("CheckInSuccess", () => {
  const present = { kind: "checked_in", status: "PRESENT", minutesLate: 0 } as const;

  it("shows the final state at once under reduced motion, with one success haptic", () => {
    renderWithProviders(<CheckInSuccess outcome={present} attendance={{ attended: 3, total: 4 }} />);
    expect(screen.getByText("You're checked in!")).toBeTruthy();
    expect(screen.getByText("Season attendance · 3 of 4 sessions")).toBeTruthy();
    expect(screen.getByLabelText("75 percent")).toBeTruthy();
    expect(mockHaptic).toHaveBeenCalledTimes(1);
    expect(mockHaptic).toHaveBeenCalledWith("success");
  });

  it("fires the haptic once even across re-renders", () => {
    function Harness() {
      const [n, setN] = useState(0);
      return (
        <>
          <Pressable onPress={() => setN(n + 1)}>
            <Text>{`again ${n}`}</Text>
          </Pressable>
          <CheckInSuccess outcome={present} attendance={null} />
        </>
      );
    }
    renderWithProviders(<Harness />);
    fireEvent.press(screen.getByText("again 0"));
    expect(screen.getByText("again 1")).toBeTruthy();
    expect(mockHaptic).toHaveBeenCalledTimes(1);
  });

  it("tells a screen reader the outcome once, whatever the motion setting", () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    announce.mockClear();
    const view = renderWithProviders(<CheckInSuccess outcome={present} attendance={null} />);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("You're checked in!");
    view.unmount();

    announce.mockClear();
    setReducedMotionForTests(false);
    renderWithProviders(
      <CheckInSuccess outcome={{ kind: "checked_in", status: "LATE", minutesLate: 12 }} attendance={null} />,
    );
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("Checked in — late 12 minutes after session start.");
    setReducedMotionForTests(true);
    announce.mockRestore();
  });

  it("a late check-in reads the late copy in the warn tone", () => {
    renderWithProviders(
      <CheckInSuccess outcome={{ kind: "checked_in", status: "LATE", minutesLate: 12 }} attendance={null} />,
    );
    expect(screen.getByText("Checked in — late")).toBeTruthy();
    expect(screen.getByText("12 minutes after session start.")).toBeTruthy();
    expect(screen.getByTestId("check-in-disc").props.className).toContain("bg-warn-soft");
  });

  it("an on-time check-in uses the ok tone", () => {
    renderWithProviders(<CheckInSuccess outcome={present} attendance={null} />);
    expect(screen.getByTestId("check-in-disc").props.className).toContain("bg-ok-soft");
  });

  it("hides the ring and caption when there is no attendance, without error", () => {
    renderWithProviders(<CheckInSuccess outcome={present} attendance={null} />);
    expect(screen.queryByText(/Season attendance/)).toBeNull();
    expect(screen.queryByLabelText(/percent/)).toBeNull();
  });

  it("draws the check when motion is allowed, and still shows the title", () => {
    setReducedMotionForTests(false);
    renderWithProviders(<CheckInSuccess outcome={present} attendance={{ attended: 1, total: 1 }} />);
    expect(screen.getByText("You're checked in!")).toBeTruthy();
    expect(mockHaptic).toHaveBeenCalledTimes(1);
  });

  it("Done calls onDone when given", () => {
    const onDone = jest.fn();
    renderWithProviders(<CheckInSuccess outcome={present} attendance={null} onDone={onDone} />);
    fireEvent.press(screen.getByText("Done"));
    expect(onDone).toHaveBeenCalled();
  });
});

describe("StudentCheckInCard on the hero", () => {
  it("uses the onHero button, and draws nothing while check-in is closed", () => {
    const detail = {
      id: 1,
      title: "W",
      description: null,
      startsAt: "2099-03-15T18:00:00.000Z",
      dayKey: "2099-03-15",
      startTime: "20:00",
      durationMinutes: 90,
      location: null,
      youtubeUrl: null,
      recurrenceGroupId: null,
      seasonId: 7,
      seasonCode: "s7",
      seasonTitle: "S",
      checkInOpen: false,
      myAttendance: null,
      canMarkAttendance: false,
      canManageCheckIn: false,
    };
    const closed = renderWithProviders(<StudentCheckInCard detail={detail} onHero />);
    expect(screen.queryByText("Check In")).toBeNull();
    expect(screen.queryByText("Check-in isn't open right now")).toBeNull();
    closed.unmount();
    renderWithProviders(<StudentCheckInCard detail={{ ...detail, checkInOpen: true }} onHero />);
    expect(screen.getByRole("button", { name: "Check In" }).props.accessibilityState?.disabled).toBeFalsy();
  });
});
