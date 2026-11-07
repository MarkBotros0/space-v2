import { APP_STORE_BADGE, GOOGLE_PLAY_BADGE, JPC_LOGO } from "./email-assets";

/**
 * The emails' HTML, drawn with the mobile app's design system (owner,
 * 2026-11-07): its tokens (tokens.json), the 16 radius of a card and 14 of a
 * control, the system font, navy text with the teal accent, the logo mark in
 * the header and the stores' own badges (inline cid images, email-assets.ts).
 * Email clients take inline styles and tables only, so the values are literals.
 *
 * Light first, with the app's dark tokens behind prefers-color-scheme for the
 * clients that honour it (Apple Mail, Outlook). Gmail on iOS ignores the media
 * query and inverts every email in dark mode, a dark one included: the old
 * all-dark design came out as a lavender card on a pale page. A light design
 * with no large navy fills inverts cleanly to a dark one instead.
 *
 * Every interpolation the caller doesn't control is escaped by the caller
 * (ruling C11); these helpers take strings that are already safe.
 */

const T = {
  page: "#F4F6FB", // background
  card: "#FFFFFF", // surface
  text: "#142048", // foreground
  muted: "#4B5878", // muted-foreground
  line: "#DCE2EF", // separator
  info: "#2E7679", // info
  infoSoft: "#E2F4F5", // info-soft
  field: "#E9EDF5", // neutral-soft
  button: "#142048", // primary
  buttonText: "#FFFFFF", // primary-foreground
} as const;

/** The same roles in the app's dark tokens, keyed by the class each element carries. */
const DARK_CSS = `
  @media (prefers-color-scheme: dark) {
    .e-page { background-color:#0B1230 !important; }
    .e-card { background-color:#16204A !important; border-color:#2A3A63 !important; }
    .e-text { color:#ECEFF7 !important; }
    .e-muted { color:#ABB7D4 !important; }
    .e-line { border-color:#2A3A63 !important; }
    .e-field { background-color:#222E58 !important; color:#ECEFF7 !important; }
    .e-disc { background-color:#103436 !important; color:#7DCED1 !important; }
    .e-btn { background-color:#7DCED1 !important; }
    .e-btn-text { color:#103436 !important; }
  }`;

const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
const MONO = `ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`;

/** Either may be missing: the store pages don't exist until the app is published. */
export interface StoreLinks {
  appStore: string | null;
  googlePlay: string | null;
}

/**
 * Both stores' official badges (40 tall, side by side, wrapping on a narrow
 * phone), always. A badge with a link opens its store; one without is shown
 * unlinked and the copy says it is coming soon (owner, 2026-11-07: the app is
 * TestFlight-only, so no store page exists yet, and a made-up link would send
 * people to a dead page). Setting APP_STORE_URL / PLAY_STORE_URL turns them on.
 */
export function storeLinksHtml(links: StoreLinks): string {
  const badge = (href: string | null, cid: string, alt: string, width: number) => {
    const img = `<img src="cid:${cid}" alt="${alt}" width="${width}" height="40" style="display:block;border:0;height:40px;width:${width}px;">`;
    return href
      ? `<a href="${href}" style="display:inline-block;margin:0 10px 10px 0;text-decoration:none;">${img}</a>`
      : `<span style="display:inline-block;margin:0 10px 10px 0;">${img}</span>`;
  };
  const neither = !links.appStore && !links.googlePlay;
  const missing = !links.appStore ? "the App Store" : !links.googlePlay ? "Google Play" : null;
  const heading = neither ? "Coming soon to your phone" : "Don't have the app yet?";
  const lead = neither
    ? "JPC Space is coming soon to the App Store and Google Play."
    : `Get JPC Space on your phone first, then come back to this email.${missing ? ` Coming soon to ${missing}.` : ""}`;
  return `<div class="e-line" style="margin:12px 0 0 0;padding-top:24px;border-top:1px solid ${T.line};">
    <p class="e-text" style="margin:0 0 4px 0;font-size:16px;font-weight:600;line-height:1.4;color:${T.text};">${heading}</p>
    <p class="e-muted" style="margin:0 0 16px 0;font-size:14px;line-height:1.5;color:${T.muted};">${lead}</p>
    ${badge(links.appStore, APP_STORE_BADGE.cid, "Download on the App Store", 120)}${badge(links.googlePlay, GOOGLE_PLAY_BADGE.cid, "Get it on Google Play", 135)}
  </div>`;
}

