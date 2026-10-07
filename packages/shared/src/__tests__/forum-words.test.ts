import { countWords, htmlToPlainText, plainTextToHtml } from "../index";

describe("countWords — v1 semantics, carried verbatim", () => {
  it("strips tags and named entities, collapses whitespace", () => {
    expect(countWords("<p>one two</p><p>three</p>")).toBe(3);
    expect(countWords("one&nbsp;two")).toBe(2);
    expect(countWords("   ")).toBe(0);
    expect(countWords("")).toBe(0);
  });

  it("still does not handle numeric entities (v1 R10) — pinned, not fixed", () => {
    // v1's entity rule is /&[a-z]+;/i, which cannot match "&#160;" ('#' is not
    // a letter), so the whole run is one token. The live counter and the
    // server gate must agree; changing this on one side gives a student an
    // enabled button the server refuses.
    expect(countWords("one&#160;two")).toBe(1);
  });

  it("counts the same words before and after the stored-HTML round trip", () => {
    // The server gates on the plain text the client typed; v1 counts the stored
    // HTML. Plan 12's converters (ruling X3) must not change the answer.
    // (No bare "&": the plain text counts it as a word, the stored "&amp;" is
    // stripped as an entity — the server gates on the plain text, so that is
    // the count that matters.)
    const text = "first line here\nsecond line";
    expect(countWords(plainTextToHtml(text))).toBe(countWords(text));
    expect(htmlToPlainText(plainTextToHtml(text))).toBe(text);
  });
});
