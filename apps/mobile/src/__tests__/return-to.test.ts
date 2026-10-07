import { returnHrefFor } from "../lib/return-to";

describe("returnHrefFor (no open redirect — Decision 7)", () => {
  it("rebuilds a check-in link as a typed route", () => {
    expect(returnHrefFor("/checkin/AbC123XyZ0")).toEqual({
      pathname: "/checkin/[token]",
      params: { token: "AbC123XyZ0" },
    });
  });

  it("refuses everything else", () => {
    for (const raw of [undefined, "", "/dashboard", "https://evil.example/checkin/AbC123XyZ0", "/checkin/short", "//evil.example", ["/checkin/AbC123XyZ0"]]) {
      expect(returnHrefFor(raw)).toBeNull();
    }
  });
});
