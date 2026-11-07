import { buildNotificationHtml } from "../lib/email";
import { buildInviteHtml, storeLinksHtml } from "../lib/email-templates";
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

// Owner 2026-11-07: the emails follow the app's design system, and say where to get the app.
describe("email templates", () => {
  const none = { appStore: null, googlePlay: null };

  it("walks an invitee through three steps to the code, which is labelled and wraps", () => {
    const html = buildInviteHtml("CODE-abc_123", "Nov 14, 2026, 7:21 AM", none);
    expect(html).toContain("I have an invite code");
    expect(html).toContain("Your invite code");
    expect(html).toContain("CODE-abc_123");
    expect(html).toContain("word-break:break-all");
    expect(html).toContain("Nov 14, 2026, 7:21 AM");
  });

  it("puts no brand colour behind the title, so a mail app's dark mode can't turn it lavender", () => {
    const html = buildInviteHtml("C", "soon", none);
    expect(html).not.toMatch(/background-color:#1F3260/i);
    expect(html).toContain('name="color-scheme" content="light"');
  });

  it("shows no store block while neither store link is set", () => {
    expect(storeLinksHtml(none)).toBe("");
    expect(buildInviteHtml("C", "soon", none)).not.toContain("Don't have the app yet?");
  });

  it("shows a button only for the store that has a link", () => {
    const html = storeLinksHtml({ appStore: "https://apps.example.test/jpc", googlePlay: null });
    expect(html).toContain("Don't have the app yet?");
    expect(html).toContain('href="https://apps.example.test/jpc"');
    expect(html).not.toContain("Google Play");
  });
});