/** The page, the card, the wordmark, a title over a one-line lead, the body and a quiet footer. */
export function renderShell(title: string, lead: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${title}</title>
  <style>${DARK_CSS}
  </style>
</head>
<body class="e-page" style="margin:0;padding:0;background-color:${T.page};font-family:${FONT};color:${T.text};">
  <table role="presentation" class="e-page" width="100%" cellpadding="0" cellspacing="0" style="background-color:${T.page};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;table-layout:fixed;">
        <tr><td style="padding:0 4px 20px 4px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:12px;"><img src="cid:${JPC_LOGO.cid}" alt="" width="40" height="40" style="display:block;border:0;width:40px;height:40px;border-radius:10px;"></td>
            <td class="e-text" style="font-size:18px;font-weight:700;color:${T.text};">JPC Space</td>
          </tr></table>
        </td></tr>
        <tr><td class="e-card" style="background-color:${T.card};border:1px solid ${T.line};border-radius:16px;padding:28px 24px 24px 24px;">
          <h1 class="e-text" style="margin:0 0 8px 0;font-size:26px;line-height:1.25;font-weight:700;color:${T.text};">${title}</h1>
          <p class="e-muted" style="margin:0 0 24px 0;font-size:16px;line-height:1.5;color:${T.muted};">${lead}</p>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:20px 8px 0 8px;text-align:center;">
          <p class="e-muted" style="margin:0;font-size:12px;line-height:1.5;color:${T.muted};">
            JPC Space &middot; Jesus Project Community &middot; &copy; ${new Date().getFullYear()}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function paragraph(html: string, muted = false): string {
  return `<p class="${muted ? "e-muted" : "e-text"}" style="margin:0 0 16px 0;font-size:${muted ? 14 : 16}px;line-height:1.6;color:${muted ? T.muted : T.text};">${html}</p>`;
}

/** The primary action: the app's primary button (14 radius, 48 tall). */
export function buttonHtml(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;"><tr><td class="e-btn" style="background-color:${T.button};border-radius:14px;">
    <a class="e-btn-text" href="${href}" style="display:inline-block;padding:14px 24px;font-size:16px;font-weight:600;color:${T.buttonText};text-decoration:none;border-radius:14px;">${label}</a>
  </td></tr></table>`;
}

/** Numbered steps, each a teal disc and a line. */
export function stepsHtml(steps: string[]): string {
  const rows = steps
    .map(
      (step, i) => `<tr>
        <td valign="top" style="padding:0 12px 12px 0;width:28px;">
          <div class="e-disc" style="width:28px;height:28px;border-radius:14px;background-color:${T.infoSoft};color:${T.info};font-size:14px;font-weight:700;line-height:28px;text-align:center;">${i + 1}</div>
        </td>
        <td valign="top" class="e-text" style="padding:3px 0 12px 0;font-size:16px;line-height:1.5;color:${T.text};">${step}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px 0;">${rows}</table>`;
}

/**
 * The code in groups of four, each an unbreakable inline block, so a long code
 * wraps between groups into an even grid and never leaves one character on a
 * line of its own. The gaps are margins, not spaces: the copied text is the
 * code exactly, with nothing for the app's field to strip.
 */
export function codeGroupsHtml(code: string): string {
  const groups = code.match(/.{1,4}/g) ?? [];
  return groups
    .map((g) => `<span style="display:inline-block;white-space:nowrap;margin:0 10px 4px 0;">${g}</span>`)
    .join("");
}

/**
 * A code to copy: a caption, then the code in a field the way the app draws an
 * input (neutral fill, 14 radius), in groups of four, four groups to a row (236 wide). An email can't run a Copy
 * button (mail apps strip scripts), so one tap selects the whole code
 * (user-select: all) and the hint under it says so (owner, 2026-11-07).
 */
export function codeBoxHtml(label: string, code: string): string {
  return `<div style="margin:8px 0 20px 0;">
    <p class="e-muted" style="margin:0 0 8px 0;font-size:14px;font-weight:600;line-height:1.4;color:${T.muted};">${label}</p>
    <div class="e-field" style="padding:14px 6px 10px 16px;border-radius:14px;background-color:${T.field};font-family:${MONO};font-size:18px;line-height:1.5;font-weight:600;color:${T.text};"><span style="display:inline-block;max-width:236px;-webkit-user-select:all;user-select:all;">${codeGroupsHtml(code)}</span></div>
    <p class="e-muted" style="margin:8px 0 0 0;font-size:13px;line-height:1.5;color:${T.muted};">Tap the code to select all of it, then Copy.</p>
  </div>`;
}

export const INVITE_SUBJECT = "You're invited to JPC Space";

/** The invite: what to do in three steps, the code, and when it runs out. */
export function buildInviteHtml(code: string, expiresText: string, stores: StoreLinks): string {
  const body = `
    ${stepsHtml([
      "Open the <strong>JPC Space</strong> app on your phone.",
      "On the sign-in screen, tap <strong>&ldquo;I have an invite code&rdquo;</strong>.",
      "Copy the code below, paste it in, then choose your password.",
    ])}
    ${codeBoxHtml("Your invite code", code)}
    ${paragraph(`The code works once and expires on ${expiresText}. If it runs out, ask whoever invited you to send a new one.`, true)}
    ${storeLinksHtml(stores)}
  `;
  return renderShell("Welcome to JPC Space", "You've been invited to join the Jesus Project Community.", body);
}

/** The password reset: the button into the app, the code as a fallback, and the reassurance. */
export function buildPasswordResetHtml(
  link: string,
  code: string,
  ttlMinutes: number,
  expiresText: string,
  stores: StoreLinks,
): string {
  const body = `
    ${paragraph("On your phone, tap the button to choose a new password in the app.")}
    ${buttonHtml(link, "Reset password in the app")}
    ${paragraph(`Button not working? Open the app, choose <strong>&ldquo;Forgot password?&rdquo;</strong> then <strong>&ldquo;I have a reset code&rdquo;</strong>, and paste:`, true)}
    ${codeBoxHtml("Your reset code", code)}
    ${paragraph(`This code works once and expires in ${ttlMinutes} minutes (at ${expiresText}).`, true)}
    ${paragraph("If you didn't ask for this, you can ignore this email. Your password stays the same.", true)}
    ${storeLinksHtml(stores)}
  `;
  return renderShell("Reset your password", "We received a request to reset the password for your JPC Space account.", body);
}
