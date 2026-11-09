import { isAlumnusNotStudying } from "../index";

describe("isAlumnusNotStudying", () => {
  it.each([
    ["an alumnus between seasons", { role: "STUDENT", graduationYear: 2024, activeSeasonId: null }, true],
    ["an alumnus studying in a season", { role: "STUDENT", graduationYear: 2024, activeSeasonId: 3 }, false],
    ["a student", { role: "STUDENT", graduationYear: null, activeSeasonId: 3 }, false],
    ["a mentor with a year", { role: "MENTOR", graduationYear: 2024, activeSeasonId: null }, false],
  ] as const)("%s: %s", (_label, audience, expected) => {
    expect(isAlumnusNotStudying(audience)).toBe(expected);
  });
});
