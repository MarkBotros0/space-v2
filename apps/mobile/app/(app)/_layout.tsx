import { Redirect, Stack, useSegments } from "expo-router";

import { ScreenErrorBoundary } from "../../src/design/layout/error-boundary";
import { ShellHeader } from "../../src/design/layout/shell-header";
import { isBlockedForAlumni } from "../../src/lib/alumni-guard";
import { useSessionStore } from "../../src/store/session";

/** A detail screen that throws while rendering shows a retry, not a crashed app. */
export const ErrorBoundary = ScreenErrorBoundary;

/**
 * A cold deep link to a detail screen (`/student/12`, a notification tap)
 * still gets the tabs underneath it, so Back lands on a tab rather than
 * leaving the app. The tab it lands on is Home, the tabs' own anchor.
 */
export const unstable_settings = { anchor: "(tabs)" };

/**
 * Detail routes: reachable by navigation, never tabs. They are not in any
 * nav's hrefs, so the tabs' ALL_ROUTE_NAMES cannot know about them; they sit
 * in this directory, outside `(tabs)/`, and push onto this stack above the
 * tabs. Every route file under (app)/ outside `(tabs)/` is listed here;
 * app-layout.test.tsx reads the filesystem and fails if one is missing.
 * Plans add a detail route by appending to this list — nothing else.
 */
export const DETAIL_ROUTE_NAMES: readonly string[] = [
  "assignment/[id]/index",
  "assignment/[id]/edit",
  "assignment/new",
  "group/[id]/index",
  "submission/[publicId]",
  "session/[id]/attendance",
  "session/[id]/index",
  "seasons/[code]/index",
  "seasons/[code]/edit",
  "seasons/new",
  "seasons/[code]/roster/index",
  "seasons/[code]/roster/import",
  "group/new",
  "group/[id]/edit",
  "session/new",
  "session/[id]/edit",
  "quiz/[id]/index",
  "quiz/[id]/grade",
  "quiz/new",
  "quiz/[id]/edit",
  "student/[id]/index",
  "student/[id]/edit",
  "students/new",
  "users/new",
  "users/import",
  "user/[id]",
  "event/[id]",
];

/**
 * Detail screens slide in from the right and swipe back from anywhere on the
 * screen. They keep the shell's top bar and offline strip as their header
 * until the Screen frame owns the top inset (ruling R9).
 */
export const DETAIL_SCREEN_OPTIONS = {
  animation: "slide_from_right",
  gestureEnabled: true,
  fullScreenGestureEnabled: true,
  header: () => <ShellHeader />,
} as const;

/** The tabs draw their own header (the shell's top bar) per tab. */
const TABS_SCREEN_OPTIONS = { headerShown: false } as const;

/**
 * `(app)/_layout.tsx` — the signed-in area: a `Stack` with the tabs
 * (`(tabs)/_layout.tsx`, the `Tabs` navigator and the pill) at the bottom
 * and every detail route pushed above them, so Back returns to the screen a
 * detail was opened from. Groups add no URL segment: `/settings` and
 * `/student/12` are the same URLs they were when everything was one `Tabs`.
 *
 * The anonymous redirect and the alumni guard live here, above both
 * navigators, so they cover detail routes as well as tabs.
 */
export default function AppLayout() {
  const status = useSessionStore((s) => s.status);
  const isAlumnus = useSessionStore((s) => s.user?.role === "STUDENT" && s.scopes?.graduationYear != null);
  const segments = useSegments();

  // The boot gate (Task 6, app/_layout.tsx) has already resolved "idle" and
  // "restoring" by the time this mounts — the only unauthenticated status
  // this can see is "anonymous".
  if (status === "anonymous") return <Redirect href="/login" />;

  // v1 role-layout.tsx: an alumnus is kept out of the active-student area and sent
  // to the read-only portal (here: Home). Reaching a student-only destination by
  // deep link or stale navigation state lands here (REG-81). A tab's segments
  // carry the "(tabs)" group; isBlockedForAlumni skips groups.
  if (isAlumnus && isBlockedForAlumni(segments)) return <Redirect href="/dashboard" />;

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={TABS_SCREEN_OPTIONS} />
      {DETAIL_ROUTE_NAMES.map((name) => (
        <Stack.Screen key={name} name={name} options={DETAIL_SCREEN_OPTIONS} />
      ))}
    </Stack>
  );
}
