import {
  clockOffsetMs,
  formatRemaining,
  minutesLeftLabel,
  nextWindowChangeMs,
  remainingMs,
  startWindowState,
} from "../screens/quiz-detail/countdown";

const SERVER_NOW = "2026-11-14T10:00:00.000Z";
const DEADLINE = "2026-11-14T10:20:00.000Z";
const serverMs = Date.parse(SERVER_NOW);

describe("quiz countdown", () => {
  it("countdown corrects for a skewed clock (Review Focus 5)", () => {
    // The same response read on a right phone and on one five minutes fast.
    const right = clockOffsetMs(SERVER_NOW, serverMs);
    const fast = clockOffsetMs(SERVER_NOW, serverMs + 5 * 60_000);
    expect(right).toBe(0);
    expect(fast).toBe(-5 * 60_000);

    // A minute later on each phone's own clock, both show the same time left.
    const later = 60_000;
    expect(remainingMs(DEADLINE, right, serverMs + later)).toBe(19 * 60_000);
    expect(remainingMs(DEADLINE, fast, serverMs + 5 * 60_000 + later)).toBe(19 * 60_000);
  });

  it("never goes below zero", () => {
    expect(remainingMs(DEADLINE, 0, serverMs + 30 * 60_000)).toBe(0);
  });

  it("formatRemaining is m:ss, rounding up so 0:00 only shows at the end", () => {
    expect(formatRemaining(19 * 60_000 + 5_000)).toBe("19:05");
    expect(formatRemaining(42_000)).toBe("0:42");
    expect(formatRemaining(41_200)).toBe("0:42");
    expect(formatRemaining(0)).toBe("0:00");
    expect(formatRemaining(20 * 60_000)).toBe("20:00");
    // A limit over an hour reads as hours.
    expect(formatRemaining(125 * 60_000)).toBe("2:05:00");
  });

  it("announces whole minutes, not seconds", () => {
    expect(minutesLeftLabel(19 * 60_000 + 5_000)).toBe("20 minutes left");
    expect(minutesLeftLabel(19 * 60_000 + 59_000)).toBe("20 minutes left");
    expect(minutesLeftLabel(60_000)).toBe("1 minute left");
    expect(minutesLeftLabel(59_000)).toBe("Less than a minute left");
  });
});

describe("quiz start window", () => {
  const from = "2026-11-14T10:00:00.000Z";
  const until = "2026-11-14T10:30:00.000Z";
  const at = (iso: string, delta = 0) => Date.parse(iso) + delta;

  it("is open with no window", () => {
    expect(startWindowState({ startsFrom: null, startsUntil: null }, serverMs)).toEqual({ kind: "open" });
  });

  it("is not open yet before startsFrom, open at it, open at startsUntil, closed after", () => {
    const w = { startsFrom: from, startsUntil: until };
    expect(startWindowState(w, at(from, -1000))).toEqual({ kind: "not_yet", at: from });
    expect(startWindowState(w, at(from))).toEqual({ kind: "open" });
    expect(startWindowState(w, at(until))).toEqual({ kind: "open" });
    expect(startWindowState(w, at(until, 1))).toEqual({ kind: "closed", at: until });
  });

  it("names when the state next changes, so the card can re-render then", () => {
    const w = { startsFrom: from, startsUntil: until };
    expect(nextWindowChangeMs(w, at(from, -1000))).toBe(at(from));
    expect(nextWindowChangeMs(w, at(from))).toBe(at(until, 1));
    expect(nextWindowChangeMs(w, at(until, 1))).toBeNull();
    expect(nextWindowChangeMs({ startsFrom: null, startsUntil: null }, serverMs)).toBeNull();
  });
});
