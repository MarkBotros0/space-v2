import type { StoreLinks } from "./email-templates";

/**
 * The plain-text part of each email, sent beside the HTML (owner 2026-11-14: the emails went to
 * spam). An HTML-only message is a common spam signal, and some mail apps and screen readers show
 * only this part. The same words as the HTML, without the code's grouping, so it copies exactly.
 * Nothing here is HTML, so nothing is escaped; the inputs are the code, a date and the
 * environment's store links (none user-controlled).
 */

function storeLines(stores: StoreLinks): string[] {
  if (!stores.appStore && !stores.googlePlay) return ["JPC Space is coming soon to the App Store and Google Play."];
  return [
    "Don't have the app yet? Get JPC Space on your phone first:",
    ...(stores.appStore ? [`App Store: ${stores.appStore}`] : []),
    ...(stores.googlePlay ? [`Google Play: ${stores.googlePlay}`] : []),
  ];
}

const FOOTER = "JPC Space · Jesus Project Community";

export function buildInviteText(code: string, expiresText: string, stores: StoreLinks): string {
  return [
    "Welcome to JPC Space",
    "You've been invited to join the Jesus Project Community.",
    "",
    "1. Open the JPC Space app on your phone.",
    '2. On the sign-in screen, tap "I have an invite code".',
    "3. Paste the code below, then choose your password.",
    "",
    `Your invite code: ${code}`,
    "",
    `The code works once and expires on ${expiresText}. If it runs out, ask whoever invited you to send a new one.`,
    "",
    ...storeLines(stores),
    "",
    FOOTER,
  ].join("\n");
}

export function buildPasswordResetText(code: string, ttlMinutes: number, expiresText: string): string {
  return [
    "Reset your password",
    "We received a request to reset the password for your JPC Space account.",
    "",
    'Open the app, choose "Forgot password?" then "I have a reset code", and paste:',
    "",
    `Your reset code: ${code}`,
    "",
    `This code works once and expires in ${ttlMinutes} minutes (at ${expiresText}).`,
    "If you didn't ask for this, you can ignore this email. Your password stays the same.",
    "",
    FOOTER,
  ].join("\n");
}
