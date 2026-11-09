import { API_ERROR_CODES } from "../api-error";

describe("API_ERROR_CODES", () => {
  it("is sorted, unique and snake_case", () => {
    expect([...API_ERROR_CODES]).toEqual([...new Set(API_ERROR_CODES)].sort());
    for (const code of API_ERROR_CODES) expect(code).toMatch(/^[a-z]+(_[a-z]+)*$/);
  });
});
