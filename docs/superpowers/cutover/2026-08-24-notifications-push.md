# Cutover — notifications: push device tokens, and the `link` columns

Written 2026-08-24 during Plan 13. **Do not apply while jpc-space is still
writing to this database** (`_DECISIONS.md` C1). Both migrations are additive
and neither breaks v1, but `prisma/migrations/` is a verbatim copy of v1's and
must stay that way until v1 stops.

## 1. Device tokens (unblocks push)

This section is written to match **Plan 18's M10 exactly** (Plan 18 Task 2.10
adopts this doc's SQL and deletes the duplicate — so the two must not differ).
`platform` is a Postgres enum, not free text:

```prisma
enum DevicePlatform { IOS ANDROID }

model DeviceToken {
  id         Int            @id @default(autoincrement())
  userId     Int
  user       User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  token      String         @unique           // Expo push token — a credential; never log it
  platform   DevicePlatform
  lastSeenAt DateTime       @default(now())
  createdAt  DateTime       @default(now())

  @@index([userId])
  @@index([lastSeenAt])
}
```

and on `User`, alongside `notifications` / `notificationPreference`:

```prisma
  deviceTokens DeviceToken[]
```

SQL:

```sql
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID');
CREATE TABLE "DeviceToken" (
  "id"         SERIAL PRIMARY KEY,
  "userId"     INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "token"      TEXT NOT NULL,
  "platform"   "DevicePlatform" NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");
CREATE INDEX "DeviceToken_lastSeenAt_idx" ON "DeviceToken"("lastSeenAt");
```

**Wire vs. column.** The request body keeps the lowercase wire value
(`"ios" | "android"`, `deviceRegistrationSchema` — what `Platform.OS` returns),
and the server maps it at the write with `DEVICE_PLATFORM_TO_DB` from
`packages/shared/src/notification.ts`. The client never learns the column's
spelling, so nothing on the device changes at cutover.

`token` is unique rather than `(userId, token)`: a device handed to a second
user must move, not accumulate — the upsert below re-points it.

Then replace the 503 in `apps/backend/src/routes/me.ts`'s `POST /devices` with:

```ts
  const user = requireUser(req);
  // Lowercase wire value → DevicePlatform enum (see "Wire vs. column" above).
  const platform = DEVICE_PLATFORM_TO_DB[parsed.data.platform];
  await db.deviceToken.upsert({
    where: { token: parsed.data.token },
    update: { userId: user.userId, platform, lastSeenAt: new Date() },
    create: { userId: user.userId, token: parsed.data.token, platform },
  });
  return apiOk(res, { registered: true });
```

and add `DELETE /api/v1/me/devices/:token` — `deleteMany({ where: { token, userId: user.userId } })`,
scoped to the caller so a token string is not a delete primitive for anyone
holding it.

Dispatch, to be written then, in `apps/backend/src/lib/push.ts`, called from
`createNotificationsBulk` beside the mail fan-out and behind the same
best-effort seam:

- recipients = targets minus `optedOut` (the same set the mail branch uses — a
  type the user turned off must not push either);
- gated on `shouldPush(payload.type)` (`packages/shared/src/notification.ts`,
  three types today);
- one batched POST to `https://exp.host/--/api/v2/push/send`, `Promise.allSettled`,
  never awaited into the request;
- drop tokens Expo reports as `DeviceNotRegistered`.

## 2. `Notification` target columns (spec D1)

Plan 18's M4 owns this migration (an uppercase Postgres enum
`NotificationEntityType` plus `entityId`). What this plan fixes for it is the
**mapping** and the **closed set of shapes**:

| Wire `entityType` (this plan) | Column value (M4) |
|---|---|
| `assignment` | `ASSIGNMENT` |
| `quiz` | `QUIZ` |
| `calendar` | `CALENDAR` |
| `student` | `STUDENT` |

The backfill must map exactly the five link shapes in
`NOTIFICATION_LINK_PATTERNS` (`apps/backend/src/lib/notification-target.ts`)
— `/student/assignments/:id`, `/student/quizzes`, `/student/calendar`,
`/admin/students/:id`, `/leader/students/:id` — and its result must equal
`parseNotificationLink`'s on a sample. The API keeps serving the lowercase wire
values after M4 (it maps the column back), so no client changes. After the
backfill, producers stop writing `link` and the parser becomes the backfill's
only remaining caller.

## 3. Also blocked on this migration (from the same spec)

- A push master switch on `NotificationPreference` (D5 item 3) — until then the
  OS permission is the master switch.
- `08-submissions.md` D14's submit→leader notification, which needs a new
  `NotificationType` enum value.
- D10's retention rule: hard-delete read notifications older than 180 days, as
  a scheduled job. Nothing has ever deleted a `Notification` (R53) and the
  100-row ceiling that hid the growth goes away with pagination.
