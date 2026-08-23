import { CHECK_IN_WINDOW_MS, checkInState, isCheckInOpen } from "../lib/check-in";

const OPENED = new Date("2099-03-01T18:00:00.000Z");
const within = new Date(OPENED.getTime() + CHECK_IN_WINDOW_MS - 1);
const past = new Date(OPENED.getTime() + CHECK_IN_WINDOW_MS + 1);

describe("checkInState", () => {
  it("is not_open until an admin opens it", () => {
    expect(checkInState({ checkInOpenAt: null, checkInClosedAt: null }, within)).toBe("not_open");
  });

  it("is open inside the window", () => {
    expect(checkInState({ checkInOpenAt: OPENED, checkInClosedAt: null }, within)).toBe("open");
  });

  it("expires exactly at the window boundary, not after it", () => {
    // The boundary is where a forgotten-open session stops being exploitable,
    // so it is pinned rather than left to a >= / > coin flip.
    const atBoundary = new Date(OPENED.getTime() + CHECK_IN_WINDOW_MS);
    expect(checkInState({ checkInOpenAt: OPENED, checkInClosedAt: null }, atBoundary)).toBe("open");
    expect(checkInState({ checkInOpenAt: OPENED, checkInClosedAt: null }, past)).toBe("expired");
  });

  it("reports an explicit close as closed even inside the window", () => {
    const closed = { checkInOpenAt: OPENED, checkInClosedAt: within };
    expect(checkInState(closed, within)).toBe("closed");
  });

  it("keeps closed distinct from expired so the reason survives", () => {
    expect(checkInState({ checkInOpenAt: OPENED, checkInClosedAt: null }, past)).toBe("expired");
    expect(checkInState({ checkInOpenAt: OPENED, checkInClosedAt: within }, past)).toBe("closed");
  });
});

describe("isCheckInOpen", () => {
  it("is true only for the open state", () => {
    expect(isCheckInOpen({ checkInOpenAt: OPENED, checkInClosedAt: null }, within)).toBe(true);
    expect(isCheckInOpen({ checkInOpenAt: OPENED, checkInClosedAt: null }, past)).toBe(false);
    expect(isCheckInOpen({ checkInOpenAt: null, checkInClosedAt: null }, within)).toBe(false);
    expect(isCheckInOpen({ checkInOpenAt: OPENED, checkInClosedAt: within }, within)).toBe(false);
  });
});
