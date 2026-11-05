import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));

import CalendarScreen from "../../app/(app)/(tabs)/calendar";
import { sessionChip } from "../design/sessions/session-chip";
import { dayCue } from "../lib/calendar-grid";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { session, studentSession } from "./helpers/calendar-fixtures";
import { renderWithProviders } from "./helpers/render";

const get = apiClient.get as jest.Mock;

// Only Date is faked: react-query and the renderer keep their real timers.
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({
    now: new Date(2099, 2, 1, 8, 0),
    doNotFake: [
      "nextTick", "setImmediate", "clearImmediate", "setInterval", "clearInterval",
      "setTimeout", "clearTimeout", "queueMicrotask", "requestAnimationFrame",
      "cancelAnimationFrame", "requestIdleCallback", "cancelIdleCallback", "performance", "hrtime",
    ],
  });
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});
afterEach(() => jest.useRealTimers());

describe("sessionChip: sessionBadge's words on the chip tones", () => {
  const s = { dayKey: "2099-03-07", attendanceMarked: false };
  it("counts an upcoming session in org days, the wording Today uses", () => {
    expect(sessionChip(s, "2099-03-01", false)).toEqual({ tone: "neutral", label: "in 6 days" });
    expect(sessionChip(s, "2099-03-01", false)?.label).toBe(dayCue(s.dayKey, "2099-03-01"));
  });
  it("says Today for today", () => {
    expect(sessionChip({ ...s, dayKey: "2099-03-01" }, "2099-03-01", false)).toEqual({
      tone: "info",
      label: "Today",
    });
  });
  it("gives a past session nothing to a student and its attendance to staff", () => {
    const past = { dayKey: "2099-02-20", attendanceMarked: false };
    expect(sessionChip(past, "2099-03-01", false)).toBeNull();
    expect(sessionChip(past, "2099-03-01", true)).toEqual({ tone: "warn", label: "Attendance pending" });
    expect(sessionChip({ ...past, attendanceMarked: true }, "2099-03-01", true)).toEqual({
      tone: "ok",
      label: "Attendance marked",
    });
  });
});

describe("calendar agenda rows", () => {
  function serve() {
    useSessionStore.setState(studentSession);
    get.mockResolvedValue({
      data: { data: { sessions: [session(1, "Kickoff", "2099-03-07T18:00:00.000Z", "2099-03-07")] } },
    });
  }

  it("shows the same 'in 6 days' as Today for the same org day, spoken with the row", async () => {
    serve();
    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("in 6 days")).toBeTruthy();
    expect(screen.getByLabelText(/Kickoff.*in 6 days/)).toBeTruthy();
    expect(screen.getByText("8:00 PM · 60 min")).toBeTruthy();
    expect(screen.getByText("SATURDAY, MARCH 7")).toBeTruthy();
  });

  it("opens /session/[id] from the row", async () => {
    serve();
    renderWithProviders(<CalendarScreen />);
    fireEvent.press(await screen.findByLabelText(/Kickoff/));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "1" } });
  });

  it("switches Upcoming / Week / Month on the segmented control", async () => {
    serve();
    renderWithProviders(<CalendarScreen />);
    await screen.findByText("Kickoff");
    expect(screen.getByTestId("segmented-control")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Month"));
    expect(screen.getByLabelText("Previous month")).toBeTruthy();
  });

  it("renders the grid's day numbers tabular and capped at font 1.3", async () => {
    serve();
    renderWithProviders(<CalendarScreen />);
    await screen.findByText("Kickoff");
    fireEvent.press(screen.getByLabelText("Month"));
    const day = screen.getAllByText("15")[0]!;
    expect(day.props.maxFontSizeMultiplier).toBe(1.3);
    expect(day).toHaveStyle({ fontVariant: ["tabular-nums"] });
  });
});
