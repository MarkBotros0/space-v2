import type { AppStateStatus } from "react-native";

import {
  exitEvent,
  exitTransition,
  isAttemptClosed,
  isMultiWindow,
  mountExit,
  newEventId,
  serverIso,
  trackedState,
} from "../screens/quiz-detail/lock/exit-model";

/** Walks a run of AppState changes the way the lock hook does; the signals it saw. */
function walk(states: AppStateStatus[]) {
  const signals: string[] = [];
  let prev = states[0] as AppStateStatus;
  for (const next of states.slice(1)) {
    const signal = exitTransition(prev, next);
    if (signal) signals.push(signal);
    prev = trackedState(prev, next);
  }
  return signals;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("quiz exit model", () => {
  it.each([
    [["active", "inactive", "active"], []],
    [
      ["active", "background", "active"],
      ["left", "returned"],
    ],
    [
      ["active", "inactive", "background", "active"],
      ["left", "returned"],
    ],
    [
      ["active", "background", "inactive", "active"],
      ["left", "returned"],
    ],
    [
      ["active", "background", "background", "active"],
      ["left", "returned"],
    ],
    [["background", "active"], ["returned"]],
  ] as [AppStateStatus[], string[]][])("exitTransition %j gives %j", (states, signals) => {
    expect(walk(states)).toEqual(signals);
  });

  it("inactive alone is never an exit", () => {
    expect(exitTransition("active", "inactive")).toBeNull();
    expect(exitTransition("inactive", "active")).toBeNull();
  });

  it("isMultiWindow is a window under 85% of the screen's height", () => {
    expect(isMultiWindow({ height: 800 }, { height: 800 })).toBe(false);
    expect(isMultiWindow({ height: 690 }, { height: 800 })).toBe(false);
    expect(isMultiWindow({ height: 679 }, { height: 800 })).toBe(true);
    expect(isMultiWindow({ height: 400 }, { height: 800 })).toBe(true);
  });

  it("times are read on the server's clock", () => {
    const now = Date.parse("2026-11-14T10:00:00.000Z");
    expect(serverIso(90_000, now)).toBe("2026-11-14T10:01:30.000Z");
    expect(serverIso(-60_000, now)).toBe("2026-11-14T09:59:00.000Z");
  });

  it("an event has a fresh v4 id and never comes back before it left", () => {
    const a = newEventId();
    expect(a).toMatch(UUID);
    expect(newEventId()).not.toBe(a);
    const e = exitEvent("EXIT", "2026-11-14T10:00:05.000Z", "2026-11-14T10:00:01.000Z");
    expect(e).toMatchObject({
      kind: "EXIT",
      leftAt: "2026-11-14T10:00:05.000Z",
      returnedAt: "2026-11-14T10:00:05.000Z",
    });
    expect(e.clientEventId).toMatch(UUID);
    expect(exitEvent("SCREENSHOT", "2026-11-14T10:00:05.000Z", null).returnedAt).toBeNull();
  });

  it("the attempt is closed when this report ended it or it was already shut", () => {
    expect(isAttemptClosed({ exits: 3, ended: true, status: "SUBMITTED" })).toBe(true);
    expect(isAttemptClosed({ exits: 3, ended: false, status: "SUBMITTED" })).toBe(true);
    expect(isAttemptClosed({ exits: 1, ended: false, status: "IN_PROGRESS" })).toBe(false);
  });

  it("mountExit: a left marker with no return, or a cold start with the attempt open, is one exit", () => {
    const left = "2026-11-14T10:00:00.000Z";
    expect(mountExit({ pendingLeftAt: left, wasOpen: true, coldStart: true })).toEqual({
      kind: "RELAUNCH",
      leftAt: left,
    });
    expect(mountExit({ pendingLeftAt: left, wasOpen: true, coldStart: false })).toEqual({ kind: "EXIT", leftAt: left });
    expect(mountExit({ pendingLeftAt: null, wasOpen: true, coldStart: true })).toEqual({
      kind: "RELAUNCH",
      leftAt: null,
    });
    expect(mountExit({ pendingLeftAt: null, wasOpen: true, coldStart: false })).toBeNull();
    expect(mountExit({ pendingLeftAt: null, wasOpen: false, coldStart: true })).toBeNull();
  });
});
