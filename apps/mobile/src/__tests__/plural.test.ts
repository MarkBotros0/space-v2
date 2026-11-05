import { countOf } from "../lib/plural";

it("pluralises and keeps the count with its noun", () => {
  expect(countOf(1, "leader")).toBe("1 leader");
  expect(countOf(0, "leader")).toBe("0 leaders");
  expect(countOf(2, "leader")).toBe("2 leaders");
});
