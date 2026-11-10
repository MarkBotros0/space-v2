import { followUpCutoff, REMINDER_HOUR } from "../lib/follow-ups";

describe("followUpCutoff", () => {
  it("waits for 9:00 on the due day", () => {
    expect(REMINDER_HOUR).toBe("09:00");
    expect(followUpCutoff(new Date("2026-11-12T05:00:00Z")).toISOString()).toBe("2026-11-11T22:00:00.000Z"); // 07:00 Cairo -> midnight
    expect(followUpCutoff(new Date("2026-11-12T07:05:00Z")).toISOString()).toBe("2026-11-12T07:05:00.000Z"); // 09:05 Cairo -> now
  });
});
