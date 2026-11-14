import nodemailer, { type Transporter } from "nodemailer";

// Value import — relative (ruling X12).
import { PASSWORD_RESET_TTL_MINUTES } from "../../../../packages/shared/src/index";

import { config } from "./config";
import { INLINE_IMAGES } from "./email-assets";
import { INVITE_SUBJECT, buildInviteHtml, buildPasswordResetHtml, type StoreLinks } from "./email-templates";
import { buildInviteText, buildPasswordResetText } from "./email-text";
import { escapeHtml } from "./html";
import { formatInOrgTime } from "./org-time";

let cachedTransporter: Transporter | null = null;
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

/** The store pages, escaped: they come from the environment. */
function storeLinks(): StoreLinks {
  const { appStoreUrl, playStoreUrl } = config;
  return {
    appStore: appStoreUrl ? escapeHtml(appStoreUrl) : null,
    googlePlay: playStoreUrl ? escapeHtml(playStoreUrl) : null,
  };
}

/** The inline images an email's HTML refers to (cid:...), as attachments that travel with it. */
export function inlineAttachments(html: string) {
  return INLINE_IMAGES.filter((img) => html.includes(`cid:${img.cid}`)).map((img) => ({
    filename: img.filename,
    content: Buffer.from(img.base64, "base64"),
    contentType: "image/png",
    cid: img.cid,
  }));
}

/**
 * Every email goes out as HTML with a plain-text twin and only the inline images its HTML uses
 * (owner 2026-11-14: HTML-only mail with unused images went to spam).
 */
function sendMail(to: string, subject: string, html: string, text: string) {
  return getTransporter().sendMail({
    from: fromAddress(),
    to,
    subject,
    html,
    text,
    attachments: inlineAttachments(html),
  });
}

function fromAddress(): string {
  return `JPC Space <${config.gmailUser}>`;
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

  const expires = formatInOrgTime(expiresAt);
  // The text part takes the links as they are: escaping is for HTML.
  const rawStores = { appStore: config.appStoreUrl || null, googlePlay: config.playStoreUrl || null };
  await sendMail(
    email,
    INVITE_SUBJECT,
    buildInviteHtml(code, expires, storeLinks()),
    buildInviteText(code, expires, rawStores),
  );
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
  const expires = formatInOrgTime(expiresAt);
  await sendMail(
    email,
    "JPC Space — Password Reset",
    buildPasswordResetHtml(link, code, PASSWORD_RESET_TTL_MINUTES, expires, storeLinks()),
    buildPasswordResetText(code, PASSWORD_RESET_TTL_MINUTES, expires),
  );
}
