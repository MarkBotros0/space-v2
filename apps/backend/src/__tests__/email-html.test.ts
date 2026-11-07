import { buildNotificationHtml, inlineAttachments } from "../lib/email";
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
    // The logo is an <img> of ours; the injected one must not be.
    expect(html).not.toContain("<img src=x");
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

  it("is drawn dark, so a mail app's dark mode has nothing to invert", () => {
    const html = buildInviteHtml("C", "soon", none);
    expect(html).not.toMatch(/background-color:#1F3260/i);
    expect(html).toContain('name="color-scheme" content="dark"');
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

describe("the code box", () => {
  it("selects the whole code in one tap and says how to copy it", () => {
    const html = buildInviteHtml("CODE-abc_123", "soon", { appStore: null, googlePlay: null });
    expect(html).toContain("user-select:all");
    expect(html).toContain("Tap the code to select all of it, then Copy.");
  });
});

describe("inline images", () => {
  it("attach the logo always, and a store badge only when its link is shown", () => {
    const without = inlineAttachments(buildInviteHtml("C", "soon", { appStore: null, googlePlay: null }));
    expect(without.map((a) => a.cid)).toEqual(["jpc-logo"]);
    const withApple = inlineAttachments(
      buildInviteHtml("C", "soon", { appStore: "https://apps.example.test/jpc", googlePlay: null }),
    );
    expect(withApple.map((a) => a.cid)).toEqual(["jpc-logo", "app-store-badge"]);
    expect(withApple[0]!.content.subarray(1, 4).toString()).toBe("PNG");
  });
});
