import nodemailer, { type Transporter } from "nodemailer";

// Value import — relative (ruling X12).
import { PASSWORD_RESET_TTL_MINUTES } from "../../../../packages/shared/src/index";

import { config } from "./config";
import { formatInOrgTime } from "./org-time";

const NAVY = "#1F3260";
const TEAL_LIGHT = "#7DCED1";
const BG = "#f5f5f5";
const CARD = "#ffffff";
const TEXT = "#333333";
const BORDER = "#e0e0e0";

let cachedTransporter: Transporter | null = null;
let warnedUnconfigured = false;
let warnedInviteUnconfigured = false;
let warnedResetUnconfigured = false;

function isConfigured(): boolean {
  return Boolean(config.gmailUser && config.gmailAppPassword);
}

/**
 * Public form of isConfigured, for callers that must refuse rather than mint
 * a credential nobody can receive — the bulk invite sender (Plan 10 Decision
 * 12) and the password-reset request (Decision 9).
 */
export function isEmailConfigured(): boolean {
  return isConfigured();
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

/**
 * The invite email. It delivers a CODE the recipient types (or pastes) into
 * the app's accept-invite screen — not a link. Spec 11 D10 recommends exactly
 * this for a mobile client: no token in any URL, browser history or Referer
 * (R24), and no possibility of mailing a link to a route that doesn't exist,
 * which is how v1's entire invite flow came to 404 (D1).
 *
 * Two interpolations, neither user-controlled: the code (base64url alphabet,
 * A–Z a–z 0–9 - _) and the expiry as formatted by formatInOrgTime (digits,
 * letters, spaces, punctuation from Intl). Neither can carry markup, so no
 * escaping is needed by construction (ruling C11). v1 interpolated the
 * inviter's display name here (spec 11 D10, R90); v2 does not put any name in
 * this mail. If one is ever added, it goes through Plan 12's escapeHtml.
 *
 * The real expiry is stated (spec 11 D10, R75) — v1 said "will expire soon".
 */
export async function sendInviteEmail(email: string, code: string, expiresAt: Date): Promise<void> {
  if (!isConfigured()) {
    // Decision 2: the code is NEVER logged, in any environment — NODE_ENV
    // defaults to "development", so a dev-only log line would leak live
    // credentials from any deploy that forgot to set it. Warn once, without
    // the code and without the address.
    if (!warnedInviteUnconfigured) {
      warnedInviteUnconfigured = true;
      console.warn(
        "[email] GMAIL_USER/GMAIL_APP_PASSWORD are unset — invite emails are disabled. Invites are still issued and recorded.",
      );
    }
    return;
  }

  const bodyHtml = `
    <p style="font-size: 16px; color: ${TEXT}; line-height: 1.6; margin: 0 0 16px 0;">
      You've been invited to JPC Space. Open the app, choose
      <strong>&ldquo;I have an invite code&rdquo;</strong>, and enter:
    </p>
    <p style="font-family: monospace; font-size: 18px; letter-spacing: 1px; background-color: ${BG}; border: 1px solid ${BORDER}; border-radius: 6px; padding: 12px 16px; margin: 0 0 16px 0; word-break: break-all;">
      ${code}
    </p>
    <p style="font-size: 14px; color: ${TEXT}; margin: 0;">
      This code can be used once and expires on ${formatInOrgTime(expiresAt)}.
    </p>
  `;

  await getTransporter().sendMail({
    from: fromAddress(),
    to: email,
    subject: "JPC Space — you're invited",
    html: renderShell("Welcome to JPC Space", "Jesus Project Community", bodyHtml),
  });
}

/**
 * The password-reset email (Plan 10 Decisions 9–10). It offers the app deep
 * link AND prints the code, because many mail clients don't linkify custom
 * schemes; the reset screen accepts either (and a pasted v1 web link).
 *
 * Interpolations: the code (hex — no markup possible), the scheme (validated
 * by config to [a-z0-9+.-]), the TTL constant, and formatInOrgTime's output.
 * None is user-controlled, so nothing needs escaping by construction (ruling
 * C11) — and no name is put in this mail.
 */
export async function sendPasswordResetEmail(email: string, code: string, expiresAt: Date): Promise<void> {
  if (!isConfigured()) {
    // Never the code, never the address (Plan 9 Decision 2's rule).
    if (!warnedResetUnconfigured) {
      warnedResetUnconfigured = true;
      console.warn("[email] GMAIL_USER/GMAIL_APP_PASSWORD are unset — password-reset emails are disabled.");
    }
    return;
  }

  const link = `${config.mobileAppScheme}://reset-password?token=${code}`;
  const bodyHtml = `
    <p style="font-size: 16px; color: ${TEXT}; line-height: 1.6; margin: 0 0 16px 0;">
      We received a request to reset the password for your JPC Space account.
      On your phone, tap the button to choose a new password in the app.
    </p>
    ${buttonHtml(link, "Reset password in the app")}
    <p style="font-size: 14px; color: ${TEXT}; margin: 16px 0 8px 0;">
      Or open the app, choose <strong>&ldquo;Forgot password?&rdquo;</strong> then
      <strong>&ldquo;I have a reset code&rdquo;</strong>, and paste:
    </p>
    <p style="font-family: monospace; font-size: 15px; background-color: ${BG}; border: 1px solid ${BORDER}; border-radius: 6px; padding: 12px 16px; margin: 0 0 16px 0; word-break: break-all;">
      ${code}
    </p>
    <p style="font-size: 14px; color: ${TEXT}; margin: 0 0 8px 0;">
      This code works once and expires in ${PASSWORD_RESET_TTL_MINUTES} minutes (at ${formatInOrgTime(expiresAt)}).
    </p>
    <p style="font-size: 14px; color: ${TEXT}; margin: 0;">
      If you didn't ask for this, you can ignore this email — your password stays the same.
    </p>
  `;

  await getTransporter().sendMail({
    from: fromAddress(),
    to: email,
    subject: "JPC Space — Password Reset",
    html: renderShell("Password Reset Request", "Jesus Project Community", bodyHtml),
  });
}
