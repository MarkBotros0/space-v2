import { authErrorMessage } from "../lib/auth-error";

function axiosError(status: number | null, data?: unknown) {
  return Object.assign(new Error(status ? String(status) : "Network Error"), {
    isAxiosError: true,
    response: status ? { status, data } : undefined,
  });
}
const envelope = (code: string, message: string) => ({ error: { code, message } });
const BAD = "Invalid email or password.";

describe("authErrorMessage", () => {
  it("says it can't reach the server when there is no response", () => {
    expect(authErrorMessage(axiosError(null), BAD)).toBe("Can't reach JPC Space. Check your connection and try again.");
  });

  it("uses the caller's copy for a 401", () => {
    expect(authErrorMessage(axiosError(401, envelope("invalid_credentials", "x")), BAD)).toBe(BAD);
  });

  it("shows the server's words for a 429", () => {
    const msg = "Too many attempts. Try again later.";
    expect(authErrorMessage(axiosError(429, envelope("too_many_requests", msg)), BAD)).toBe(msg);
  });

  it("shows the server's words for another 4xx with an envelope", () => {
    const msg = "This reset code is invalid or has expired.";
    expect(authErrorMessage(axiosError(400, envelope("invalid_reset_token", msg)), BAD)).toBe(msg);
  });

  it("falls back to 'our side' for a 4xx without an envelope", () => {
    expect(authErrorMessage(axiosError(400, "<html>"), BAD)).toBe(
      "Something went wrong on our side. Try again in a moment.",
    );
  });

  it("says it is on our side for a 5xx, even with an envelope", () => {
    expect(authErrorMessage(axiosError(500, envelope("internal_error", "boom")), BAD)).toBe(
      "Something went wrong on our side. Try again in a moment.",
    );
  });

  it("treats a non-axios error (e.g. a schema parse failure) as our side", () => {
    expect(authErrorMessage(new Error("parse"), BAD)).toBe("Something went wrong on our side. Try again in a moment.");
  });
});
