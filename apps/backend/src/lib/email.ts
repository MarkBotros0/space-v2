import nodemailer, { type Transporter } from "nodemailer";

import { config } from "./config";

const NAVY = "#1F3260";
const TEAL_LIGHT = "#7DCED1";
const BG = "#f5f5f5";
const CARD = "#ffffff";
const TEXT = "#333333";
const BORDER = "#e0e0e0";

let cachedTransporter: Transporter | null = null;
let warnedUnconfigured = false;

function isConfigured(): boolean {
  return Boolean(config.gmailUser && config.gmailAppPassword);
}

function getTransporter(): Transporter {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: config.gmailUser, pass: config.gmailAppPassword },
    });
  }
  return cachedTransporter;
}

function fromAddress(): string {
  return `JPC Space <${config.gmailUser}>`;
}

// renderShell is copied verbatim from jpc-space/src/lib/email.ts so the
// outer mail shell is visually identical across the two backends during the
// transition. buttonHtml is NOT a copy: v1 renders a centered teal button
// plus a raw-URL fallback paragraph; this renders a single inline navy link
// with no fallback. The simplification is deliberate — not a parity bug.
function renderShell(title: string, subtitle: string, bodyHtml: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: ${BG}; font-family: Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: ${CARD}; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
      <div style="background-color: ${NAVY}; padding: 30px; text-align: center;">
        <h1 style="color: #ffffff; font-size: 24px; margin: 0 0 5px 0;">${title}</h1>
        <p style="color: ${TEAL_LIGHT}; font-size: 14px; margin: 0;">${subtitle}</p>
      </div>
      <div style="padding: 40px 30px;">
        ${bodyHtml}
      </div>
      <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid ${BORDER};">
        <p style="font-size: 12px; color: #999999; margin: 0;">
          &copy; ${new Date().getFullYear()} Jesus Project Community &mdash; JPC Space
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function buttonHtml(href: string, label: string): string {
  return `<p style="margin: 0;"><a href="${href}" style="display: inline-block; background-color: ${NAVY}; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 15px;">${label}</a></p>`;
}

/**
 * Best-effort notification email.
 *
 * Divergence from v1: v1 threw when the transport was unconfigured and every
 * caller swallowed it. Returning early instead keeps the observable behaviour
 * (no mail, no crash) without minting an Error per recipient, and warns once so
 * a misconfigured deploy is visible in the log.
 */
export async function sendNotificationEmail(
  email: string,
  title: string,
  body: string | null,
  link: string | null,
): Promise<void> {
  if (!isConfigured()) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn(
        "[email] GMAIL_USER/GMAIL_APP_PASSWORD are unset — notification emails are disabled. In-app notifications are unaffected.",
      );
    }
    return;
  }

  const appUrl = (config.authUrl ?? "").replace(/\/$/, "");
  const viewLink = appUrl ? `${appUrl}${link ?? ""}` : null;

  const bodyHtml = `
    <p style="font-size: 16px; color: ${TEXT}; line-height: 1.6; margin: 0 0 24px 0;">
      ${body ?? "You have a new notification in JPC Space."}
    </p>
    ${viewLink ? buttonHtml(viewLink, "View in JPC Space") : ""}
  `;

  await getTransporter().sendMail({
    from: fromAddress(),
    to: email,
    subject: `JPC Space — ${title}`,
    html: renderShell(title, "Jesus Project Community", bodyHtml),
  });
}
