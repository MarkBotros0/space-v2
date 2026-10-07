import { buildNotificationHtml } from "../lib/email";
import { escapeHtml } from "../lib/html";

describe("lib/html", () => {
  it("is the shared escaper, not a second copy (ruling X2)", () => {
    expect(escapeHtml("<b>&</b>")).toBe("&lt;b&gt;&amp;&lt;/b&gt;");
  });
});

describe("buildNotificationHtml", () => {
  it("escapes the title — v1 interpolated it into an <h1> untouched", () => {
    const html = buildNotificationHtml("<script>alert(1)</script>", null, null);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes the body", () => {
    const html = buildNotificationHtml("Follow-up flagged", "<img src=x onerror=alert(1)>", null);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("escapes the link before it lands in an href attribute", () => {
    const html = buildNotificationHtml("Title", null, `https://x.test/a"onmouseover="alert(1)`);
    expect(html).not.toContain(`"onmouseover="`);
  });
});
