/**
 * The emails' HTML, drawn with the mobile app's design system (owner,
 * 2026-11-07): its light tokens (tokens.json), the 16 radius of a card and
 * 14 of a control, the system font, navy text with the teal accent. Email
 * clients take inline styles and tables only, so the values are literals here.
 *
 * Built to survive a mail app's dark mode: nothing important sits on a
 * coloured block (Gmail inverts a navy header into lavender), so the card is
 * white with navy text and only a thin teal bar carries the brand colour.
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
  teal: "#7DCED1", // secondary (brand teal)
  info: "#2E7679", // info / ring
  infoSoft: "#E2F4F5", // info-soft
  navy: "#142048", // primary
} as const;

const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
const MONO = `ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`;

/** Either may be missing: the store pages don't exist until the app is published. */
export interface StoreLinks {
  appStore: string | null;
  googlePlay: string | null;
}

/**
 * "Don't have the app yet?" and a button per store that has a link
 * (secondary: a light fill, navy text). Nothing at all while neither is set.
 */
export function storeLinksHtml(links: StoreLinks): string {
  if (!links.appStore && !links.googlePlay) return "";
  const pill = (href: string, label: string) =>
    `<a href="${href}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 16px;border:1px solid ${T.line};border-radius:14px;background-color:${T.page};font-size:14px;font-weight:600;color:${T.navy};text-decoration:none;">${label}</a>`;
  return `<div style="margin:8px 0 0 0;padding-top:20px;border-top:1px solid ${T.line};">
    <p style="margin:0 0 12px 0;font-size:14px;line-height:1.5;color:${T.muted};">Don't have the app yet? Get JPC Space first:</p>
    ${links.appStore ? pill(links.appStore, "Download on the App Store") : ""}${links.googlePlay ? pill(links.googlePlay, "Get it on Google Play") : ""}
  </div>`;
}

/** The page, the card, the wordmark, a title over a one-line lead, the body and a quiet footer. */
export function renderShell(title: string, lead: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:${T.page};font-family:${FONT};color:${T.text};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${T.page};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;table-layout:fixed;">
        <tr><td style="padding:0 4px 16px 4px;">
          <span style="font-size:16px;font-weight:700;color:${T.navy};letter-spacing:0.2px;">JPC Space</span>
          <span style="display:inline-block;width:8px;height:8px;border-radius:4px;background-color:${T.teal};margin-left:4px;"></span>
        </td></tr>
        <tr><td style="background-color:${T.card};border:1px solid ${T.line};border-radius:16px;overflow:hidden;">
          <div style="height:4px;background-color:${T.teal};font-size:0;line-height:0;">&nbsp;</div>
          <div style="padding:32px 28px;">
            <h1 style="margin:0 0 8px 0;font-size:24px;line-height:1.3;font-weight:700;color:${T.text};">${title}</h1>
            <p style="margin:0 0 24px 0;font-size:16px;line-height:1.5;color:${T.muted};">${lead}</p>
            ${bodyHtml}
          </div>
        </td></tr>
        <tr><td style="padding:20px 8px 0 8px;text-align:center;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:${T.muted};">
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
  return `<p style="margin:0 0 16px 0;font-size:${muted ? 14 : 16}px;line-height:1.6;color:${muted ? T.muted : T.text};">${html}</p>`;
}

/** The primary action: the app's primary button (navy, 14 radius, 48 tall). */
export function buttonHtml(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;"><tr><td style="background-color:${T.navy};border-radius:14px;">
    <a href="${href}" style="display:inline-block;padding:14px 24px;font-size:16px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:14px;">${label}</a>
  </td></tr></table>`;
}

/** Numbered steps, each a teal disc and a line. */
export function stepsHtml(steps: string[]): string {
  const rows = steps
    .map(
      (step, i) => `<tr>
        <td valign="top" style="padding:0 12px 12px 0;width:28px;">
          <div style="width:28px;height:28px;border-radius:14px;background-color:${T.infoSoft};color:${T.info};font-size:14px;font-weight:700;line-height:28px;text-align:center;">${i + 1}</div>
        </td>
        <td valign="top" style="padding:3px 0 12px 0;font-size:16px;line-height:1.5;color:${T.text};">${step}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px 0;">${rows}</table>`;
}

/** A code to copy: labelled, large, in the info callout, wrapping anywhere so it never overflows a phone. */
export function codeBoxHtml(label: string, code: string): string {
  return `<div style="margin:0 0 16px 0;padding:16px;border:1px solid ${T.info};border-radius:14px;background-color:${T.infoSoft};">
    <p style="margin:0 0 8px 0;font-size:12px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:${T.info};">${label}</p>
    <p style="margin:0;font-family:${MONO};font-size:20px;line-height:1.5;letter-spacing:1.5px;color:${T.text};word-break:break-all;overflow-wrap:anywhere;">${code}</p>
  </div>`;
}

export const INVITE_SUBJECT = "You're invited to JPC Space";

/** The invite: what to do in three steps, the code, and when it runs out. */
export function buildInviteHtml(code: string, expiresText: string, stores: StoreLinks): string {
  const body = `
    ${stepsHtml([
      "Open the <strong>JPC Space</strong> app on your phone.",
      "On the sign-in screen, tap <strong>&ldquo;I have an invite code&rdquo;</strong>.",
      "Paste the code below (press and hold it to copy), then choose your password.",
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

/** A notification: its body and, when there is one, the way to it. */
export function buildNotificationBody(
  bodyText: string,
  viewLink: string | null,
  stores: StoreLinks,
): string {
  return `${paragraph(bodyText)}${viewLink ? buttonHtml(viewLink, "View in JPC Space") : ""}${storeLinksHtml(stores)}`;
}
