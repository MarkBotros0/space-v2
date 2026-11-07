import { APP_STORE_BADGE, GOOGLE_PLAY_BADGE, JPC_LOGO } from "./email-assets";

/**
 * The emails' HTML, drawn with the mobile app's design system (owner,
 * 2026-11-07): its dark tokens (tokens.json; the owner preferred the dark version), the 16 radius of a card and
 * 14 of a control, the system font, light text with the teal accent, the
 * logo mark in the header and the stores' own badges (inline cid images,
 * email-assets.ts). Email clients take inline styles and tables only, so the
 * values are literals here.
 *
 * Dark by design, so a mail app's dark mode has nothing to invert (Gmail turned
 * the old navy header lavender), and it says so with color-scheme. A thin
 * teal bar carries the brand colour.
 *
 * Every interpolation the caller doesn't control is escaped by the caller
 * (ruling C11); these helpers take strings that are already safe.
 */

const T = {
  page: "#0B1230", // background (dark)
  card: "#16204A", // surface
  text: "#ECEFF7", // foreground
  muted: "#ABB7D4", // muted-foreground
  line: "#2A3A63", // separator
  teal: "#7DCED1", // secondary (brand teal)
  info: "#7DCED1", // info
  infoSoft: "#103436", // info-soft
  button: "#7DCED1", // primary
  buttonText: "#103436", // primary-foreground
} as const;

const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
const MONO = `ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`;

/** Either may be missing: the store pages don't exist until the app is published. */
export interface StoreLinks {
  appStore: string | null;
  googlePlay: string | null;
}

/**
 * "Don't have the app yet?" and each store's official badge that has a link
 * (40 tall, side by side, wrapping on a narrow phone). Nothing at all while
 * neither link is set.
 */
export function storeLinksHtml(links: StoreLinks): string {
  if (!links.appStore && !links.googlePlay) return "";
  const badge = (href: string, cid: string, alt: string, width: number) =>
    `<a href="${href}" style="display:inline-block;margin:0 10px 10px 0;text-decoration:none;"><img src="cid:${cid}" alt="${alt}" width="${width}" height="40" style="display:block;border:0;height:40px;width:${width}px;"></a>`;
  return `<div style="margin:12px 0 0 0;padding-top:24px;border-top:1px solid ${T.line};">
    <p style="margin:0 0 4px 0;font-size:16px;font-weight:600;line-height:1.4;color:${T.text};">Don't have the app yet?</p>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.5;color:${T.muted};">Get JPC Space on your phone first, then come back to this email.</p>
    ${links.appStore ? badge(links.appStore, APP_STORE_BADGE.cid, "Download on the App Store", 120) : ""}${links.googlePlay ? badge(links.googlePlay, GOOGLE_PLAY_BADGE.cid, "Get it on Google Play", 135) : ""}
  </div>`;
}

/** The page, the card, the wordmark, a title over a one-line lead, the body and a quiet footer. */
export function renderShell(title: string, lead: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:${T.page};font-family:${FONT};color:${T.text};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${T.page};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;table-layout:fixed;">
        <tr><td style="padding:0 4px 20px 4px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:12px;"><img src="cid:${JPC_LOGO.cid}" alt="" width="40" height="40" style="display:block;border:0;width:40px;height:40px;border-radius:10px;"></td>
            <td style="font-size:18px;font-weight:700;color:${T.text};letter-spacing:0.2px;">JPC Space</td>
          </tr></table>
        </td></tr>
        <tr><td style="background-color:${T.card};border:1px solid ${T.line};border-radius:16px;overflow:hidden;">
          <div style="height:4px;background-color:${T.teal};background-image:linear-gradient(90deg, ${T.teal}, ${T.infoSoft});font-size:0;line-height:0;">&nbsp;</div>
          <div style="padding:32px 24px 28px 24px;">
            <h1 style="margin:0 0 8px 0;font-size:28px;line-height:1.25;font-weight:800;letter-spacing:-0.3px;color:${T.text};">${title}</h1>
            <p style="margin:0 0 28px 0;font-size:16px;line-height:1.5;color:${T.muted};">${lead}</p>
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

/** The primary action: the app's primary button (teal, 14 radius, 48 tall). */
export function buttonHtml(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;"><tr><td style="background-color:${T.button};border-radius:14px;">
    <a href="${href}" style="display:inline-block;padding:14px 24px;font-size:16px;font-weight:600;color:${T.buttonText};text-decoration:none;border-radius:14px;">${label}</a>
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

/**
 * A code to copy: labelled, large, in the info callout, wrapping anywhere so it
 * never overflows a phone. An email can't run a Copy button (mail apps strip
 * scripts), so one tap selects the whole code (user-select: all) and the hint
 * under it says so (owner, 2026-11-07: a copy button for the codes).
 */
export function codeBoxHtml(label: string, code: string): string {
  return `<div style="margin:0 0 16px 0;padding:16px;border:1px solid ${T.info};border-radius:14px;background-color:${T.infoSoft};">
    <p style="margin:0 0 8px 0;font-size:12px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:${T.info};">${label}</p>
    <p style="margin:0;font-family:${MONO};font-size:20px;line-height:1.5;letter-spacing:1.5px;color:${T.text};word-break:break-all;overflow-wrap:anywhere;"><span style="-webkit-user-select:all;user-select:all;word-break:break-all;">${code}</span></p>
    <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:${T.muted};">Tap the code to select all of it, then Copy.</p>
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

/** A notification: its body and, when there is one, the way to it. */
export function buildNotificationBody(
  bodyText: string,
  viewLink: string | null,
  stores: StoreLinks,
): string {
  return `${paragraph(bodyText)}${viewLink ? buttonHtml(viewLink, "View in JPC Space") : ""}${storeLinksHtml(stores)}`;
}
