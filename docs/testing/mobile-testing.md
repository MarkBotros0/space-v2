# Testing the mobile app for free

Three ways, cheapest first. None needs a phone, a USB cable, an Apple account
or the Expo tunnel, and none costs money.

| Need                                         | Use                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------- |
| Click through screens right now              | [Web build](#1-web-build-on-your-laptop)                             |
| Automated regression checks on every PR      | [Maestro in GitHub Actions](#2-maestro-flows-android-emulator)       |
| See it on an iPhone-like device in a browser | [EAS simulator build + Appetize](#3-ios-simulator-build-on-appetize) |

## Test data

The shared staging database is v1's and is never used for testing. Everything
below uses a scratch local Postgres seeded by `apps/backend/scripts/seed-e2e.ts`:

| User    | Email                  | Password           | Role    |
| ------- | ---------------------- | ------------------ | ------- |
| Student | `student@e2e.jpc.test` | `e2e-password-123` | STUDENT |
| Admin   | `admin@e2e.jpc.test`   | `e2e-password-123` | ADMIN   |

The student is enrolled in the active season `e2e-season` with one session
("E2E Opening Session") and one assignment ("E2E Reflection"). The seed script
is idempotent and refuses to run against any non-local `DATABASE_URL`.

Local scratch database (needs Docker, or any local Postgres 16):

```bash
docker run -d --name space-e2e -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=e2e -p 5432:5432 postgres:16
cd apps/backend
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/e2e
export AUTH_SECRET=local-only-secret
pnpm db:generate
pnpm db:migrate:local   # applies prisma/migrations/*.sql with psql (needs psql installed)
pnpm seed:e2e
pnpm dev                # API on http://localhost:4000
```

If Docker isn't allowed on the laptop, run Postgres 16 any other way and point
`DATABASE_URL` at it, as long as the host is `localhost`.

## 1. Web build on your laptop

Runs in the laptop's browser over localhost, so the company network is
irrelevant. With the backend above running:

```bash
cd apps/mobile
EXPO_PUBLIC_API_BASE_URL=http://localhost:4000 npx expo start --web
```

Open the URL it prints (normally http://localhost:8081) and sign in as the
student. On web, tokens live in `localStorage` (`src/lib/token-storage.web.ts`)
because `expo-secure-store` has no web version.

Good for: layout, navigation, forms, data loading. Not representative of:
safe-area insets, keyboard behaviour, haptics, or anything native. For a static
build, `npx expo export -p web` writes `apps/mobile/dist`.

## 2. Maestro flows (Android emulator)

Flows live in `apps/mobile/.maestro/`:

- `01-login-error.yaml` wrong password shows the error
- `02-student-dashboard.yaml` sign-in lands on the dashboard with seeded data
- `03-submit-assignment.yaml` start, draft and submit an assignment
- `04-session-persists.yaml` still signed in after a cold restart

**In CI** (`.github/workflows/mobile-e2e.yml`) it runs on every PR touching
`apps/mobile`, `apps/backend` or `packages/shared`, and can be started by hand
from the Actions tab (Run workflow). It starts Postgres, migrates and seeds it,
boots the backend, builds a release APK pointed at `http://10.0.2.2:4000` (the
emulator's alias for the runner), and runs the flows on an API 34 emulator.
On failure the run uploads `maestro-failure` (Maestro's screenshots and logs,
the JUnit report and the backend log) from the run's Summary page. No secrets
are needed.

Cost: GitHub's free tier gives private repos 2,000 Linux minutes a month
(public repos are unlimited). Expect roughly 20 to 30 minutes per run, mostly
the Gradle build and emulator boot, so a busy private repo can exhaust it. The
workflow cancels superseded runs on the same branch and only fires on relevant
paths. If minutes run short, change `on: pull_request` to `workflow_dispatch`
only.

**Locally** you need an Android emulator, which a locked-down laptop may not
allow. If you can run one: build with `E2E_BUILD=1 EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:4000 npx expo prebuild --platform android`
then `cd android && ./gradlew assembleRelease`, install the APK, and run
`maestro test apps/mobile/.maestro`.

Flows are order-independent except that `03` consumes the seeded assignment;
re-run `pnpm seed:e2e` to reset.

## 3. iOS simulator build on Appetize

`apps/mobile/eas.json` has an `ios-simulator` profile. EAS builds simulator
apps on its free plan without an Apple Developer account (builds queue behind
paid ones, so expect a wait).

1. Create a free Expo account and run `npx eas-cli login` (or `eas login`).
2. In `eas.json`, replace `https://REPLACE-WITH-PUBLIC-STAGING-API` with an API
   URL that is reachable from the public internet. **Appetize runs in the
   cloud, so `localhost` will not work.** You need a hosted backend plus a
   database you are willing to seed with the test users above. Do not seed
   the shared staging database.
3. From `apps/mobile`: `eas build --platform ios --profile ios-simulator`.
   When it finishes, download the `.tar.gz` it produces.
4. Sign up at appetize.io (free tier, limited streaming minutes per month; check
   their current limits), upload the build, choose iPhone, and open the public
   link in a browser.

Until a public test API exists, step 2 is the blocker for this route. The web
build and Maestro cover the same flows without it.
