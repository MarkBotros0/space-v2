import nodemailer, { type Transporter } from "nodemailer";

// Value import — relative (ruling X12).
import { PASSWORD_RESET_TTL_MINUTES } from "../../../../packages/shared/src/index";

import { config } from "./config";
import { INLINE_IMAGES } from "./email-assets";
import {
  INVITE_SUBJECT,
  buildInviteHtml,
  buildNotificationBody,
  buildPasswordResetHtml,
  renderShell,
  type StoreLinks,
} from "./email-templates";
import { escapeHtml } from "./html";
import { formatInOrgTime } from "./org-time";

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

/** Every email goes out with the inline images its HTML uses. */
function sendHtml(to: string, subject: string, html: string) {
  return getTransporter().sendMail({
    from: fromAddress(),
    to,
    subject,
    html,
    attachments: inlineAttachments(html),
  });
}

function fromAddress(): string {
  return `JPC Space <${config.gmailUser}>`;
}

/**
 * The notification email's body, as a pure function so the escaping is
 * testable without a transport.
 *
 * Ruling C11: v1 interpolated a notification's title and body straight into
 * this HTML (jpc-space/src/lib/email.ts:145-150). The worst case it enabled is
 * spec D2 — the first 140 characters of a pastoral note, raw HTML and possibly
 * cut mid-tag, mailed to every season admin. v2 does not put note content in a
 * notification at all (see routes/notes.ts), and escapes regardless, because
 * "no caller currently passes markup" is not a property anyone can maintain.
 */
export function buildNotificationHtml(
  title: string,
  body: string | null,
  viewLink: string | null,
): string {
  const bodyHtml = buildNotificationBody(
    escapeHtml(body ?? "You have a new notification in JPC Space."),
    viewLink ? escapeHtml(viewLink) : null,
    storeLinks(),
  );
  return renderShell(escapeHtml(title), "Jesus Project Community", bodyHtml);
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

  await sendHtml(email, `JPC Space — ${title}`, buildNotificationHtml(title, body, viewLink));
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

  await sendHtml(email, INVITE_SUBJECT, buildInviteHtml(code, formatInOrgTime(expiresAt), storeLinks()));
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
  await sendHtml(email, "JPC Space — Password Reset", buildPasswordResetHtml(
      link,
      code,
      PASSWORD_RESET_TTL_MINUTES,
      formatInOrgTime(expiresAt),
      storeLinks(),
    ));
}
