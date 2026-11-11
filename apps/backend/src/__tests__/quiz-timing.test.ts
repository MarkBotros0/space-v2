import { canStartNow, deadlineFor, isExpired, SAVE_GRACE_MS } from "../lib/quizzes/timing";

const at = (iso: string) => new Date(iso);
const window = { startsFrom: at("2026-11-10T18:00:00.000Z"), startsUntil: at("2026-11-10T18:30:00.000Z") };

describe("canStartNow", () => {
  it("refuses before the window opens", () => {
    expect(canStartNow(window, at("2026-11-10T17:59:59.999Z"))).toBe("not_yet");
  });

  it("allows the instant the window opens", () => {
    expect(canStartNow(window, at("2026-11-10T18:00:00.000Z"))).toBe("ok");
  });

  it("allows the instant the window closes (startsUntil inclusive)", () => {
    expect(canStartNow(window, at("2026-11-10T18:30:00.000Z"))).toBe("ok");
  });

  it("refuses one second after the window closes", () => {
    expect(canStartNow(window, at("2026-11-10T18:30:01.000Z"))).toBe("closed");
  });

  it("allows any time with no window, and either open end alone", () => {
    const now = at("2026-11-10T12:00:00.000Z");
    expect(canStartNow({ startsFrom: null, startsUntil: null }, now)).toBe("ok");
    expect(canStartNow({ startsFrom: null, startsUntil: window.startsUntil }, now)).toBe("ok");
    expect(canStartNow({ startsFrom: window.startsFrom, startsUntil: null }, now)).toBe("not_yet");
    expect(canStartNow({ startsFrom: null, startsUntil: at("2026-11-10T11:00:00.000Z") }, now)).toBe("closed");
  });
});

describe("deadlineFor", () => {
  it("is the start plus the limit", () => {
    expect(deadlineFor(at("2026-11-10T18:25:00.000Z"), 20)).toEqual(at("2026-11-10T18:45:00.000Z"));
  });

  it("is null for an untimed quiz", () => {
    expect(deadlineFor(at("2026-11-10T18:25:00.000Z"), null)).toBeNull();
  });
});

describe("isExpired", () => {
  const deadline = at("2026-11-10T18:45:00.000Z");

  it("is never true without a deadline", () => {
    expect(isExpired(null, at("2099-01-01T00:00:00.000Z"))).toBe(false);
  });

  it("is false at the deadline and true just after, with no grace", () => {
    expect(isExpired(deadline, deadline)).toBe(false);
    expect(isExpired(deadline, at("2026-11-10T18:45:00.001Z"))).toBe(true);
  });

  it("holds off for the grace: 5 s late is not expired, 15 s late is", () => {
    expect(SAVE_GRACE_MS).toBe(10_000);
    expect(isExpired(deadline, at("2026-11-10T18:45:05.000Z"), SAVE_GRACE_MS)).toBe(false);
    expect(isExpired(deadline, at("2026-11-10T18:45:10.000Z"), SAVE_GRACE_MS)).toBe(false);
    expect(isExpired(deadline, at("2026-11-10T18:45:15.000Z"), SAVE_GRACE_MS)).toBe(true);
  });
});
