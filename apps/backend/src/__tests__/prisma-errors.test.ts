import { isUniqueViolation } from "../lib/prisma-errors";

it("recognises P2002 and nothing else", () => {
  expect(isUniqueViolation({ code: "P2002" })).toBe(true);
  expect(isUniqueViolation({ code: "P2003" })).toBe(false);
  expect(isUniqueViolation(new Error("boom"))).toBe(false);
  expect(isUniqueViolation(null)).toBe(false);
});
