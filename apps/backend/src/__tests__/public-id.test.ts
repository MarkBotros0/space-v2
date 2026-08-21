import { newPublicId } from "../lib/public-id";

describe("newPublicId", () => {
  it("returns 10 characters from the URL-safe alphabet", () => {
    for (let i = 0; i < 200; i++) {
      expect(newPublicId()).toMatch(/^[0-9A-Za-z]{10}$/);
    }
  });

  it("does not repeat across many draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(newPublicId());
    expect(seen.size).toBe(5000);
  });
});
