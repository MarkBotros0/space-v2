import { apiErrorMessage } from "../lib/api-error";

describe("apiErrorMessage", () => {
  it("returns the envelope's message from an axios error", () => {
    const err = Object.assign(new Error("409"), {
      isAxiosError: true,
      response: { status: 409, data: { error: { code: "code_taken", message: "A season with that code already exists." } } },
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
