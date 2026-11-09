import { conflict, errRef, errorResponse, ok } from "../helpers";

/** `/health` and `/api/v1/auth/*`. Assembled into the document by `../openapi.ts`. */
export const authPaths = {
  "/health": {
    get: {
      tags: ["Health"],
      summary: "Liveness plus a database round-trip",
      security: [],
      responses: {
        200: ok(
          { type: "object", properties: { status: { type: "string", example: "ok" } } },
          "Service and database are reachable.",
        ),
        503: { description: "Database unreachable.", content: { "application/json": { schema: errorResponse } } },
      },
    },
  },

  "/api/v1/auth/login": {
    post: {
      tags: ["Auth"],
      summary: "Exchange credentials for a token pair",
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["email", "password"],
              properties: {
                email: { type: "string", format: "email" },
                password: { type: "string", minLength: 1 },
              },
            },
          },
        },
      },
      responses: {
        200: ok(
          {
            allOf: [
              { $ref: "#/components/schemas/Session" },
              { type: "object", properties: { user: { $ref: "#/components/schemas/AuthUser" } } },
            ],
          },
          "Authenticated.",
        ),
        400: errRef("BadRequest"),
        401: {
          description:
            "`invalid_credentials` — deliberately identical whether the email is unknown or the password is wrong.",
          content: { "application/json": { schema: errorResponse } },
        },
        429: errRef("TooManyRequests"),
      },
    },
  },
  "/api/v1/auth/google": {
    post: {
      tags: ["Auth"],
      summary: "Sign in with a Google ID token",
      description:
        "Signs in the existing account whose address Google has verified; never creates one. A 404 while `GOOGLE_CLIENT_IDS` is unset.",
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["idToken"],
              properties: { idToken: { type: "string", minLength: 1, maxLength: 8192 } },
            },
          },
        },
      },
      responses: {
        200: ok(
          {
            allOf: [
              { $ref: "#/components/schemas/Session" },
              { type: "object", properties: { user: { $ref: "#/components/schemas/AuthUser" } } },
            ],
          },
          "Authenticated.",
        ),
        400: {
          description:
            "`bad_request`, or `invalid_google_token` when Google's signature, issuer, audience, expiry or verified email doesn't hold.",
          content: { "application/json": { schema: errorResponse } },
        },
        403: {
          description:
            "`no_account` — no live account uses this Google address. Its message points to the invite code and never says the address isn't invited.",
          content: { "application/json": { schema: errorResponse } },
        },
        404: {
          description: "Google sign-in is not configured.",
          content: { "application/json": { schema: errorResponse } },
        },
        429: errRef("TooManyRequests"),
      },
    },
  },
  "/api/v1/auth/refresh": {
    post: {
      tags: ["Auth"],
      summary: "Rotate a refresh token",
      description: "The presented token is revoked and a fresh pair issued. Reusing a rotated token fails.",
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["refreshToken"],
              properties: { refreshToken: { type: "string", minLength: 1 } },
            },
          },
        },
      },
      responses: {
        200: ok({ $ref: "#/components/schemas/Session" }, "A fresh token pair."),
        400: errRef("BadRequest"),
        401: {
          description: "`invalid_token` — unknown, revoked, or expired.",
          content: { "application/json": { schema: errorResponse } },
        },
        429: errRef("TooManyRequests"),
      },
    },
  },
  "/api/v1/auth/logout": {
    post: {
      tags: ["Auth"],
      summary: "Revoke a refresh token",
      description:
        "Idempotent: an unknown or already-revoked token also returns 200, so the response never discloses whether a token existed.",
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["refreshToken"],
              properties: { refreshToken: { type: "string", minLength: 1 } },
            },
          },
        },
      },
      responses: {
        200: ok({ type: "object", properties: { ok: { type: "boolean", example: true } } }, "Revoked, or already was."),
        400: errRef("BadRequest"),
        429: errRef("TooManyRequests"),
      },
    },
  },

  "/api/v1/auth/accept-invite": {
    post: {
      tags: ["Auth"],
      summary: "Accept an invite and set a first password",
      description:
        "Anonymous: possession of the invite code is the authorization, behind its own rate limiter (20 / 15 min per IP). The code is looked up by SHA-256 digest only. Consumed atomically (single use); sets a bcrypt cost-12 password hash. An invite activates an account, it never resets one: a target that already has a password, or is deactivated, is refused. **Every failure is the same `400 invalid_invite` body** (unknown, used, expired, already-activated or deactivated target) so the endpoint is not an existence oracle. Shape violations (missing token, password under 8 characters or over 72 bytes) are `400 bad_request`.",
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["token", "password"],
              properties: {
                token: {
                  type: "string",
                  minLength: 16,
                  maxLength: 128,
                  description: "The code from the invite email.",
                },
                password: { type: "string", minLength: 8, description: "At most 72 bytes (bcrypt)." },
              },
            },
          },
        },
      },
      responses: {
        200: ok(
          { type: "object", required: ["ok"], properties: { ok: { type: "boolean", example: true } } },
          "Activated; sign in with the new password.",
        ),
        400: conflict("`bad_request` (malformed body) or `invalid_invite` (any invite failure)."),
        429: errRef("TooManyRequests"),
      },
    },
  },

  "/api/v1/auth/forgot-password": {
    post: {
      tags: ["Auth"],
      summary: "Request a password-reset code",
      description:
        "Anonymous, behind its own rate limiter (10 / 15 min per IP). **Always answers `{ ok: true }`** for a well-formed body, whether or not the address exists, and the work runs after the response is sent, so neither the body nor the timing reveals the account. A malformed email is `400 bad_request`. Behind the response: nothing is minted for an unknown or deactivated account, or when no mail transport is configured; a second request for the same account within 60 s is ignored; a new code expires the previous one (one live reset per user). The code is v1's format (32 random bytes as 64 hex characters), stored only as its SHA-256 digest, valid for 60 minutes, and is delivered by email only.",
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } },
          },
        },
      },
      responses: {
        200: ok(
          { type: "object", required: ["ok"], properties: { ok: { type: "boolean", example: true } } },
          "Acknowledged.",
        ),
        400: errRef("BadRequest"),
        429: errRef("TooManyRequests"),
      },
    },
  },

  "/api/v1/auth/reset-password": {
    post: {
      tags: ["Auth"],
      summary: "Complete a password reset",
      description:
        "Anonymous: possession of the code is the authorization (20 / 15 min per IP). Tokens minted by v1 are accepted (same format and storage). The password is validated before the code is looked at, so a weak password consumes nothing. **Every code failure is the same `400 invalid_reset_token`** (unknown, used, expired, or deleted account). On success, in one transaction: a bcrypt cost-12 hash is written, the code is consumed (single use), every other outstanding reset code and live invite is expired, and every refresh token of the account is revoked. A never-activated account may reset, which activates it.",
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["token", "password"],
              properties: {
                token: { type: "string", minLength: 16, maxLength: 256 },
                password: { type: "string", minLength: 8, description: "At most 72 bytes (bcrypt)." },
              },
            },
          },
        },
      },
      responses: {
        200: ok(
          { type: "object", required: ["ok"], properties: { ok: { type: "boolean", example: true } } },
          "Password set; sign in.",
        ),
        400: conflict("`bad_request` (malformed body) or `invalid_reset_token`."),
        429: errRef("TooManyRequests"),
      },
    },
  },
} as const;
