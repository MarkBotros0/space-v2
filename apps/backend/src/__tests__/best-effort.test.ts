import { bestEffort } from "../lib/best-effort";

describe("bestEffort", () => {
  it("never rejects into its caller", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      bestEffort("test-label", () => Promise.reject(new Error("transport down"))),
    ).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it("always logs the failure — v1's email failures were invisible (R21)", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await bestEffort("notify:SUBMISSION_REVIEWED", () => Promise.reject(new Error("boom")));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0]?.[0])).toContain("notify:SUBMISSION_REVIEWED");
    spy.mockRestore();
  });

  it("awaits a successful effect and logs nothing", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const fn = jest.fn().mockResolvedValue(undefined);
    await bestEffort("ok", fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
