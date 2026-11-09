import { errRef, ok } from "../helpers";

/** Notifications, their preferences and devices; spread into `notesNotificationsPaths` (./notes-notifications.ts). */
export const notificationPaths = {
  "/api/v1/notifications": {
    get: {
      tags: ["Notifications"],
      summary: "The caller's notification inbox, newest first",
      description:
        "Returns only the caller's own rows (the user id comes from the token, never a parameter). **Performs no write** — it never marks anything read, however often the client refetches (ruling C6); use `POST /notifications/read`. Ordered by id descending; `nextCursor` is the id of the last row of the page, or null at the end. `unreadCount` is a real count over all of the caller's unread rows, not a filter over the page. `target` is derived from the stored v1 link in one server-side function.",
      parameters: [
        {
          name: "cursor",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1 },
          description: "`nextCursor` of the previous page.",
        },
        {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1, maximum: 50, default: 20 },
        },
        {
          name: "unreadOnly",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["true", "false"], default: "false" },
        },
      ],
      responses: {
        200: ok(
          {
            type: "object",
            required: ["items", "nextCursor", "unreadCount"],
            properties: {
              items: { type: "array", items: { $ref: "#/components/schemas/Notification" } },
              nextCursor: { type: ["integer", "null"] },
              unreadCount: { type: "integer", minimum: 0 },
            },
          },
          "One page of the inbox.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
      },
    },
  },
  "/api/v1/notifications/unread-count": {
    get: {
      tags: ["Notifications"],
      summary: "The caller's unread notification count (the badge)",
      description:
        "A single count over the caller's own unread rows. Separate from the list so rendering a badge never fetches rows.",
      responses: {
        200: ok(
          { type: "object", required: ["unreadCount"], properties: { unreadCount: { type: "integer", minimum: 0 } } },
          "The unread count.",
        ),
        401: errRef("Unauthorized"),
      },
    },
  },
  "/api/v1/notifications/read": {
    post: {
      tags: ["Notifications"],
      summary: "Mark notifications read (the explicit write)",
      description:
        "Body is exactly one of `{ ids: number[] }` (1–200) or `{ all: true }`; both together, an empty `ids`, or any other key (including `userId`) is `400 bad_request`. **`ids` is not an ownership assertion**: the update is scoped to the caller's own unread rows, so another user's id updates nothing and counts as zero. Idempotent — already-read rows are skipped and keep their original `readAt`; `marked` is the number of rows this call changed.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              oneOf: [
                {
                  type: "object",
                  required: ["ids"],
                  additionalProperties: false,
                  properties: {
                    ids: { type: "array", minItems: 1, maxItems: 200, items: { type: "integer", minimum: 1 } },
                  },
                },
                {
                  type: "object",
                  required: ["all"],
                  additionalProperties: false,
                  properties: { all: { type: "boolean", enum: [true] } },
                },
              ],
            },
          },
        },
      },
      responses: {
        200: ok(
          { type: "object", required: ["marked"], properties: { marked: { type: "integer", minimum: 0 } } },
          "How many rows this call marked.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
      },
    },
  },
  "/api/v1/me/notification-preferences": {
    get: {
      tags: ["Me"],
      summary: "Your notification preferences (all nine)",
      description:
        "Always returns all nine keys. A user with no stored row is opted in to everything — the row is created lazily on first save, so most users have none. The preference governs push only (notifications are never emailed); the in-app inbox row is always written.",
      responses: {
        200: ok(
          {
            type: "object",
            required: ["preferences"],
            properties: { preferences: { $ref: "#/components/schemas/NotificationPreferences" } },
          },
          "The caller's preferences.",
        ),
        401: errRef("Unauthorized"),
      },
    },
    put: {
      tags: ["Me"],
      summary: "Replace your notification preferences",
      description:
        "PUT, not PATCH: the body must carry all nine keys, so a partial body is `400 bad_request`. The row written is always the caller's (from the token); a `userId` in the body is ignored. Creates the row on first write.",
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/NotificationPreferences" } } },
      },
      responses: {
        200: ok(
          {
            type: "object",
            required: ["preferences"],
            properties: { preferences: { $ref: "#/components/schemas/NotificationPreferences" } },
          },
          "What was stored.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
      },
    },
  },
  "/api/v1/me/devices": {
    post: {
      tags: ["Me"],
      summary: "Register this device for push",
      description:
        "Upserts the Expo push token and points it at the caller, so a phone handed to another user moves with the sign-in. Calling it again only refreshes `lastSeenAt`. The token is a credential: it is never logged or returned.",
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/DeviceRegistration" } } },
      },
      responses: {
        200: ok(
          { type: "object", required: ["registered"], properties: { registered: { type: "boolean", enum: [true] } } },
          "Registered.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
      },
    },
  },
  "/api/v1/devices/unregister": {
    post: {
      tags: ["Me"],
      summary: "Unregister a device (no sign-in needed)",
      description:
        "Deletes the registration for this Expo push token. Needs no sign-in: the token is the proof, and the app must be able to stop pushes after a forced sign-out, when its session is already dead. The token travels in the body because paths reach access logs. Idempotent and opaque: an unknown token answers the same 200. Rate-limited.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["token"],
              additionalProperties: false,
              properties: { token: { type: "string", minLength: 1, maxLength: 200 } },
            },
          },
        },
      },
      responses: {
        200: ok(
          {
            type: "object",
            required: ["unregistered"],
            properties: { unregistered: { type: "boolean", enum: [true] } },
          },
          "Unregistered (or never registered).",
        ),
        400: errRef("BadRequest"),
        429: errRef("TooManyRequests"),
      },
    },
  },
} as const;
