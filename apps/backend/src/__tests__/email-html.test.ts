import { buildNotificationHtml, inlineAttachments } from "../lib/email";
import { buildInviteHtml, codeGroupsHtml, storeLinksHtml } from "../lib/email-templates";
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

  it("walks an invitee through three steps to the code, which is labelled", () => {
    const html = buildInviteHtml("CODE-abc_123", "Nov 14, 2026, 7:21 AM", none);
    expect(html).toContain("I have an invite code");
    expect(html).toContain("Your invite code");
    expect(html).toContain("Nov 14, 2026, 7:21 AM");
  });

  // Gmail on iOS inverts even a dark email in dark mode (the old one came out lavender), so the
  // design is light with no navy fill, and the app's dark tokens sit behind the media query.
  it("is light with the app's dark tokens for clients that honour dark mode", () => {
    const html = buildInviteHtml("C", "soon", none);
    expect(html).toContain('name="color-scheme" content="light dark"');
    expect(html).toContain("@media (prefers-color-scheme: dark)");
    expect(html).not.toMatch(/background-color:#(1F3260|16204A)[;"]/i);
  });

  // Owner 2026-11-07: TestFlight-only for now, so both badges show, unlinked, as coming soon.
  it("shows both badges unlinked as coming soon while neither store link is set", () => {
    const html = storeLinksHtml(none);
    expect(html).toContain("coming soon to the App Store and Google Play");
    expect(html).toContain("cid:app-store-badge");
    expect(html).toContain("Get it on Google Play");
    expect(html).not.toContain("<a ");
    expect(buildInviteHtml("C", "soon", none)).not.toContain("Don't have the app yet?");
  });

  it("links only the store that has a link and says the other is coming soon", () => {
    const html = storeLinksHtml({ appStore: "https://apps.example.test/jpc", googlePlay: null });
    expect(html).toContain("Don't have the app yet?");
    expect(html).toContain('href="https://apps.example.test/jpc"');
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain("Get it on Google Play");
    expect(html).toContain("Coming soon to Google Play.");
  });

  it("says nothing is coming soon once both links are set", () => {
    const html = storeLinksHtml({ appStore: "https://a.example.test", googlePlay: "https://g.example.test" });
    expect(html.match(/<a /g)).toHaveLength(2);
    expect(html).not.toMatch(/coming soon/i);
  });
});

describe("the code box", () => {
  it("shows the code in groups of four, with no whitespace to copy", () => {
    expect(codeGroupsHtml("SJHUlxNsnGw81kpvVS")).toBe(
      ["SJHU", "lxNs", "nGw8", "1kpv", "VS"]
        .map((g) => `<span style="display:inline-block;white-space:nowrap;margin:0 10px 4px 0;">${g}</span>`)
        .join(""),
    );
    const html = buildInviteHtml("CODE-abc_123", "soon", { appStore: null, googlePlay: null });
    const selectable = html.match(/user-select:all;">(.*?)<\/span><\/div>/)![1]!;
    expect(selectable.replace(/<[^>]+>/g, "")).toBe("CODE-abc_123");
  });

  it("selects the whole code in one tap and says how to copy it", () => {
    const html = buildInviteHtml("CODE-abc_123", "soon", { appStore: null, googlePlay: null });
    expect(html).toContain("user-select:all");
    expect(html).toContain("Tap the code to select all of it, then Copy.");
  });
});

describe("inline images", () => {
  it("attach the logo and both store badges, linked or not", () => {
    const attached = inlineAttachments(buildInviteHtml("C", "soon", { appStore: null, googlePlay: null }));
    expect(attached.map((a) => a.cid)).toEqual(["jpc-logo", "app-store-badge", "google-play-badge"]);
    expect(attached[0]!.content.subarray(1, 4).toString()).toBe("PNG");
  });
});
