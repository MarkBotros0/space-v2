import { apiErrorMessage, apiErrorStatus, isNetworkError } from "../lib/api-error";

describe("apiErrorMessage", () => {
  it("returns the envelope's message from an axios error", () => {
    const err = Object.assign(new Error("409"), {
      isAxiosError: true,
      response: {
        status: 409,
        data: { error: { code: "code_taken", message: "A season with that code already exists." } },
      },
    });
    expect(apiErrorMessage(err, "fallback")).toBe("A season with that code already exists.");
  });

  it("falls back for a network error or a body that is not the envelope", () => {
    const network = Object.assign(new Error("Network Error"), { isAxiosError: true, response: undefined });
    expect(apiErrorMessage(network, "Couldn't save.")).toBe("Couldn't save.");
    const html = Object.assign(new Error("502"), { isAxiosError: true, response: { status: 502, data: "<html>" } });
    expect(apiErrorMessage(html, "Couldn't save.")).toBe("Couldn't save.");
    expect(apiErrorMessage(new Error("boom"), "Couldn't save.")).toBe("Couldn't save.");
  });
});

describe("apiErrorStatus and isNetworkError", () => {
  const network = Object.assign(new Error("Network Error"), { isAxiosError: true, response: undefined });
  const conflict = Object.assign(new Error("409"), { isAxiosError: true, response: { status: 409, data: {} } });

  it("reads the status of an answered request", () => {
    expect(apiErrorStatus(conflict)).toBe(409);
    expect(isNetworkError(conflict)).toBe(false);
  });

  it("has no status for a request that got no answer, or for an error that wasn't a request", () => {
    expect(apiErrorStatus(network)).toBeUndefined();
    expect(isNetworkError(network)).toBe(true);
    expect(apiErrorStatus(new Error("boom"))).toBeUndefined();
    expect(isNetworkError(new Error("boom"))).toBe(false);
  });
});
