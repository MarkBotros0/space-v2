import { escapeHtml, htmlToPlainText, plainTextToHtml } from "../index";

describe("escapeHtml — the one escaper (ruling X2)", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;",
    );
  });
});

describe("plainTextToHtml — the write half", () => {
  it("escapes markup so nothing a caller sends can execute in v1's raw render", () => {
    expect(plainTextToHtml("<script>alert(1)</script>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
  });

  it("wraps each line in a paragraph so v1's reader still renders it as prose", () => {
    expect(plainTextToHtml("first\nsecond")).toBe("<p>first</p><p>second</p>");
  });

  it("escapes ampersands and quotes", () => {
    expect(plainTextToHtml(`Tom & "Jerry"`)).toBe("<p>Tom &amp; &quot;Jerry&quot;</p>");
  });
});

describe("htmlToPlainText — the read half", () => {
  it("round-trips what the write half stored", () => {
    const original = `Tom & "Jerry"\nsecond line`;
    expect(htmlToPlainText(plainTextToHtml(original))).toBe(original);
  });

  it("renders v1's TipTap rows as readable text with the tags gone", () => {
    expect(htmlToPlainText("<p>Legacy &amp; <b>bold</b></p><p>second line</p>")).toBe(
      "Legacy & bold\nsecond line",
    );
  });

  it("turns <br> into a line break rather than joining words", () => {
    expect(htmlToPlainText("<p>one<br>two</p>")).toBe("one\ntwo");
  });

  it("decodes non-breaking spaces in both spellings to a plain space", () => {
    expect(htmlToPlainText("<p>one&nbsp;two&#160;three</p>")).toBe("one two three");
  });

  it("leaves no angle bracket behind for any sink to interpret", () => {
    expect(htmlToPlainText("<p>a</p><script>alert(1)</script>")).not.toContain("<");
  });

  it("decodes &amp; last, so an escaped entity does not become a live one", () => {
    // "&amp;lt;" is the stored form of the literal text "&lt;". Decoding &amp;
    // first would yield "&lt;" and a second pass would turn it into "<".
    expect(htmlToPlainText("<p>&amp;lt;</p>")).toBe("&lt;");
  });
});
