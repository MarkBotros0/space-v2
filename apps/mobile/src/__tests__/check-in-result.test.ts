import { checkInCopy, checkInRefusalCode } from "../lib/check-in-result";

const axiosError = (status: number, data: unknown) =>
  Object.assign(new Error(String(status)), { isAxiosError: true, response: { status, data } });

describe("checkInRefusalCode", () => {
  it("reads the server's code from the error envelope (spec 04 R59)", () => {
    expect(checkInRefusalCode(axiosError(409, { error: { code: "closed", message: "Check-in has closed." } }))).toBe("closed");
    expect(checkInRefusalCode(axiosError(404, { error: { code: "invalid_token", message: "x" } }))).toBe("invalid_token");
  });

  it("is 'unknown' for a network error, a non-envelope body, or a code it does not know", () => {
    expect(checkInRefusalCode(Object.assign(new Error("Network Error"), { isAxiosError: true }))).toBe("unknown");
    expect(checkInRefusalCode(axiosError(502, "<html>"))).toBe("unknown");
    expect(checkInRefusalCode(axiosError(400, { error: { code: "bad_request", message: "x" } }))).toBe("unknown");
    expect(checkInRefusalCode(new Error("boom"))).toBe("unknown");
  });
});

describe("checkInCopy", () => {
  it("says on-time and late differently, with the minutes after the session START (C3, spec 04 D15)", () => {
    expect(checkInCopy({ kind: "checked_in", status: "PRESENT", minutesLate: 0 })).toEqual({
      title: "You're checked in!",
      message: null,
    });
    expect(checkInCopy({ kind: "checked_in", status: "LATE", minutesLate: 1 }).message).toBe(
      "1 minute after session start.",
    );
    expect(checkInCopy({ kind: "checked_in", status: "LATE", minutesLate: 12 })).toEqual({
      title: "Checked in — late",
      message: "12 minutes after session start.",
    });
  });

  it("explains each refusal in v1's words", () => {
    expect(checkInCopy({ kind: "refused", code: "not_open" }).message).toBe(
      "Check-in hasn't been opened yet. Ask your leader to open it.",
    );
    expect(checkInCopy({ kind: "refused", code: "already_checked_in" }).title).toBe("Already checked in");
    expect(checkInCopy({ kind: "refused", code: "not_enrolled" }).message).toBe("You are not enrolled in this season.");
  });
});
