import { textDirection } from "../design/lib/text-direction";

describe("textDirection", () => {
  it.each([
    ["اختر الإجابة", "rtl"],
    ["John 3:16", "ltr"],
    ["آية ٣ John", "rtl"],
    ["3:16 يوحنا", "rtl"],
    ["", "ltr"],
    ["١٢٣", "ltr"],
    ["שלום", "rtl"],
    ["  (1) hello", "ltr"],
  ] as const)("%s is %s", (text, dir) => {
    expect(textDirection(text)).toBe(dir);
  });
});
