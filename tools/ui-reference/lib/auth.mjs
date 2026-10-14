/**
 * Auth.js v5 credentials sign-in without the UI: fetch a CSRF token, then
 * POST the dev-switch provider's form. The session cookie lands in the
 * browser context, so every page opened from it is signed in.
 */
export async function signInAs(context, baseUrl, email) {
  const req = context.request;
  const csrfRes = await req.get(`${baseUrl}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const res = await req.post(`${baseUrl}/api/auth/callback/dev-switch`, {
    form: { csrfToken, email, callbackUrl: `${baseUrl}/` },
    maxRedirects: 0,
  });
  if (res.status() >= 400) throw new Error(`dev-switch sign-in failed with HTTP ${res.status()}`);
  const cookies = await context.cookies(baseUrl);
  if (!cookies.some((c) => c.name.includes("session-token"))) {
    throw new Error("dev-switch sign-in returned no session cookie");
  }
}
